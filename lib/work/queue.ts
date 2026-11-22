/*
 * 카드뉴스 대기 목록: 주제·링크를 한 줄씩 쌓아 두고, 버튼 하나로 차례대로 초안을 만든다.
 * 한 편마다 작업 화면과 똑같은 순서로 돈다: 기사 읽기 → 번역·사실 정리 → 장 구성.
 * 결과는 바로 적용하되 상태는 '아이디어' 그대로 둔다 (게시 전에 사람이 확인).
 */
import { aiDraft, readArticle } from '@/app/studio/work/actions'
import { uid } from './db'
import { applyPanelDraft, createEpisode, getEpisode, getSettings, patchEpisode } from './repo'
import { CARD_MAX, CARD_MIN, articleFactsPrompt, cardCountOf, cardsPrompt, parseArticleFacts, parseCards } from './cards'
import type { Article, Episode, QueueState } from './types'

export const QUEUE_LABEL: Record<QueueState, string> = {
  waiting: '대기',
  running: '만드는 중',
  done: '완료',
  check: '확인 필요',
}

const URL_RE = /https?:\/\/[^\s<>"')]+/g
const MAX_LINKS = 3

/** 한 줄 = 한 편. 줄 안의 링크는 기사 링크로 쓴다 */
export function parseQueueLines(text: string) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => ({ line, urls: [...new Set(line.match(URL_RE) ?? [])].slice(0, MAX_LINKS) }))
}

export async function enqueue(memo: string, urls: string[], extra: Partial<Episode> = {}) {
  const onlyLink = !memo.replace(URL_RE, '').trim()
  return createEpisode(memo, {
    contentType: 'cardnews',
    stage: 'source',
    links: urls.map((url) => ({ id: uid(), url, note: '대기 목록에서 넣은 링크' })),
    ...(onlyLink ? { title: '기사 링크 (읽은 뒤 제목이 바뀌어요)', titleIsAuto: true } : {}),
    ...extra,
    queue: 'waiting',
    queuedAt: new Date().toISOString(),
  })
}

export const isQueued = (e: Episode) => !!e.queue

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * 대기 중인 한 편의 초안을 만든다. 실패해도 throw 하지 않고 '확인 필요'로 남긴다.
 * onStep: 화면에 지금 하는 일을 보여 주기 위한 콜백
 */
export async function draftQueued(id: string, onStep: (s: string) => void = () => {}): Promise<Episode | undefined> {
  const settings = await getSettings()
  let ep = await getEpisode(id)
  if (!ep) return
  ep = await patchEpisode(id, { queue: 'running', queueNote: '' })
  const notes: string[] = []
  try {
    // ① 기사 읽기 (이미 읽은 링크는 건너뜀)
    const arts: Article[] = [...(ep.articles ?? [])]
    const links = [...ep.links]
    for (const l of ep.links.filter((x) => /^https?:\/\//.test(x.url)).slice(0, MAX_LINKS)) {
      if (arts.some((a) => a.url === l.url)) continue
      onStep('기사 읽는 중')
      const r = await readArticle(l.url)
      if (!r.article) {
        notes.push(`기사를 못 읽었어요 (${r.error || '본문 없음'})`)
        continue
      }
      const a = r.article
      if (arts.some((x) => x.url === a.url)) continue
      arts.push({ id: uid(), url: a.url, title: a.title, site: a.site, published: a.published, text: a.text, from: 'fetch', addedAt: new Date().toISOString() })
      if (a.url !== l.url && !links.some((x) => x.url === a.url)) links.push({ id: uid(), url: a.url, note: `${a.site} · 기사 원문` })
    }
    if (arts.length !== (ep.articles ?? []).length) ep = await patchEpisode(id, { articles: arts, links })

    // ② 번역·사실 정리
    if (arts.length && !ep.facts.some((f) => f.quote)) {
      onStep('사실 정리하는 중')
      const r = await aiDraft(articleFactsPrompt(ep, settings))
      if (r.error) throw new Error(`사실 정리 실패: ${r.error}`)
      const f = parseArticleFacts(r.output)
      ep = await patchEpisode(id, {
        articleSummary: f.summary,
        situation: ep.situation || f.summary,
        facts: f.facts.map((x) => ({ id: uid(), text: x.text, status: x.status, quote: x.quote || undefined })),
        unknowns: [...f.unknowns, ...(f.reliability ? [`출처: ${f.reliability}`] : [])],
      })
      if (!f.facts.length) notes.push('기사에서 쓸 만한 사실을 못 찾았어요')
    }
    if (!arts.length) notes.push('기사 없이 메모만 보고 썼어요. 숫자·사실을 꼭 확인해 주세요')

    // ③ 장 구성
    onStep('장 구성하는 중')
    const count = cardCountOf(ep)
    const r = await aiDraft(cardsPrompt(ep, settings, count, [], []))
    if (r.error) throw new Error(`장 구성 실패: ${r.error}`)
    const doc = parseCards(r.output, { range: [CARD_MIN, CARD_MAX] })
    const res = await applyPanelDraft(id, doc.items, 'replace', '장 구성 초안 (대기 목록)', ep.storyRevision)
    const patch: Partial<Episode> = { stage: 'panels', queue: 'done', queueNote: notes.join(' · ') }
    if (doc.title && res.episode.titleIsAuto) patch.title = doc.title
    if (doc.hook) patch.hookText = doc.hook
    return await patchEpisode(id, patch)
  } catch (e) {
    return patchEpisode(id, { queue: 'check', queueNote: [...notes, errText(e)].join(' · ') })
  }
}
