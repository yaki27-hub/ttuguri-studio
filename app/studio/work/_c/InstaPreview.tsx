'use client'

import { useEffect, useRef, useState } from 'react'
import { OUTPUT_LABEL, outputsOf } from '@/lib/work/format'
import { cutName, dialogueLines } from '@/lib/work/prompts'
import { finalCaption } from '@/lib/work/zip'
import { checkCaption } from '@/lib/work/caption'
import { newPublication } from '@/lib/work/repo'
import type { Episode, Output, Panel } from '@/lib/work/types'
import { AssetImage } from './ui'
import { useWS } from './Workspace'

/** 릴스에서 컷 하나가 보이는 시간(ms). 첫 컷은 후킹이라 짧게 */
const REEL_MS = [1800, 2600, 2600, 2600]

/** "이름: "대사"" → 대사 */
const bare = (line: string) => line.replace(/^[^:]{1,20}:\s*"(.*)"$/, '$1')

/** 컷에 올릴 한 줄: 첫 컷은 첫 화면 문구, 나머지는 첫 대사 또는 자막 */
export function cutLine(ep: Episode, p: Panel, i: number) {
  if (i === 0 && ep.hookText?.trim()) return ep.hookText.trim()
  const d = dialogueLines(p)[0]
  return d ? bare(d) : p.narration.trim()
}

/**
 * 인스타에 올라간 모습 미리보기. 실제 앱과 글자 크기·잘림은 조금 다를 수 있다.
 * - 캐러셀: 옆으로 넘기는 4:5 슬라이드 + 캡션(‘더 보기’ 전까지)
 * - 릴스: 9:16 화면에서 컷이 차례로 넘어가며 반복
 */
export default function InstaPreview() {
  const { ep, b, settings } = useWS()
  const outs = outputsOf(ep.outputs)
  const [view, setView] = useState<Output>(outs[0])
  const shown = outs.includes(view) ? view : outs[0]
  const name = settings.handle?.replace(/^@/, '') || settings.seriesName || settings.characterName || '내 계정'

  if (!b.panels.length)
    return (
      <div className="preview">
        <h2 className="small muted">인스타 미리보기</h2>
        <p className="muted small">시안을 만들면 여기서 인스타에 올라간 모습을 볼 수 있어요.</p>
      </div>
    )

  return (
    <div className="preview">
      <div className="card-head">
        <h2 className="small muted">인스타 미리보기</h2>
        {outs.length > 1 && (
          <div className="seg" role="tablist" aria-label="미리보기 종류">
            {outs.map((o) => (
              <button key={o} type="button" role="tab" aria-selected={shown === o} className={shown === o ? 'on' : ''} onClick={() => setView(o)}>
                {OUTPUT_LABEL[o]}
              </button>
            ))}
          </div>
        )}
      </div>
      {shown === 'carousel' ? <Carousel name={name} /> : <Reel name={name} />}
      <p className="hint">실제 인스타와 글자 크기·잘림은 조금 다를 수 있어요.</p>
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="ig-head">
      <span className="ig-avatar" aria-hidden>
        {name.slice(0, 1)}
      </span>
      <b className="small">{name}</b>
    </div>
  )
}

function Slide({ ep, p, i, count }: { ep: Episode; p: Panel; i: number; count: number }) {
  const line = cutLine(ep, p, i)
  const showText = !p.assetId || !p.assetIsFinal
  return (
    <div className="ig-slide">
      {p.assetId ? <AssetImage id={p.assetId} alt={`${cutName(ep, count, i)} 그림`} className="ig-img" /> : <div className="ig-empty">{p.scene || '그림 자리'}</div>}
      {showText && line && <span className={`ig-text${i === 0 ? ' hook' : ''}`}>{line}</span>}
    </div>
  )
}

