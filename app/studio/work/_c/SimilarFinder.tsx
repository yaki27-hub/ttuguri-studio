'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { episodeFromTranslation, type Translation } from '@/lib/work/translated'
import type { Reference } from '@/lib/work/types'
import { fmtCount } from '@/lib/work/refs'
import { DEFAULT_PROVEN, loadProvenRule, type ProvenRule } from '@/lib/work/reflab'
import { similarKeywords, similarWeb, translateIgUrl } from '../similar'
import { RefForm, type RefFormInitial } from './Refs'

/* ───────── 서버 응답 모양 ───────── */
type Keywords = { event: string; brief: string; entities: string[]; topic: string; date: string; via: 'article' | 'search' | 'memo'; hashtags: string[]; queryKo: string; queryEn: string }
type WebItem = { title: string; url: string; source: string; account: string; match: 'same' | 'related'; why: string; angle: string; likes?: number | null; comments?: number | null; date?: string; caption?: string; image?: string }
type WebResult = { items: WebItem[]; others: { url: string; title: string }[] }
type Scope = 'ig' | 'igen' | 'en' | 'ko'

const SCOPES: [Scope, string][] = [
  ['ig', '인스타 게시물'],
  ['igen', '해외 인스타 게시물'],
  ['en', '해외 웹 (영어)'],
  ['ko', '국내 웹'],
]

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** 범위별 기본 검색어 */
function queryFor(scope: Scope, k: Keywords) {
  if (scope === 'en' || scope === 'igen') return k.queryEn
  if (scope === 'ko') return k.queryKo
  return k.queryKo
}

const isIg = (x: Scope) => x === 'ig' || x === 'igen'

/** 레퍼런스 보드의 '검증 기준'과 같은 잣대로 잘된 게시물인지 */
const proven = (it: WebItem, rule: ProvenRule) =>
  (rule.likes !== undefined && (it.likes ?? -1) >= rule.likes) || (rule.comments !== undefined && (it.comments ?? -1) >= rule.comments)
const engagement = (it: WebItem) => (it.likes ?? 0) + (it.comments ?? 0)

/**
 * 레퍼런스 하나로 비슷한 인스타 게시물·웹 사례 찾기.
 * 모두 Gemini 구글 검색을 쓴다 (인스타 해시태그 API는 메타 앱 심사가 필요해서 쓰지 않음).
 */
