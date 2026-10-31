'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { uid } from '@/lib/work/db'
import { createEpisode, findByNotion } from '@/lib/work/repo'

interface NotionEp {
  title: string
  format?: string
  empathy?: string
  twist?: string
  category?: string
  body: string
}

/** 노션 에피소드를 작업실로. 이미 연결된 게 있으면 그대로 연다. */
export default function OpenFromNotion({ pageId, episode, error }: { pageId: string; episode: NotionEp | null; error: string }) {
  const router = useRouter()
  const [err, setErr] = useState(error)
  const started = useRef(false)

  useEffect(() => {
    if (error || !episode || !pageId || started.current) return
    started.current = true
    ;(async () => {
      try {
        const found = await findByNotion(pageId)
        if (found) return router.replace(`/studio/work/${found.id}?stage=${found.stage}`)
        // 노션 제목이 원문. 공감·반전 등 노션 필드는 확인 전 제안으로만 옮긴다.
        const notes = [episode.empathy && `노션 핵심 공감: ${episode.empathy}`, episode.twist && `노션 웃음·반전: ${episode.twist}`, episode.body && `노션 본문:\n${episode.body}`]
          .filter(Boolean)
          .join('\n\n')
        const ep = await createEpisode(episode.title, {
          notionPageId: pageId,
          notes,
          format: episode.format === '한컷' ? 'single' : 'four',
          tags: episode.category ? [episode.category] : [],
          facts: [],
          humorPoint: episode.twist ?? '',
          unknowns: [],
          links: [{ id: uid(), url: `https://www.notion.so/${pageId.replace(/-/g, '')}`, note: '노션 에피소드' }],
        })
        router.replace(`/studio/work/${ep.id}`)
      } catch (e) {
        setErr((e as Error).message)
      }
    })()
  }, [pageId, episode, error, router])

  return (
    <section className="card">
      {err ? (
        <>
          <p className="flash bad">작업실을 열지 못했어요: {err}</p>
          <Link href="/studio/work" className="btn">
            작업실로
          </Link>
        </>
      ) : (
        <p className="muted small">작업실을 여는 중…</p>
      )}
    </section>
  )
}
