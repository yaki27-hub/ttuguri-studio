'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { onBroadcast } from '@/lib/work/db'
import { listEpisodes } from '@/lib/work/repo'
import { STATUS_LABEL } from '@/lib/work/format'
import type { Episode } from '@/lib/work/types'

const MAX = 12

/** 왼쪽 메뉴: 진행 중인 에피소드 바로가기 (넓은 화면에서만 보임) */
export default function SideEpisodes() {
  const path = usePathname()
  const [eps, setEps] = useState<Episode[] | null>(null)

  useEffect(() => {
    const load = () => listEpisodes().then(setEps, () => setEps([]))
    load()
    return onBroadcast((m) => (m.kind === 'episode' || m.kind === 'episodes') && load())
  }, [])

  const active = (eps ?? []).filter((e) => e.status !== 'published' && e.status !== 'on_hold')
  const done = (eps ?? []).length - active.length

  return (
    <div className="side-eps">
      <p className="side-label">진행 중 {eps ? active.length : ''}</p>
      {eps && active.length === 0 && <p className="side-empty">아직 없어요. 작업에서 메모를 남겨 보세요.</p>}
      <ul>
        {active.slice(0, MAX).map((e) => {
          const href = `/studio/work/${e.id}`
          const on = path === href
          return (
            <li key={e.id}>
              <Link href={`${href}?stage=${e.stage}`} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
                <span className="side-ep-title">{e.title}</span>
                <span className="side-ep-meta">
                  {e.contentType === 'cardnews' ? '카드뉴스 · ' : ''}
                  {STATUS_LABEL[e.status]}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="side-more">
        {(active.length > MAX || done > 0) && (
          <Link href="/studio/work">
            전체 {eps?.length}편 보기{done > 0 ? ` (완료·보류 ${done})` : ''}
          </Link>
        )}
        <Link href="/studio/work#refs">레퍼런스 보드</Link>
      </div>
    </div>
  )
}
