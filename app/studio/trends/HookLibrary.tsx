'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { createEpisode, listEpisodes } from '@/lib/work/repo'
import { onBroadcast } from '@/lib/work/db'
import { STATUS_LABEL } from '@/lib/work/format'
import { HOOKS, HOOK_GRADE_LABEL, HOOK_PLAN, hookFormat, type Hook, type HookGrade } from '@/lib/work/hooks'
import type { Episode } from '@/lib/work/types'

/** 뚜구리툰 후킹 라이브러리: 26개 후킹 + 첫 4주 제작 순서. 고르면 그 후킹으로 작업을 만든다. */
export default function HookLibrary() {
  const router = useRouter()
  const [eps, setEps] = useState<Episode[]>([])
  const [grade, setGrade] = useState<HookGrade | ''>('A')
  const [unusedOnly, setUnusedOnly] = useState(false)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    const load = () => listEpisodes().then(setEps)
    load()
    return onBroadcast((m) => m.kind === 'episodes' && load())
  }, [])

  const used = useMemo(() => {
    const m = new Map<string, Episode[]>()
    for (const e of eps) if (e.hookId) m.set(e.hookId, [...(m.get(e.hookId) ?? []), e])
    return m
  }, [eps])

  const nextUp = HOOK_PLAN.flatMap((w) => w.ids).find((id) => !used.has(id))
  const list = HOOKS.filter((h) => (!grade || h.grade === grade) && (!unusedOnly || !used.has(h.id)))

  async function make(h: Hook) {
    setBusy(h.id)
    try {
      const ep = await createEpisode(`[${h.id}] ${h.title} — ${h.hook}`, {
        title: h.title,
        titleIsAuto: false,
        hookText: h.hook,
        hookId: h.id,
        format: hookFormat(h),
        tags: [h.type.split('/')[0].trim()].filter(Boolean),
      })
      router.push(`/studio/work/${ep.id}`)
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="card hooks">
      <div className="card-head">
        <h2>🪝 후킹 라이브러리</h2>
        <span className="muted small">
          {used.size}/{HOOKS.length} 사용
        </span>
      </div>
      <p className="muted small">첫 1~3초에 읽히는 첫 화면 문구 모음이에요. 고르면 그 문구로 작업이 만들어지고, 번호(H01~H26)가 붙어 나중에 성과를 비교할 수 있어요. 다음 컷·반전은 콘티 후보일 뿐이니 실제 겪은 일로 채워 주세요.</p>

      <div className="hook-plan">
        {HOOK_PLAN.map((w) => (
          <div key={w.week} className="hook-week">
            <b>{w.week}주차</b>
            {w.ids.map((id) => (
              <span key={id} className={`tag${used.has(id) ? ' good' : id === nextUp ? ' hot' : ''}`}>
                {used.has(id) ? '✓ ' : ''}
                {id}
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="row-inline wraps">
        <div className="chips" role="group" aria-label="등급">
          {(['A', 'B', 'C', ''] as const).map((g) => (
            <button key={g || 'all'} type="button" className={`chip${grade === g ? ' on' : ''}`} onClick={() => setGrade(g)}>
              {g ? HOOK_GRADE_LABEL[g] : '전체'}
            </button>
          ))}
        </div>
        <label className="check small">
          <input type="checkbox" checked={unusedOnly} onChange={(e) => setUnusedOnly(e.target.checked)} /> 안 쓴 것만
        </label>
      </div>

      <ul className="hook-list">
        {list.map((h) => {
          const mine = used.get(h.id) ?? []
          return (
            <li key={h.id} className={`hook-item${h.id === nextUp ? ' next' : ''}`}>
              <div className="hook-tags">
                <span className="tag">{h.id}</span>
                <span className="tag">{h.type}</span>
                {h.grade === 'C' && <span className="tag">정보툰</span>}
                {h.id === nextUp && <span className="tag hot">다음 차례</span>}
              </div>
              <p className="hook-text">“{h.hook}”</p>
              <p className="small muted">
                <b>다음 컷</b> {h.next}
                {h.twist && (
                  <>
                    {' '}
                    <b>반전 후보</b> {h.twist}
                  </>
                )}
              </p>
              {mine.length > 0 && (
                <p className="small">
                  {mine.map((e) => (
                    <Link key={e.id} className="link" href={`/studio/work/${e.id}?stage=${e.stage}`}>
                      {e.title} · {STATUS_LABEL[e.status]}
                    </Link>
                  ))}
                </p>
              )}
              <button type="button" className="btn small" disabled={!!busy} onClick={() => make(h)}>
                {busy === h.id ? '만드는 중…' : mine.length ? '이 후킹으로 한 편 더' : '이 후킹으로 만들기 →'}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