function Carousel({ name }: { name: string }) {
  const { ep, b } = useWS()
  const panels = b.panels
  const [idx, setIdx] = useState(0)
  const [more, setMore] = useState(false)
  const track = useRef<HTMLDivElement>(null)
  const pub = b.publication ?? newPublication(ep.id, ep.panelsRevision)
  const cap = checkCaption(finalCaption(pub))
  const go = (n: number) => track.current?.scrollTo({ left: n * track.current.clientWidth, behavior: 'smooth' })

  return (
    <div className="phone">
      <Avatar name={name} />
      <div className="ig-frame">
        <div
          className="ig-track"
          ref={track}
          onScroll={(e) => {
            const el = e.currentTarget
            setIdx(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
          }}
        >
          {panels.map((p, i) => (
            <Slide key={p.id} ep={ep} p={p} i={i} count={panels.length} />
          ))}
        </div>
        {panels.length > 1 && (
          <>
            <span className="ig-count">
              {idx + 1}/{panels.length}
            </span>
            {idx > 0 && (
              <button type="button" className="ig-nav prev" aria-label="이전 장" onClick={() => go(idx - 1)}>
                ‹
              </button>
            )}
            {idx < panels.length - 1 && (
              <button type="button" className="ig-nav next" aria-label="다음 장" onClick={() => go(idx + 1)}>
                ›
              </button>
            )}
          </>
        )}
      </div>
      <div className="ig-actions" aria-hidden>
        ♡ 💬 ➤
        {panels.length > 1 && (
          <span className="ig-dots">
            {panels.map((p, i) => (
              <i key={p.id} className={i === idx ? 'on' : ''} />
            ))}
          </span>
        )}
      </div>
      <p className="ig-caption small">
        <b>{name}</b>{' '}
        {cap.length === 0 ? <span className="muted">캡션 없음</span> : more || !cap.truncated ? finalCaption(pub) : `${cap.visible}`}
        {cap.truncated && !more && (
          <button type="button" className="linklike muted" onClick={() => setMore(true)}>
            … 더 보기
          </button>
        )}
      </p>
    </div>
  )
}

function Reel({ name }: { name: string }) {
  const { ep, b } = useWS()
  const panels = b.panels
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)
  const cur = Math.min(i, panels.length - 1)

  useEffect(() => {
    if (!playing || !panels.length) return
    const t = setTimeout(() => setI((x) => (x + 1) % panels.length), REEL_MS[Math.min(cur, REEL_MS.length - 1)])
    return () => clearTimeout(t)
  }, [playing, cur, panels.length])

  const p = panels[cur]
  const line = cutLine(ep, p, cur)
  const total = panels.reduce((s, _, k) => s + REEL_MS[Math.min(k, REEL_MS.length - 1)], 0)

  return (
    <div className="phone">
      <div className="reel" onClick={() => setPlaying((v) => !v)} role="button" tabIndex={0} aria-label={playing ? '일시정지' : '재생'} onKeyDown={(e) => e.key === ' ' && setPlaying((v) => !v)}>
        <div className="reel-bars" aria-hidden>
          {panels.map((x, k) => (
            <i key={x.id} className={k < cur ? 'done' : k === cur ? (playing ? 'run' : 'done') : ''} style={k === cur ? { animationDuration: `${REEL_MS[Math.min(k, REEL_MS.length - 1)]}ms` } : undefined} />
          ))}
        </div>
        {line && <span className={`reel-text${cur === 0 ? ' hook' : ''}`}>{line}</span>}
        <div className="reel-img">{p.assetId ? <AssetImage id={p.assetId} alt={`${cutName(ep, panels.length, cur)} 그림`} className="ig-img" /> : <div className="ig-empty">{p.scene || '그림 자리'}</div>}</div>
        <div className="reel-foot small">
          <b>{name}</b>
          <span className="muted">{(total / 1000).toFixed(1)}초 · 반복</span>
        </div>
        {!playing && <span className="reel-paused">일시정지</span>}
      </div>
    </div>
  )
}
