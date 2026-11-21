'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createEpisode } from '@/lib/work/repo'
import { DuplicateRefError, createReference, listReferences, normalizeUrl } from '@/lib/work/refs'
import { onBroadcast } from '@/lib/work/db'
import { matchTopics as matchAny } from '@/lib/topics'
import type { Topic } from '@/lib/work/types'
import { loadAiNews } from './actions'
import { Notice } from '../work/_c/ui'

type Group = 'kr' | 'global' | 'official' | 'community'
interface News {
  title: string
  url: string
  source: string
  at: string
  score?: number
  comments?: number
  discuss?: string
}

const GROUPS: [Group, string, string][] = [
  ['kr', '한국 뉴스', 'Google 뉴스 검색 + AI타임스'],
  ['global', '해외 뉴스', 'Google News + The Verge + TechCrunch'],
  ['official', '공식 발표', 'OpenAI · Google AI · Hugging Face 블로그'],
  ['community', '커뮤니티', 'Hacker News에서 반응 높은 AI 글 (48시간)'],
]

/** 한국·해외 뉴스 검색어 묶음. 내 토픽도 칩으로 붙는다 */
const PRESETS: { id: string; name: string; kr: string[]; en: string[] }[] = [
  { id: 'all', name: 'AI 전체', kr: [], en: [] },
  {
    id: 'service',
    name: '서비스·신기능',
    kr: ['챗GPT', '제미나이', '클로드', '오픈AI', '앤트로픽', '퍼플렉시티', 'AI 기능', 'AI 출시', 'AI 에이전트'],
    en: ['ChatGPT', '"Gemini AI"', '"Claude AI"', 'OpenAI', 'Anthropic', '"AI agent"', '"AI model"'],
  },
  {
    id: 'howto',
    name: '활용·툴',
    kr: ['AI 활용', '생성형 AI 활용', '업무 자동화', 'AI 툴', 'AI로 만든', '프롬프트'],
    en: ['"AI tool"', '"AI tools"', '"AI workflow"', '"AI productivity"', '"prompt engineering"'],
  },
  {
    id: 'issue',
    name: '산업·이슈',
    kr: ['AI 규제', 'AI 기본법', 'AI 반도체', '엔비디아', '딥페이크', 'AI 일자리'],
    en: ['"AI regulation"', 'Nvidia', '"AI chips"', 'deepfake', '"AI jobs"'],
  },
]

const matchTopics = (text: string, topics: Topic[]): Topic[] => matchAny(text, topics)

