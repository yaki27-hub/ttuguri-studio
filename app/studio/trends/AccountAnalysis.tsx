'use client'

import { useEffect, useState } from 'react'
import { fmtCount } from '@/lib/work/refs'
import { fmtDate } from '@/lib/work/format'
import { analyzeAccounts, analyzeStyle, compareAccounts } from './analyze'

/* ───────── 서버 응답 모양 ───────── */
type Mix = { carousel: number; feed: number; reel: number }
type TopPost = { id: string; permalink: string; caption: string; type: keyof Mix; likes: number | null; comments: number | null; timestamp: string; thumb: string; image: string; slides: string[] }
type Stats = {
  username: string
  name: string
  bio: string
  followers: number | null
  analyzed: number
  from: string | null
  to: string | null
  perWeek: number | null
  mix: Mix
  avgLikesByType: Record<keyof Mix, number | null>
  avgLikes: number | null
  medianLikes: number | null
  avgComments: number | null
  hiddenLikes: number
  engagement: number | null
  avgCaption: number
  avgHashtags: number
  bestDay: string | null
  top: TopPost[]
  bottomCaptions: string[]
}
type Style = {
  oneLine: string
  topics: string[]
  hooks: { pattern: string; example: string }[]
  structure: string
  design: { colors: string; type: string; layout: string; imagery: string }
  caption: string
  whyTop: string[]
  apply: string[]
  avoid: string[]
  imagesRead: number
  at: number
}
type Compare = { leader: string; common: string[]; differences: string[]; plan: string[]; at: number }
type Row = { stats?: Stats; error?: string; style?: Style; styleError?: string }

const TYPE_LABEL: Record<keyof Mix, string> = { carousel: '캐러셀', feed: '피드', reel: '릴스' }
const MAX = 5

/* ───────── 이 브라우저에 결과 기억 (다시 열어도 보이게) ───────── */
const KEY = 'account-analysis-v1'
type Saved = { rows: Record<string, Row>; order: string[]; compare?: Compare }
function loadSaved(): Saved {
  try {
    return { rows: {}, order: [], ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { rows: {}, order: [] }
  }
}
function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* 저장 못 해도 화면은 그대로 */
  }
}

const cleanUser = (v: string) => {
  const t = v.trim()
  const fromUrl = t.match(/instagram\.com\/([A-Za-z0-9._]+)/)?.[1]
  return (fromUrl || t).replace(/^@/, '').toLowerCase()
}
const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : '–')

