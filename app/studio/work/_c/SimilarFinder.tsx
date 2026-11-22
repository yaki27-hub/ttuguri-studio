'use client'

import { useState } from 'react'
import type { Reference } from '@/lib/work/types'
import { fmtCount } from '@/lib/work/refs'
import { similarKeywords, similarWeb } from '../similar'
import { RefForm, type RefFormInitial } from './Refs'

/* ───────── 서버 응답 모양 ───────── */
type Keywords = { topic: string; hashtags: string[]; queryKo: string; queryEn: string }
type WebItem = { title: string; url: string; source: string; account: string; why: string; angle: string; likes?: number | null; comments?: number | null; date?: string; caption?: string; image?: string }
type WebResult = { items: WebItem[]; others: { url: string; title: string }[] }
type Scope = 'ig' | 'en' | 'ko'

const SCOPES: [Scope, string][] = [
  ['ig', '인스타 게시물'],
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
  if (scope === 'en') return k.queryEn
  if (scope === 'ko') return k.queryKo
  return [k.queryKo, ...k.hashtags.slice(0, 2).map((t) => `#${t}`)].filter(Boolean).join(' ')
}

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
    const res = await similarWeb(query, kw?.topic ?? '', scope).catch((e: Error) => ({ error: e.message }))
    setBusy('')
    if ('error' in res && res.error) return setErr(res.error)
    setSearched(scope)
    setWeb(res as WebResult)
  }

  function initialFor(it: WebItem): RefFormInitial {
    const note = [it.title, it.why, it.angle && `빌려올 점: ${it.angle}`, origin]
    if (searched === 'ig') {
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
            {busy === 'kw' ? '주제 읽는 중…' : kw ? '검색어 다시 뽑기' : '검색어 뽑기'}
          </button>
        )}
        {kw?.topic && (
          <span className="small">
            주제: <b>{kw.topic}</b>
          </span>
        )}
      </div>
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
        {scope === 'ig'
          ? '구글에 잡힌 인스타 게시물이라 아주 최근 게시물은 빠질 수 있어요. 게시물 페이지를 열어 실제로 있는 것만 보여 줘요.'
          : '구글 검색으로 찾고, 실제로 검색된 링크만 보여요.'}{' '}
        검색할 때마다 Gemini 요금이 붙을 수 있어요.
      </p>

      {web && !web.items.length && !web.others.length && <p className="muted small">확인된 결과가 없어요. 검색어를 바꿔 보세요.</p>}
      {web && (
        <ul className="similar-list">
          {web.items.map((it) => (
            <li key={it.url}>
              <div className={searched === 'ig' ? 'similar-item' : ''}>
              {searched === 'ig' && (
                <a className="similar-thumb" href={it.url} target="_blank" rel="noreferrer">
                  {it.image ? <img src={it.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>게시물</span>}
                </a>
              )}
              <div className="similar-body">
                <a className="similar-title" href={it.url} target="_blank" rel="noreferrer">
                  {it.title || it.url} ↗
                </a>
                <span className="muted small">
                  {it.source}
                  {searched !== 'ig' && hostOf(it.url) && !it.source.toLowerCase().includes(hostOf(it.url)) ? ` · ${hostOf(it.url)}` : ''}
                  {searched === 'ig' && /\/(reel|reels)\//.test(it.url) ? ' · 릴스' : ''}
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
              </div>
              </div>
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
