'use client'

import { useEffect, useState } from 'react'
import type { Reference } from '@/lib/work/types'
import { fmtCount } from '@/lib/work/refs'
import { similarHashtags, similarKeywords, similarWeb } from '../similar'
import { RefForm, type RefFormInitial } from './Refs'

/* ───────── 서버 응답 모양 ───────── */
type Keywords = { topic: string; hashtags: string[]; queryKo: string; queryEn: string }
type IgMedia = { id: string; permalink: string; caption: string; image: string; video: boolean; carousel: boolean; likes: number | null; comments: number | null; timestamp: string }
type TagResult = { tag: string; media: IgMedia[]; error?: string }
type WebItem = { title: string; url: string; source: string; why: string; angle: string }
type WebResult = { items: WebItem[]; others: { url: string; title: string }[] }

/* ───────── 해시태그 7일 30개 제한: 이 브라우저에서 쓴 태그를 기억해 보여 준다 ───────── */
const QUOTA_KEY = 'similar-hashtag-log'
const WEEK = 7 * 86400000
function loadTagLog(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(QUOTA_KEY) || '{}') as Record<string, number>
    return Object.fromEntries(Object.entries(raw).filter(([, t]) => Date.now() - t < WEEK))
  } catch {
    return {}
  }
}
function logTags(tags: string[]) {
  const log = loadTagLog()
  for (const t of tags) if (!log[t]) log[t] = Date.now()
  try {
    localStorage.setItem(QUOTA_KEY, JSON.stringify(log))
  } catch {
    /* 저장 못 해도 검색은 된다 */
  }
  return log
}

const firstLine = (s: string) => s.split('\n').map((x) => x.trim()).find(Boolean) ?? ''
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
const cleanTag = (t: string) => t.replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '').toLowerCase()