/** 해외 카드뉴스 계정 분석: 숫자 → AI 스타일 → 여러 계정 비교 */
export default function AccountAnalysis({ igReady, watch, onWatch }: { igReady: boolean; watch: string[]; onWatch: (w: string[]) => void }) {
  const [picked, setPicked] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [data, setData] = useState<Saved>({ rows: {}, order: [] })
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    const s = loadSaved()
    setData(s)
    if (s.order.length) setPicked(s.order)
  }, [])
  const update = (fn: (s: Saved) => Saved) =>
    setData((cur) => {
      const next = fn(cur)
      save(next)
      return next
    })

  function add(v: string) {
    const u = cleanUser(v)
    setInput('')
    if (!/^[a-z0-9._]{1,30}$/.test(u)) return setErr('계정명이 올바르지 않아요.')
    setErr('')
    if (!picked.includes(u)) setPicked(picked.length >= MAX ? [...picked.slice(1), u] : [...picked, u])
  }

  async function runStats() {
    setBusy('stats')
    setErr('')
    const res = await analyzeAccounts(picked, 'card').catch((e: Error) => ({ error: e.message, accounts: [] }))
    setBusy('')
    if (res.error) return setErr(res.error)
    update((cur) => {
      const rows = { ...cur.rows }
      for (const a of res.accounts as (Stats & { error?: string })[]) {
        // 숫자를 새로 받으면 예전 스타일 분석은 남겨 둔다 (다시 분석하면 바뀜)
        rows[a.username] = a.error ? { error: a.error } : { ...rows[a.username], stats: a, error: undefined }
      }
      return { ...cur, rows, order: picked, compare: undefined }
    })
  }

  async function runStyle(u: string) {
    const st = data.rows[u]?.stats
    if (!st) return
    setBusy(`style:${u}`)
    const res = await analyzeStyle(st).catch((e: Error) => ({ error: e.message }))
    setBusy('')
    update((cur) => ({ ...cur, rows: { ...cur.rows, [u]: { ...cur.rows[u], ...('error' in res && res.error ? { styleError: res.error } : { style: res as Style, styleError: undefined }) } } }))
  }

  async function runCompare() {
    setBusy('compare')
    setErr('')
    const items = data.order.map((u) => data.rows[u]).filter((r) => r?.stats).map((r) => ({ stats: { ...r!.stats!, top: [], bottomCaptions: [] }, style: r!.style }))
    const res = await compareAccounts(items).catch((e: Error) => ({ error: e.message }))
    setBusy('')
    if ('error' in res && res.error) return setErr(res.error)
    update((cur) => ({ ...cur, compare: res as Compare }))
  }

  const shown = data.order.filter((u) => data.rows[u])
  const ok = shown.filter((u) => data.rows[u]?.stats).map((u) => data.rows[u]!.stats!)

  return (
    <section className="card acct">
      <div className="card-head">
        <h2>🔍 해외 계정 분석</h2>
      </div>
      <p className="muted small">해외 AI·정보 카드뉴스 계정의 최근 30개 게시물로 반응·형식·올리는 주기를 정리하고, 잘된 게시물을 AI가 읽어 스타일을 분석해요. 최대 {MAX}개 계정을 나란히 비교할 수 있어요. 비즈니스·크리에이터 계정만 돼요.</p>

      <form
        className="row-inline"
        onSubmit={(e) => {
          e.preventDefault()
          if (input.trim()) add(input)
        }}
      >
        <input aria-label="분석할 계정" placeholder="@계정명 또는 프로필 링크" value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" className="btn small" disabled={!input.trim()}>
          담기
        </button>
      </form>
      {watch.length > 0 && (
        <p className="small muted acct-from">
          워치리스트에서:{' '}
          {watch.map((u) => (
            <button key={u} type="button" className={`chip ${picked.includes(u) ? 'on' : ''}`} aria-pressed={picked.includes(u)} onClick={() => (picked.includes(u) ? setPicked(picked.filter((x) => x !== u)) : add(u))}>
              @{u}
            </button>
          ))}
        </p>
      )}
      {picked.length > 0 && (
        <div className="chips acct-picked">
          {picked.map((u) => (
            <span key={u} className="chip on">
              <span className="chip-in">@{u}</span>
              <button type="button" className="chip-x" aria-label={`@${u} 빼기`} onClick={() => setPicked(picked.filter((x) => x !== u))}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="row-inline wraps">
        <button type="button" className="btn primary small" disabled={!igReady || !picked.length || !!busy} onClick={runStats}>
          {busy === 'stats' ? '불러오는 중…' : `${picked.length || ''}개 계정 숫자 분석`}
        </button>
        {ok.length >= 2 && (
          <button type="button" className="btn small" disabled={!!busy} onClick={runCompare}>
            {busy === 'compare' ? '비교하는 중…' : '🤖 계정 비교 정리'}
          </button>
        )}
        <span className="hint">숫자 분석은 무료예요. 🤖 표시는 Gemini 요금이 붙을 수 있어요.</span>
      </div>
      {!igReady && <p className="hint">인스타 토큰이 연결되지 않아 분석할 수 없어요.</p>}
      {err && <p className="flash bad">{err}</p>}

      {ok.length > 0 && <CompareTable list={ok} />}
      {data.compare && <CompareView c={data.compare} />}

      {shown.map((u) => {
        const r = data.rows[u]!
        if (r.error)
          return (
            <p key={u} className="flash bad small">
              @{u}: {r.error}
            </p>
          )
        const s = r.stats!
        return (
          <article key={u} className="acct-card">
            <div className="acct-head">
              <a className="link" href={`https://www.instagram.com/${s.username}/`} target="_blank" rel="noreferrer">
                <b>@{s.username}</b> ↗
              </a>
              <span className="muted small">
                {s.name && `${s.name} · `}팔로워 {fmtCount(s.followers ?? undefined)}
                {s.from && s.to && ` · ${fmtDate(s.from)}~${fmtDate(s.to)} ${s.analyzed}개`}
              </span>
              {!watch.includes(s.username) && (
                <button type="button" className="btn ghost small" onClick={() => onWatch([...watch, s.username])}>
                  + 워치리스트
                </button>
              )}
            </div>
            <p className="small muted acct-top-label">반응 좋은 게시물</p>
            <ul className="acct-top">
              {s.top.map((p, i) => (
                <li key={p.id}>
                  <a href={p.permalink} target="_blank" rel="noreferrer" title={p.caption.split('\n')[0]}>
                    <span className="acct-thumb">{p.thumb ? <img src={p.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>{TYPE_LABEL[p.type]}</span>}</span>
                    <span className="small">
                      {i + 1}위 · {TYPE_LABEL[p.type]}
                    </span>
                    <span className="small muted">
                      ♥ {fmtCount(p.likes ?? undefined)} · 💬 {fmtCount(p.comments ?? undefined)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="row-inline wraps">
              <button type="button" className="btn small" disabled={!!busy} onClick={() => runStyle(u)}>
                {busy === `style:${u}` ? '잘된 게시물 읽는 중… (30초쯤)' : r.style ? '🤖 스타일 다시 분석' : '🤖 스타일 분석'}
              </button>
              {r.style && <span className="hint">{new Date(r.style.at).toLocaleDateString('ko-KR')} 분석 · 이미지 {r.style.imagesRead}장 읽음</span>}
            </div>
            {r.styleError && <p className="flash bad small">{r.styleError}</p>}
            {r.style && <StyleView st={r.style} />}
          </article>
        )
      })}
    </section>
  )
}

/* ───────── 숫자 비교표: 계정이 열, 항목이 행. 가장 좋은 값은 굵게 ───────── */
function CompareTable({ list }: { list: Stats[] }) {
  type Line = [string, (s: Stats) => number | null, (s: Stats) => string, boolean?]
  const lines: Line[] = [
    ['팔로워', (s) => s.followers, (s) => fmtCount(s.followers ?? undefined)],
    ['주당 게시', (s) => s.perWeek, (s) => (s.perWeek == null ? '–' : `${s.perWeek}회`)],
    ['평균 좋아요', (s) => s.avgLikes, (s) => fmtCount(s.avgLikes ?? undefined) + (s.hiddenLikes ? ` (숨김 ${s.hiddenLikes})` : '')],
    ['좋아요 중간값', (s) => s.medianLikes, (s) => fmtCount(s.medianLikes ?? undefined)],
    ['평균 댓글', (s) => s.avgComments, (s) => fmtCount(s.avgComments ?? undefined)],
    ['참여율', (s) => s.engagement, (s) => (s.engagement == null ? '–' : `${s.engagement}%`)],
    ['캐러셀 비율', (s) => s.mix.carousel / (s.analyzed || 1), (s) => pct(s.mix.carousel, s.analyzed)],
    ['캐러셀 평균 좋아요', (s) => s.avgLikesByType.carousel, (s) => fmtCount(s.avgLikesByType.carousel ?? undefined)],
    ['릴스 평균 좋아요', (s) => s.avgLikesByType.reel, (s) => fmtCount(s.avgLikesByType.reel ?? undefined)],
    ['반응 좋은 요일', () => null, (s) => s.bestDay ?? '–'],
    ['캡션 길이(평균)', () => null, (s) => `${s.avgCaption}자`],
    ['해시태그(평균)', () => null, (s) => `${s.avgHashtags}개`],
  ]
  return (
    <div className="table-wrap acct-table">
      <table className="mtable">
        <thead>
          <tr>
            <th scope="col">최근 30개 기준</th>
            {list.map((s) => (
              <th key={s.username} scope="col">
                @{s.username}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map(([label, val, show]) => {
            const vals = list.map(val)
            const best = list.length > 1 && vals.some((v) => v != null) ? Math.max(...vals.map((v) => v ?? -Infinity)) : null
            return (
              <tr key={label}>
                <th scope="row">{label}</th>
                {list.map((s, i) => (
                  <td key={s.username} className={best != null && vals[i] === best ? 'best' : ''}>
                    {show(s)}
                  </td>
                ))}
              </tr>
            )
          })}
          <tr>
            <th scope="row">형식 (캐러셀·피드·릴스)</th>
            {list.map((s) => (
              <td key={s.username}>
                {s.mix.carousel} · {s.mix.feed} · {s.mix.reel}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="hint">참여율 = (평균 좋아요 + 평균 댓글) ÷ 팔로워. 팔로워 규모가 다른 계정끼리는 참여율로 비교하세요.</p>
    </div>
  )
}

function StyleView({ st }: { st: Style }) {
  return (
    <div className="acct-style">
      <p>
        <b>{st.oneLine}</b>
      </p>
      {!!st.topics.length && <p className="small muted">주제: {st.topics.join(' · ')}</p>}
      <dl className="kv">
        {!!st.hooks.length && (
          <>
            <dt>첫 장 후킹</dt>
            <dd>
              <ul>
                {st.hooks.map((h, i) => (
                  <li key={i}>
                    {h.pattern}
                    {h.example && <span className="muted"> — “{h.example}”</span>}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {st.structure && (
          <>
            <dt>장 구성</dt>
            <dd>{st.structure}</dd>
          </>
        )}
        <dt>디자인</dt>
        <dd>{[st.design.colors && `색: ${st.design.colors}`, st.design.type && `글자: ${st.design.type}`, st.design.layout && `배치: ${st.design.layout}`, st.design.imagery && `이미지: ${st.design.imagery}`].filter(Boolean).join(' / ') || '–'}</dd>
        {st.caption && (
          <>
            <dt>캡션</dt>
            <dd>{st.caption}</dd>
          </>
        )}
        {!!st.whyTop.length && (
          <>
            <dt>잘된 이유</dt>
            <dd>
              <ul>{st.whyTop.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </dd>
          </>
        )}
        {!!st.apply.length && (
          <>
            <dt>내 카드뉴스에</dt>
            <dd>
              <ul>{st.apply.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </dd>
          </>
        )}
        {!!st.avoid.length && (
          <>
            <dt>따라 하지 말 것</dt>
            <dd>
              <ul>{st.avoid.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}

function CompareView({ c }: { c: Compare }) {
  return (
    <div className="acct-style acct-compare">
      <p>
        <b>🤖 비교 정리</b> <span className="hint">{new Date(c.at).toLocaleDateString('ko-KR')}</span>
      </p>
      {c.leader && <p className="small">{c.leader}</p>}
      <dl className="kv">
        {!!c.common.length && (
          <>
            <dt>공통점</dt>
            <dd>
              <ul>{c.common.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </dd>
          </>
        )}
        {!!c.differences.length && (
          <>
            <dt>다른 점</dt>
            <dd>
              <ul>{c.differences.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </dd>
          </>
        )}
        {!!c.plan.length && (
          <>
            <dt>이번 주에 해 볼 것</dt>
            <dd>
              <ul>{c.plan.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}