const ago = (iso: string) => {
  if (!iso) return ''
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (m < 60) return `${Math.max(1, m)}분 전`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}시간 전` : `${Math.round(h / 24)}일 전`
}

export default function AiNews({ topics }: { topics: Topic[] }) {
  const router = useRouter()
  const [group, setGroup] = useState<Group>('kr')
  const [preset, setPreset] = useState('service')
  const [data, setData] = useState<{ items: News[]; errors: string[] }>()
  const [picked, setPicked] = useState<string[]>([])
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const chips = useMemo(() => [...PRESETS.map((p) => ({ id: p.id, name: p.name })), ...topics.map((t) => ({ id: `t:${t.id}`, name: t.name }))], [topics])
  const searchable = group === 'kr' || group === 'global'

  const terms = useMemo(() => {
    const p = PRESETS.find((x) => x.id === preset)
    if (p) return { kr: p.kr, en: p.en }
    const t = topics.find((x) => `t:${x.id}` === preset)
    const kw = t?.keywords ?? []
    return { kr: kw, en: kw.filter((k) => /^[\x20-\x7e]+$/.test(k)) }
  }, [preset, topics])

  useEffect(() => {
    setData(undefined)
    setPicked([])
    loadAiNews(group, terms).then((r) => setData(r as { items: News[]; errors: string[] }))
  }, [group, terms])

  const refreshSaved = () => listReferences().then((rs) => setSaved(new Set(rs.map((r) => r.url))))
  useEffect(() => {
    refreshSaved()
    return onBroadcast((m) => m.kind === 'references' && refreshSaved())
  }, [])
  const isSaved = (u: string) => {
    try {
      return saved.has(normalizeUrl(u))
    } catch {
      return false
    }
  }

  const items = data?.items ?? []
  const pickedItems = items.filter((x) => picked.includes(x.url))

  async function star(n: News) {
    try {
      await createReference({
        url: n.url,
        account: n.source.replace(/\s+/g, '_').slice(0, 30) || '뉴스',
        tags: matchTopics(n.title, topics).map((t) => t.name),
        likes: n.score,
        comments: n.comments,
        views: undefined,
        metricsAt: n.score !== undefined ? new Date().toISOString() : undefined,
        metricsSource: n.score !== undefined ? 'Hacker News 점수' : '',
        take: '',
        note: n.title,
        caption: '',
      })
      setMsg('레퍼런스 보드에 담았어요.')
    } catch (e) {
      setMsg(e instanceof DuplicateRefError ? '이미 보드에 있는 링크예요.' : `담지 못했어요: ${(e as Error).message}`)
    }
    refreshSaved()
  }

  /** 고른 소식으로 카드뉴스 편 만들기. 메모에는 제목·출처·링크만 넣고, 사실은 작가가 덧붙이게 한다 */
  async function toCardNews(list: News[]) {
    if (!list.length) return
    setBusy(true)
    const line = (n: News) => `- ${n.title}\n  출처: ${n.source}${n.at ? ` (${n.at.slice(0, 10)})` : ''} ${n.url}`
    const memo =
      list.length === 1
        ? `[AI 소식] ${list[0].title}\n출처: ${list[0].source}${list[0].at ? ` (${list[0].at.slice(0, 10)})` : ''} ${list[0].url}\n\n기사에서 확인한 내용을 여기에 덧붙여 주세요. 장 구성은 이 메모 범위 안에서만 써요.`
        : `[AI 소식 묶음] 이번 주 AI 소식 ${list.length}개\n${list.map(line).join('\n')}\n\n각 기사에서 확인한 핵심을 한 줄씩 덧붙여 주세요. 장 구성은 이 메모 범위 안에서만 써요.`
    try {
      const ep = await createEpisode(memo, {
        contentType: 'cardnews',
        cardCount: list.length === 1 ? 5 : Math.min(10, list.length + 2),
        title: list.length === 1 ? list[0].title.slice(0, 40) : `이번 주 AI 소식 ${list.length}개`,
        titleIsAuto: false,
        links: list.map((n) => ({ id: crypto.randomUUID(), url: n.url, note: `${n.source} · ${n.title}` })),
      })
      router.push(`/studio/work/${ep.id}`)
    } catch (e) {
      setMsg(`만들지 못했어요: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <section className="card ai-news">
      <div className="card-head">
        <h2>📰 AI 소식</h2>
        <span className="muted small">{GROUPS.find((g) => g[0] === group)?.[2]}</span>
      </div>
      <div className="seg mini" role="tablist" aria-label="소식 종류">
        {GROUPS.map(([g, l]) => (
          <button key={g} type="button" role="tab" aria-selected={group === g} className={group === g ? 'on' : ''} onClick={() => setGroup(g)}>
            {l}
          </button>
        ))}
      </div>
      {searchable && (
        <div className="chips news-chips" role="group" aria-label="검색어">
          {chips.map((c) => (
            <button key={c.id} type="button" className={`chip ${preset === c.id ? 'on' : ''}`} aria-pressed={preset === c.id} onClick={() => setPreset(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {msg && <p className="flash">{msg}</p>}
      {!data && <p className="muted small">불러오는 중…</p>}
      {data && data.errors.length > 0 && <Notice kind="warn">일부 소스를 못 불러왔어요: {data.errors.join(' / ')}</Notice>}
      {data && items.length === 0 && <p className="muted small">조건에 맞는 소식이 없어요.</p>}

      {pickedItems.length > 0 && (
        <div className="pick-bar">
          <span className="small">
            <b>{pickedItems.length}개</b> 골랐어요
          </span>
          <button type="button" className="btn small primary" disabled={busy} onClick={() => toCardNews(pickedItems)}>
            {pickedItems.length === 1 ? '이걸로 카드뉴스 만들기' : `${pickedItems.length}개 묶어 카드뉴스 만들기`}
          </button>
          <button type="button" className="btn small ghost" onClick={() => setPicked([])}>
            선택 해제
          </button>
        </div>
      )}

      <ul className="news-list">
        {items.map((n) => {
          const on = picked.includes(n.url)
          const hit = matchTopics(n.title, topics)
          return (
            <li key={n.url} className={`news ${on ? 'on' : ''}`}>
              <input type="checkbox" aria-label={`${n.title} 고르기`} checked={on} onChange={() => setPicked(on ? picked.filter((x) => x !== n.url) : [...picked, n.url])} />
              <div className="news-body">
                <a className="news-title" href={n.url} target="_blank" rel="noreferrer">
                  {n.title}
                </a>
                <span className="small muted">
                  {n.source}
                  {n.at && ` · ${ago(n.at)}`}
                  {n.score !== undefined && ` · ▲${n.score} · 💬${n.comments ?? 0}`}
                  {n.discuss && (
                    <>
                      {' · '}
                      <a className="link" href={n.discuss} target="_blank" rel="noreferrer">
                        토론 보기
                      </a>
                    </>
                  )}
                </span>
                {hit.length > 0 && (
                  <span className="ep-meta">
                    {hit.map((h) => (
                      <span key={h.id} className="tag good">
                        {h.name}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <button type="button" className="btn ghost small" disabled={isSaved(n.url)} onClick={() => star(n)} aria-label={isSaved(n.url) ? '보드에 있음' : '보드에 담기'} title={isSaved(n.url) ? '보드에 있음' : '레퍼런스 보드에 담기'}>
                {isSaved(n.url) ? '★' : '☆'}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="hint">체크해서 여러 개를 고르면 ‘이번 주 AI 소식’ 카드뉴스 한 편으로 묶여요. 기사 내용은 메모에 직접 덧붙여야 AI가 사실을 지어내지 않아요.</p>
    </section>
  )
}