/** 레퍼런스 하나로 비슷한 인스타 게시물·해외 사례 찾기 */
export default function SimilarFinder({ r, aiReady, channel = 'toon', onSaved }: { r: Reference; aiReady: boolean; channel?: 'toon' | 'card'; onSaved?: () => void }) {
  const [kw, setKw] = useState<Keywords>()
  const [tags, setTags] = useState<string[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [edge, setEdge] = useState<'top_media' | 'recent_media'>('top_media')
  const [query, setQuery] = useState('')
  const [lang, setLang] = useState<'en' | 'ko'>('en')
  const [busy, setBusy] = useState<'' | 'kw' | 'ig' | 'web'>('')
  const [err, setErr] = useState('')
  const [ig, setIg] = useState<TagResult[]>()
  const [web, setWeb] = useState<WebResult>()
  const [form, setForm] = useState<{ url: string; initial: RefFormInitial }>()
  const [saved, setSaved] = useState<string[]>([])
  const [tagLog, setTagLog] = useState<Record<string, number>>({})
  useEffect(() => setTagLog(loadTagLog()), [])

  const origin = `@${r.account} 레퍼런스에서 '비슷한 것 찾기'로 찾음`

  async function extract() {
    setBusy('kw')
    setErr('')
    const res = await similarKeywords({ account: r.account, caption: r.caption, note: r.note, take: r.take, tags: r.tags }, channel).catch((e: Error) => ({ error: e.message }))
    setBusy('')
    if ('error' in res && res.error) return setErr(res.error)
    const k = res as Keywords
    setKw(k)
    setTags(k.hashtags)
    setPicked(k.hashtags.slice(0, 3))
    setQuery(lang === 'en' ? k.queryEn : k.queryKo)
  }

  function addTag() {
    const t = cleanTag(newTag)
    setNewTag('')
    if (!t) return
    if (!tags.includes(t)) setTags([...tags, t])
    if (!picked.includes(t) && picked.length < 3) setPicked([...picked, t])
  }

  async function searchIg() {
    setBusy('ig')
    setErr('')
    setIg(undefined)
    const res = await similarHashtags(picked, channel, edge).catch((e: Error) => ({ error: e.message, results: [] }))
    setBusy('')
    if ('error' in res && res.error) return setErr(res.error)
    setIg(res.results as TagResult[])
    setTagLog(logTags((res.results as TagResult[]).filter((x) => !x.error).map((x) => x.tag)))
  }

  async function searchWeb() {
    setBusy('web')
    setErr('')
    setWeb(undefined)
    const res = await similarWeb(query, kw?.topic ?? '', lang).catch((e: Error) => ({ error: e.message }))
    setBusy('')
    if ('error' in res && res.error) return setErr(res.error)
    setWeb(res as WebResult)
  }

  const saveBtn = (url: string, initial: RefFormInitial) =>
    saved.includes(url) ? (
      <span className="tag good">저장함</span>
    ) : (
      <button type="button" className="btn small" onClick={() => setForm(form?.url === url ? undefined : { url, initial })}>
        {form?.url === url ? '닫기' : '레퍼런스로 저장'}
      </button>
    )
  const inlineForm = (url: string) =>
    form?.url === url && (
      <RefForm
        url={url}
        channel={channel}
        initial={form.initial}
        onCancel={() => setForm(undefined)}
        onExisting={() => (setSaved([...saved, url]), setForm(undefined))}
        onSaved={() => {
          setSaved([...saved, url])
          setForm(undefined)
          onSaved?.()
        }}
      />
    )
  const usedThisWeek = Object.keys(tagLog).length

  return (
    <section className="similar">
      <h3>비슷한 것 찾기</h3>
      <p className="muted small">이 레퍼런스의 주제로 인스타 해시태그와 웹을 검색해요. 마음에 드는 건 레퍼런스로 저장할 수 있어요.</p>

      {/* 1. 주제어 */}
      <div className="row-inline wraps">
        {aiReady && (
          <button type="button" className="btn primary small" disabled={!!busy} onClick={extract}>
            {busy === 'kw' ? '주제 읽는 중…' : kw ? '주제어 다시 뽑기' : '주제어 뽑기'}
          </button>
        )}
        {kw?.topic && <span className="small">주제: <b>{kw.topic}</b></span>}
      </div>
      {!aiReady && <p className="hint">AI 키가 없어 주제어를 자동으로 못 뽑아요. 해시태그와 검색어를 직접 적어 주세요.</p>}

      {/* 2. 인스타 해시태그 */}
      <div className="similar-block">
        <p className="small"><b>인스타 해시태그</b> <span className="muted">· 최대 3개 선택 · 이 브라우저에서 이번 주 {usedThisWeek}/30개 사용</span></p>
        <div className="chips">
          {tags.map((t) => {
            const on = picked.includes(t)
            return (
              <button key={t} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} disabled={!on && picked.length >= 3}
                onClick={() => setPicked(on ? picked.filter((x) => x !== t) : [...picked, t])}>
                #{t}{tagLog[t] ? ' ✓' : ''}
              </button>
            )
          })}
        </div>
        <div className="row-inline wraps">
          <input className="similar-input" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder="해시태그 추가 (# 없이)" aria-label="해시태그 추가" />
          <button type="button" className="btn small" onClick={addTag} disabled={!newTag.trim()}>추가</button>
          <select value={edge} onChange={(e) => setEdge(e.target.value as typeof edge)} aria-label="게시물 종류">
            <option value="top_media">인기 게시물</option>
            <option value="recent_media">최근 24시간</option>
          </select>
          <button type="button" className="btn primary small" disabled={!!busy || !picked.length} onClick={searchIg}>
            {busy === 'ig' ? '찾는 중…' : '인스타에서 찾기'}
          </button>
        </div>
        <p className="hint">인스타 정책상 한 계정당 7일 동안 해시태그 30개까지 검색돼요(✓ 표시는 이번 주에 이미 쓴 태그라 다시 써도 개수가 늘지 않아요). 결과에 계정 이름은 안 나와서, 저장할 때 링크를 열어 확인해 주세요.</p>

        {ig?.map((g) => (
          <div key={g.tag} className="similar-group">
            <p className="small"><b>#{g.tag}</b> <span className="muted">{g.error ? '' : `${g.media.length}개`}</span></p>
            {g.error && <p className="flash bad small">{g.error}</p>}
            {!g.error && !g.media.length && <p className="muted small">결과가 없어요.</p>}
            <ul className="similar-list">
              {g.media.map((m) => (
                <li key={m.id}>
                  <div className="similar-item">
                    <a className="similar-thumb" href={m.permalink} target="_blank" rel="noreferrer">
                      {m.image ? <img src={m.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>{m.video ? '영상' : '게시물'}</span>}
                    </a>
                    <div className="similar-body">
                      <a className="similar-title" href={m.permalink} target="_blank" rel="noreferrer">{firstLine(m.caption) || '(캡션 없음)'} ↗</a>
                      <span className="muted small">
                        {m.carousel ? '캐러셀 · ' : m.video ? '영상 · ' : ''}♥ {fmtCount(m.likes ?? undefined)} · 💬 {fmtCount(m.comments ?? undefined)}
                      </span>
                      {saveBtn(m.permalink, {
                        account: '',
                        postType: m.carousel ? 'carousel' : m.video ? 'reel' : 'feed',
                        format: m.carousel ? 'carousel' : undefined,
                        likes: m.likes ?? undefined,
                        comments: m.comments ?? undefined,
                        metricsSource: '인스타 해시태그 검색',
                        caption: m.caption,
                        note: `${origin} (#${g.tag})`,
                      })}
                    </div>
                  </div>
                  {inlineForm(m.permalink)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* 3. 웹 검색 */}
      <div className="similar-block">
        <p className="small"><b>웹에서 비슷한 사례</b> <span className="muted">· 구글 검색으로 찾고 실제로 검색된 링크만 보여요</span></p>
        <div className="row-inline wraps">
          <select value={lang} onChange={(e) => { const l = e.target.value as 'en' | 'ko'; setLang(l); if (kw) setQuery(l === 'en' ? kw.queryEn : kw.queryKo) }} aria-label="검색 범위">
            <option value="en">해외 (영어)</option>
            <option value="ko">국내</option>
          </select>
          <input className="similar-input wide" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && query.trim() && !busy && (e.preventDefault(), searchWeb())} placeholder={lang === 'en' ? 'English search words' : '검색어'} aria-label="웹 검색어" />
          <button type="button" className="btn primary small" disabled={!!busy || !query.trim()} onClick={searchWeb}>
            {busy === 'web' ? '검색 중… (1분쯤)' : '웹에서 찾기'}
          </button>
        </div>
        {web && !web.items.length && !web.others.length && <p className="muted small">확인된 결과가 없어요. 검색어를 바꿔 보세요.</p>}
        {web && (
          <ul className="similar-list">
            {web.items.map((it) => (
              <li key={it.url}>
                <div className="similar-body">
                  <a className="similar-title" href={it.url} target="_blank" rel="noreferrer">{it.title || it.url} ↗</a>
                  <span className="muted small">{it.source}{hostOf(it.url) && !it.source.toLowerCase().includes(hostOf(it.url)) ? ` · ${hostOf(it.url)}` : ''}</span>
                  {it.why && <span className="small">{it.why}</span>}
                  {it.angle && <span className="small muted">빌려올 점: {it.angle}</span>}
                  {saveBtn(it.url, {
                    account: hostOf(it.url) || it.source.replace(/^@/, '').slice(0, 40),
                    format: 'other',
                    metricsSource: '',
                    take: '',
                    note: [it.title, it.source && `출처: ${it.source}`, it.why, it.angle && `빌려올 점: ${it.angle}`, origin].filter(Boolean).join('\n'),
                  })}
                </div>
                {inlineForm(it.url)}
              </li>
            ))}
          </ul>
        )}
        {!!web?.others.length && (
          <details className="fold-mini">
            <summary>검색된 다른 페이지 {web.others.length}개</summary>
            <ul className="similar-others">
              {web.others.map((o) => (
                <li key={o.url}><a className="link" href={o.url} target="_blank" rel="noreferrer">{o.title || o.url} ↗</a></li>
              ))}
            </ul>
          </details>
        )}
        <p className="hint">웹 검색은 Gemini 구글 검색을 써서 검색할 때마다 요금이 붙을 수 있어요.</p>
      </div>

      {err && <p className="flash bad">{err}</p>}
    </section>
  )
}