export default function SimilarFinder({ r, aiReady, channel = 'toon', onSaved }: { r: Reference; aiReady: boolean; channel?: 'toon' | 'card'; onSaved?: () => void }) {
  const [kw, setKw] = useState<Keywords>()
  const [scope, setScope] = useState<Scope>('ig')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<'' | 'kw' | 'web'>('')
  const [err, setErr] = useState('')
  const [web, setWeb] = useState<WebResult>()
  const [searched, setSearched] = useState<Scope>('ig')
  const [form, setForm] = useState<{ url: string; initial: RefFormInitial }>()
  const [saved, setSaved] = useState<string[]>([])
  const [order, setOrder] = useState<'match' | 'engagement'>('match')
  const [onlyHot, setOnlyHot] = useState(false)
  const [rule, setRule] = useState<ProvenRule>(DEFAULT_PROVEN)
  useEffect(() => setRule(loadProvenRule()), [])
  const shown = useMemo(() => {
    const list = (web?.items ?? []).filter((it) => !onlyHot || proven(it, rule))
    return order === 'engagement' ? [...list].sort((a, b) => engagement(b) - engagement(a)) : list
  }, [web, order, onlyHot, rule])
  const router = useRouter()
  const [tr, setTr] = useState<Record<string, Translation | { error: string }>>({})
  const [trBusy, setTrBusy] = useState('')
  const [making, setMaking] = useState('')

  async function translate(it: WebItem) {
    if (tr[it.url]) return setTr(({ [it.url]: _, ...rest }) => rest)
    setTrBusy(it.url)
    const res = await translateIgUrl(it.url, it.account, channel).catch((e: Error) => ({ error: e.message }))
    setTrBusy('')
    const ok = !res.error && 'post' in res && res.post
    setTr((cur) => ({ ...cur, [it.url]: ok ? (res as Translation) : { error: res.error || '번역하지 못했어요.' } }))
  }

  async function make(url: string) {
    const t = tr[url]
    if (!t || 'error' in t) return
    setMaking(url)
    try {
      const ep = await episodeFromTranslation(t)
      router.push(`/studio/work/${ep.id}?stage=source`)
    } catch (e) {
      setErr(`카드뉴스를 만들지 못했어요: ${(e as Error).message}`)
      setMaking('')
    }
  }

  const hotCount = (web?.items ?? []).filter((it) => proven(it, rule)).length

  const origin = `@${r.account} 레퍼런스에서 '비슷한 것 찾기'로 찾음`

  async function extract() {
    setBusy('kw')
    setErr('')
    const res = await similarKeywords({ account: r.account, caption: r.caption, note: r.note, take: r.take, tags: r.tags }, channel).catch((e: Error) => ({ error: e.message }))
    setBusy('')
    if ('error' in res && res.error) return setErr(res.error)
    const k = res as Keywords
    setKw(k)
    setQuery(queryFor(scope, k))
  }

  function changeScope(next: Scope) {
    setScope(next)
    if (kw) setQuery(queryFor(next, kw))
  }

  async function search() {
    setBusy('web')
    setErr('')
    setWeb(undefined)
    setForm(undefined)
    const res = await similarWeb(query, kw ?? {}, scope).catch((e: Error) => ({ error: e.message }))
    setBusy('')
    if ('error' in res && res.error) return setErr(res.error)
    setSearched(scope)
    setWeb(res as WebResult)
  }

  function initialFor(it: WebItem): RefFormInitial {
    const note = [it.title, it.why, it.angle && `빌려올 점: ${it.angle}`, origin]
    if (isIg(searched)) {
      return {
        account: it.account,
        postType: /\/(reel|reels)\//.test(it.url) ? 'reel' : undefined,
        format: channel === 'card' ? 'carousel' : undefined,
        likes: it.likes ?? undefined,
        comments: it.comments ?? undefined,
        metricsSource: '게시물 페이지에서 읽음',
        caption: it.caption ?? '',
        note: note.filter(Boolean).join('\n'),
      }
    }
    return {
      account: hostOf(it.url) || it.source.replace(/^@/, '').slice(0, 40),
      format: 'other',
      metricsSource: '',
      note: [it.title, it.source && `출처: ${it.source}`, ...note.slice(1)].filter(Boolean).join('\n'),
    }
  }

  return (
    <section className="similar">
      <h3>비슷한 것 찾기</h3>
      <p className="muted small">이 레퍼런스의 주제로 구글을 검색해 비슷한 인스타 게시물이나 웹 사례를 찾아요. 마음에 드는 건 레퍼런스로 저장할 수 있어요.</p>

      <div className="row-inline wraps">
        {aiReady && (
          <button type="button" className="btn small" disabled={!!busy} onClick={extract}>
            {busy === 'kw' ? '기사 확인 중… (1분쯤)' : kw ? '검색어 다시 뽑기' : '검색어 뽑기'}
          </button>
        )}
      </div>
      {kw && (
        <div className="similar-about">
          {kw.event && (
            <p className="small">
              원래 소식: <b>{kw.event}</b>
            </p>
          )}
          {!!kw.entities.length && <p className="small muted">핵심어: {kw.entities.join(' · ')}</p>}
          <p className="hint">
            {kw.via === 'article' ? '원래 기사 본문을 읽고 뽑았어요.' : kw.via === 'search' ? '기사 링크를 직접 못 열어서, 구글 검색으로 원래 기사를 찾아 확인하고 뽑았어요.' : '기사 본문을 못 읽어서 저장된 메모·캡션만으로 뽑았어요.'}
            {kw.date ? ` 소식 날짜: ${kw.date}` : ''}
          </p>
        </div>
      )}
      {!aiReady && <p className="hint">AI 키가 없어 검색어를 자동으로 못 뽑아요. 아래에 직접 적어 주세요.</p>}
      {!!kw?.hashtags.length && (
        <div className="chips similar-tags">
          {kw.hashtags.map((t) => (
            <button key={t} type="button" className="chip" title="검색어에 넣기" onClick={() => !query.includes(`#${t}`) && setQuery(`${query} #${t}`.trim())}>
              #{t}
            </button>
          ))}
        </div>
      )}

      <div className="row-inline wraps similar-search">
        <select value={scope} onChange={(e) => changeScope(e.target.value as Scope)} aria-label="검색 범위">
          {SCOPES.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="similar-input wide"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && query.trim() && !busy && (e.preventDefault(), search())}
          placeholder={scope === 'en' ? 'English search words' : '검색어 (해시태그를 넣어도 돼요)'}
          aria-label="검색어"
        />
        <button type="button" className="btn primary small" disabled={!!busy || !query.trim()} onClick={search}>
          {busy === 'web' ? '검색 중… (1분쯤)' : '찾기'}
        </button>
      </div>
      <p className="hint">
        {isIg(scope)
          ? '구글에 잡힌 인스타 게시물이라 아주 최근 게시물은 빠질 수 있어요. 게시물 페이지를 열어 실제로 있는 것만 보여 줘요.'
          : '구글 검색으로 찾고, 실제로 검색된 링크만 보여요.'}{' '}
        검색할 때마다 Gemini 요금이 붙을 수 있어요.
      </p>

      {web && !web.items.length && !web.others.length && <p className="muted small">확인된 결과가 없어요. 검색어를 바꿔 보세요.</p>}
      {!!web?.items.length && (
        <div className="row-inline wraps similar-order">
          <span className="small muted">
            {web.items.length}개 · 같은 소식 {web.items.filter((x) => x.match === 'same').length}
            {isIg(searched) ? ` · 🔥 ${hotCount}` : ''}
          </span>
          <select value={order} onChange={(e) => setOrder(e.target.value as typeof order)} aria-label="결과 정렬">
            <option value="match">원래 소식과 가까운 순</option>
            <option value="engagement">반응 좋은 순</option>
          </select>
          {isIg(searched) && (
            <label className="check small">
              <input type="checkbox" checked={onlyHot} onChange={(e) => setOnlyHot(e.target.checked)} /> 🔥 잘된 것만
            </label>
          )}
        </div>
      )}
      {web && onlyHot && !shown.length && !!web.items.length && (
        <p className="muted small">
          검증 기준(좋아요 {fmtCount(rule.likes)} · 댓글 {fmtCount(rule.comments)})을 넘은 게시물이 없어요. 기준은 레퍼런스 보드에서 바꿀 수 있어요.
        </p>
      )}
      {web && (
        <ul className="similar-list">
          {shown.map((it) => (
            <li key={it.url}>
              <div className={isIg(searched) ? 'similar-item' : ''}>
              {isIg(searched) && (
                <a className="similar-thumb" href={it.url} target="_blank" rel="noreferrer">
                  {it.image ? <img src={it.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>게시물</span>}
                </a>
              )}
              <div className="similar-body">
                <a className="similar-title" href={it.url} target="_blank" rel="noreferrer">
                  {it.title || it.url} ↗
                </a>
                <span className="similar-badges">
                  <span className={`tag ${it.match === 'same' ? 'good' : ''}`}>{it.match === 'same' ? '같은 소식' : '비슷한 주제'}</span>
                  {isIg(searched) && proven(it, rule) && <span className="tag hot">🔥 잘된 게시물</span>}
                </span>
                <span className="muted small">
                  {it.source}
                  {!isIg(searched) && hostOf(it.url) && !it.source.toLowerCase().includes(hostOf(it.url)) ? ` · ${hostOf(it.url)}` : ''}
                  {isIg(searched) && /\/(reel|reels)\//.test(it.url) ? ' · 릴스' : ''}
                  {it.likes != null ? ` · ♥ ${fmtCount(it.likes)} · 💬 ${fmtCount(it.comments ?? undefined)}` : ''}
                  {it.date ? ` · ${it.date}` : ''}
                </span>
                {it.why && <span className="small">{it.why}</span>}
                {it.angle && <span className="small muted">빌려올 점: {it.angle}</span>}
                {saved.includes(it.url) ? (
                  <span className="tag good">저장함</span>
                ) : (
                  <button type="button" className="btn small" onClick={() => setForm(form?.url === it.url ? undefined : { url: it.url, initial: initialFor(it) })}>
                    {form?.url === it.url ? '닫기' : '레퍼런스로 저장'}
                  </button>
                )}
                {isIg(searched) && (
                  <button type="button" className="btn small" disabled={!!trBusy} onClick={() => translate(it)}>
                    {trBusy === it.url ? '읽고 번역하는 중… (20~40초)' : tr[it.url] ? '번역 닫기' : '🌐 번역 보기'}
                  </button>
                )}
              </div>
              </div>
              {tr[it.url] && <TranslationView t={tr[it.url]} busy={making === it.url} onMake={() => make(it.url)} />}
              {form?.url === it.url && (
                <RefForm
                  url={it.url}
                  channel={channel}
                  initial={form.initial}
                  onCancel={() => setForm(undefined)}
                  onExisting={() => (setSaved([...saved, it.url]), setForm(undefined))}
                  onSaved={() => {
                    setSaved([...saved, it.url])
                    setForm(undefined)
                    onSaved?.()
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {!!web?.others.length && (
        <details className="fold-mini">
          <summary>검색된 다른 페이지 {web.others.length}개</summary>
          <ul className="similar-others">
            {web.others.map((o) => (
              <li key={o.url}>
                <a className="link" href={o.url} target="_blank" rel="noreferrer">
                  {o.title || o.url} ↗
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      {err && <p className="flash bad">{err}</p>}
    </section>
  )
}

/** 번역본 미리보기 → 마음에 들면 카드뉴스 작업으로 */
function TranslationView({ t, busy, onMake }: { t: Translation | { error: string }; busy: boolean; onMake: () => void }) {
  if ('error' in t) return <p className="flash bad small">{t.error}</p>
  const { post, read, readError } = t
  return (
    <div className="similar-tr">
      {read?.summary && (
        <p className="small">
          <b>요약</b> {read.summary}
        </p>
      )}
      {!!read?.slides.length && (
        <ol className="similar-slides">
          {read.slides.map((x) => (
            <li key={x.n}>
              <span className="small">{x.ko || '(글자 없음)'}</span>
              {x.original && x.original !== x.ko && <span className="small muted">{x.original}</span>}
            </li>
          ))}
        </ol>
      )}
      {post.coverOnly && <p className="hint">장별 이미지를 받지 못해 첫 장만 읽었어요(개인 계정이거나 최근 30개보다 오래된 게시물일 때). 나머지 장은 링크를 열어 확인해 주세요.</p>}
      {read?.captionKo && (
        <details className="fold-mini">
          <summary>캡션 번역</summary>
          <p className="small pre">{read.captionKo}</p>
        </details>
      )}
      {readError && <p className="hint">이미지 속 글자는 읽지 못했어요: {readError}</p>}
      <div className="row-inline wraps">
        <button type="button" className="btn primary small" disabled={busy} onClick={onMake}>
          {busy ? '만드는 중…' : '이걸로 카드뉴스 만들기'}
        </button>
        <span className="hint">번역본이 원문 단계 ‘기사 읽기’에 들어가요.</span>
      </div>
    </div>
  )
}
