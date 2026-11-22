'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { patchEpisode } from '@/lib/work/repo'
import { DEFAULT_QUEUE_OPTIONS, QUEUE_LABEL, draftQueued, enqueue, parseQueueLines, type QueueOptions } from '@/lib/work/queue'
import { fmtDateTime } from '@/lib/work/format'
import type { Episode, QueueState } from '@/lib/work/types'

const AUTO_KEY = 'card-queue-autorun'
const readAuto = () => {
  try {
    return localStorage.getItem(AUTO_KEY) === '1'
  } catch {
    return false
  }
}
const OPT_KEY = 'card-queue-options'
const readOpts = (): QueueOptions => {
  try {
    return { ...DEFAULT_QUEUE_OPTIONS, ...JSON.parse(localStorage.getItem(OPT_KEY) || '{}') }
  } catch {
    return DEFAULT_QUEUE_OPTIONS
  }
}
const ORDER: Record<QueueState, number> = { running: 0, check: 1, waiting: 2, done: 3 }

/**
 * 카드뉴스 대기 목록. 주제·링크를 한 줄씩 적어 두면
 * '초안 만들기' 한 번에 기사 읽기 → 사실 정리 → 장 구성까지 차례로 만든다.
 */
export default function QueueBox({ eps, aiReady, onChange }: { eps: Episode[] | null; aiReady: boolean; onChange: () => void }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [run, setRun] = useState<{ id: string; step: string; n: number; total: number } | null>(null)
  const [auto, setAuto] = useState(false)
  const [opts, setOpts] = useState<QueueOptions>(DEFAULT_QUEUE_OPTIONS)
  const setOpt = (k: keyof QueueOptions, v: boolean) => {
    const next = { ...opts, [k]: v }
    setOpts(next)
    try {
      localStorage.setItem(OPT_KEY, JSON.stringify(next))
    } catch {
      /* 저장 못 해도 이번 화면에서는 동작 */
    }
  }
  const stop = useRef(false)
  const optsRef = useRef(opts)
  optsRef.current = opts
  const autoDone = useRef(false)

  const items = (eps ?? []).filter((e) => e.queue).sort((a, b) => ORDER[a.queue!] - ORDER[b.queue!] || (a.queuedAt ?? '').localeCompare(b.queuedAt ?? ''))
  // 만드는 중인데 지금 돌고 있지 않으면 (화면을 떠나 멈춘 것) 다시 할 수 있게 대기로 본다
  const stateOf = (e: Episode): QueueState => (e.queue === 'running' && run?.id !== e.id ? 'waiting' : e.queue!)
  const waiting = items.filter((e) => stateOf(e) === 'waiting')
  const lines = parseQueueLines(text)

  async function add() {
    if (!lines.length) return
    setErr('')
    try {
      for (const l of lines) await enqueue(l.line, l.urls)
      setText('')
      onChange()
    } catch (e) {
      setErr(`넣지 못했어요: ${(e as Error).message}`)
    }
  }

  async function runAll(list = waiting) {
    if (run || !list.length) return
    stop.current = false
    for (let i = 0; i < list.length; i++) {
      if (stop.current) break
      const ep = list[i]
      setRun({ id: ep.id, step: '시작하는 중', n: i + 1, total: list.length })
      await draftQueued(ep.id, (step) => setRun({ id: ep.id, step, n: i + 1, total: list.length }), optsRef.current)
      onChange()
    }
    setRun(null)
    onChange()
  }

  async function set(ep: Episode, patch: Partial<Episode>) {
    await patchEpisode(ep.id, patch)
    onChange()
  }

  // 설정해 두면 이 화면을 열 때 대기 중인 것을 바로 만든다 (아침에 열기만 하면 되게)
  useEffect(() => {
    setAuto(readAuto())
    const o = readOpts()
    setOpts(o)
    optsRef.current = o
  }, [])
  useEffect(() => {
    if (!auto || autoDone.current || !aiReady || !eps) return
    autoDone.current = true
    if (waiting.length) runAll(waiting)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, aiReady, eps])

  return (
    <section className="card queue-box" aria-labelledby="queue-title">
      <div className="card-head">
        <h2 id="queue-title">대기 목록</h2>
        <span className="muted small">
          대기 {waiting.length} · 전체 {items.length}
        </span>
      </div>
      <p className="muted small">
        만들 주제나 기사 링크를 한 줄에 하나씩 적어 두세요. ‘초안 만들기’를 누르면 기사 읽기 → 사실 정리 → 장 구성 → 장 이미지 → 캡션까지 차례로 만들어 둬요.
      </p>

      <label className="sr-only" htmlFor="queue-input">
        대기 목록에 넣을 주제
      </label>
      <textarea
        id="queue-input"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'예)\nhttps://www.theverge.com/… (기사 링크만 넣어도 돼요)\n클로드 새 기능 정리 https://www.anthropic.com/news/…'}
      />
      <div className="row-inline wraps">
        <button type="button" className="btn" disabled={!lines.length} onClick={add}>
          {lines.length > 1 ? `${lines.length}개 대기에 넣기` : '대기에 넣기'}
        </button>
        <button type="button" className="btn primary" disabled={!aiReady || !!run || !waiting.length} onClick={() => runAll()}>
          {run ? `만드는 중 ${run.n}/${run.total}…` : `대기 ${waiting.length}개 초안 만들기`}
        </button>
        {run && (
          <button type="button" className="btn ghost small" onClick={() => (stop.current = true)}>
            이번 것까지만
          </button>
        )}
      </div>
      <div className="q-opts">
        <span className="muted small">어디까지:</span>
        <span className="small q-fixed">장 구성</span>
        <label className="check small">
          <input type="checkbox" checked={opts.images} disabled={!!run} onChange={(e) => setOpt('images', e.target.checked)} /> 장 이미지 (한 편에 1~3분)
        </label>
        <label className="check small">
          <input type="checkbox" checked={opts.caption} disabled={!!run} onChange={(e) => setOpt('caption', e.target.checked)} /> 캡션·해시태그
        </label>
      </div>
      <label className="check small">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => {
            setAuto(e.target.checked)
            try {
              localStorage.setItem(AUTO_KEY, e.target.checked ? '1' : '0')
            } catch {
              /* 저장 못 해도 이번 화면에서는 동작 */
            }
          }}
        />{' '}
        이 화면을 열면 대기 중인 것 바로 만들기 (이 브라우저에서만)
      </label>
      {!aiReady && <p className="hint">AI 키가 없어 초안을 만들 수 없어요. 설정에서 Gemini 키를 확인해 주세요.</p>}
      {err && <p className="flash bad">{err}</p>}

      {items.length > 0 && (
        <ul className="queue-list">
          {items.map((e) => {
            const s = stateOf(e)
            const active = run?.id === e.id
            return (
              <li key={e.id} className={`q-${s}`}>
                <span className={`q-tag q-${s}`}>{active ? run!.step : QUEUE_LABEL[s]}</span>
                <div className="q-body">
                  <Link className="clamp" href={`/studio/work/${e.id}`}>
                    {e.title}
                  </Link>
                  {e.queueNote && <p className={`small ${s === 'check' ? 'warn-text' : 'muted'}`}>{e.queueNote}</p>}
                  {s === 'done' && <p className="hint">{fmtDateTime(e.updatedAt)} 완료 · 열어서 사실·이미지를 확인한 뒤 피그마로 보내세요</p>}
                </div>
                <div className="q-actions">
                  {s === 'check' && (
                    <button type="button" className="btn small" disabled={!!run} onClick={() => set(e, { queue: 'waiting', queueNote: '' })}>
                      다시 대기
                    </button>
                  )}
                  {!active && (
                    <button type="button" className="btn ghost small" onClick={() => set(e, { queue: undefined, queueNote: undefined })} title="목록에서만 빼요. 작업은 소재 목록에 남아요.">
                      {s === 'done' ? '확인함' : '빼기'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
