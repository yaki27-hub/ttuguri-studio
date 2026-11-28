'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createEpisode } from '@/lib/work/repo'
import { upcomingSeasons, type Season } from '@/lib/work/patterns'
import { seasonHistory } from './actions'

type Past = { caption: string; permalink: string; timestamp: string; views: number | null; shares: number | null; reach: number | null; reels: boolean }

const fmt = (n: number | null) => (typeof n === 'number' ? n.toLocaleString('ko-KR') : '–')
const date = (ts: string) =>
  new Date(String(ts).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: 'numeric', day: 'numeric' })

/** 소재 찾기: 다가오는 시즌(첫 추위·연차 소진·연말정산…)을 미리 띄우고, 내 지난 비슷한 편 성과를 같이 본다 */
export default function SeasonCalendar({ channel = 'toon' }: { channel?: 'toon' | 'card' }) {
  const router = useRouter()
  const list = upcomingSeasons(45)
  const [past, setPast] = useState<Record<string, Past[]> | null>(null)
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [making, setMaking] = useState('')

  async function load() {
    setBusy(true)
    setErr('')
    const r = await seasonHistory(list.map(({ id, words }) => ({ id, words })), channel)
    setBusy(false)
    if ('error' in r && r.error) return setErr(`불러오지 못했어요: ${r.error}`)
    setPast((r as { history: Record<string, Past[]> }).history)
    setTotal((r as { total: number }).total)
  }

  async function make(s: Season) {
    setMaking(s.id)
    try {
      const ep = await createEpisode(`[시즌: ${s.label}] ${s.idea}`, { title: s.idea, titleIsAuto: false, patterns: ['시즌'], tags: ['회사생활'] })
      router.push(`/studio/work/${ep.id}`)
    } finally {
      setMaking('')
    }
  }

  return (
    <section className="card season-cal" aria-labelledby="season-title">
      <div className="card-head">
        <h2 id="season-title">다가오는 시즌</h2>
        <button type="button" className="btn small" disabled={busy || !list.length} onClick={load}>
          {busy ? '찾는 중…' : past ? '다시 찾기' : '지난 비슷한 편 성과 보기'}
        </button>
      </div>
      <p className="muted small">앞으로 45일 안의 시기예요. 2~3주 전에 미리 만들어 두면 그 시기에 바로 올릴 수 있어요.</p>
      {err && <p className="flash bad">{err}</p>}
      {!list.length && <p className="muted small">45일 안에 표시할 시즌이 없어요.</p>}
      <ul className="season-list">
        {list.map((s) => {
          const ps = past?.[s.id]
          return (
            <li key={s.id}>
              <div className="season-head">
                <span className={`tag ${s.dday === 0 ? 'hot' : ''}`}>{s.dday === 0 ? '지금' : `D-${s.dday}`}</span>
                <b>{s.label}</b>
                <span className="muted small">
                  {s.start.replace('-', '/')}~{s.end.replace('-', '/')}
                </span>
              </div>
              <p className="small">💡 {s.idea}</p>
              {past && (
                <div className="season-past small">
                  {ps?.length ? (
                    ps.map((p) => (
                      <a key={p.permalink} href={p.permalink} target="_blank" rel="noreferrer" className="season-post">
                        <span className="muted">
                          {date(p.timestamp)} {p.reels ? '릴스' : '피드'}
                        </span>{' '}
                        {p.caption.slice(0, 40)} <span className="muted">· 조회 {fmt(p.views)} · 공유 {fmt(p.shares)}</span>
                      </a>
                    ))
                  ) : (
                    <span className="muted">지난 게시물 {total}개 중 이 시즌 말({s.words.slice(0, 3).join('·')})이 들어간 편이 없어요.</span>
                  )}
                </div>
              )}
              <button type="button" className="btn small ghost" disabled={!!making} onClick={() => make(s)}>
                {making === s.id ? '만드는 중…' : '이 시즌으로 작업 만들기'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
