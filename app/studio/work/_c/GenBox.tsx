'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { saveDraft, updateDraft } from '@/lib/work/repo'
import { ParseError, extractJSON } from '@/lib/work/prompts'
import type { DraftTarget, GenerationDraft } from '@/lib/work/types'
import { aiDraft } from '../actions'
import { CopyButton, Notice } from './ui'
import { useWS } from './Workspace'

interface Props<T> {
  title: string
  target: DraftTarget
  targetIds: string[]
  operation: string
  buildPrompt: () => string
  parse: (raw: unknown) => T
  preview: (t: T) => ReactNode
  apply: (t: T) => Promise<void>
  /** 요청 시점의 기준 revision. 적용 시 바뀌었으면 자동 적용하지 않는다. */
  getBase: () => number
  applyLabel?: string
  blocked?: string
  compact?: boolean
  /** 열리자마자 AI로 받기 (AI 키가 있을 때만) */
  autoRun?: boolean
  /** 받은 결과를 바로 적용 (덮어쓸 내용이 없을 때만 쓴다) */
  autoApply?: boolean
  /** AI 버튼 문구 */
  runLabel?: string
}

/**
 * 생성 보조: ① AI로 받기(서버 키가 있을 때만) ② 프롬프트 복사 → 결과 붙여넣기.
 * 결과는 항상 초안으로 보여주고, 사용자가 ‘적용’을 눌러야 반영된다.
 */
export default function GenBox<T>(p: Props<T>) {
  const ws = useWS()
  const [open, setOpen] = useState(!p.compact)
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [result, setResult] = useState<{ value: T; draft: GenerationDraft }>()
  const [base, setBase] = useState<{ rev: number; setting: number; prompt: string }>()
  const [aiBusy, setAiBusy] = useState(false)
  const [applying, setApplying] = useState(false)
  const [conflict, setConflict] = useState(false)
  const reqId = useRef(0)

  const snapshot = () => {
    const prompt = p.buildPrompt()
    const b = { rev: p.getBase(), setting: ws.settings.revision, prompt }
    setBase(b)
    return b
  }

  async function accept(raw: unknown, source: string, b = base ?? snapshot()) {
    setErrors([])
    setConflict(false)
    let value: T
    try {
      value = p.parse(raw)
    } catch (e) {
      setErrors(e instanceof ParseError ? e.errors : [(e as Error).message])
      return
    }
    const draft = await saveDraft({
      episodeId: ws.ep.id,
      targetType: p.target,
      targetIds: p.targetIds,
      operation: `${p.operation} (${source})`,
      baseRevision: b.rev,
      settingRevision: b.setting,
      inputSnapshot: b.prompt,
      output: raw,
      status: 'pending',
    })
    if (p.autoApply) {
      try {
        await p.apply(value)
        await updateDraft({ ...draft, status: 'applied' })
        setBase(undefined)
      } catch (e) {
        setErrors([`적용하지 못했어요: ${(e as Error).message}`])
        setResult({ value, draft })
      }
      return
    }
    setResult({ value, draft })
  }

  async function runAI() {
    const b = snapshot()
    const my = ++reqId.current
    setAiBusy(true)
    setErrors([])
    setResult(undefined)
    try {
      const r = await aiDraft(b.prompt)
      if (my !== reqId.current) return // 취소됨
      if (r.error) setErrors([`AI 생성 실패: ${r.error}`, '이전 내용은 그대로예요. 다시 시도하거나 프롬프트를 복사해 다른 곳에서 받아 붙여넣을 수 있어요.'])
      else await accept(r.output, 'AI', b)
    } catch (e) {
      if (my === reqId.current) setErrors([`AI 요청 실패: ${(e as Error).message}`])
    } finally {
      if (my === reqId.current) setAiBusy(false)
    }
  }

  const autoStarted = useRef(false)
  useEffect(() => {
    if (p.autoRun && ws.aiReady && !p.blocked && !autoStarted.current) {
      autoStarted.current = true
      runAI()
    }
    // 처음 열릴 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.autoRun])

  async function doApply(force = false) {
    if (!result || applying) return
    if (!force && result.draft.baseRevision !== p.getBase()) {
      setConflict(true)
      return
    }
    setApplying(true)
    try {
      await p.apply(result.value)
      await updateDraft({ ...result.draft, status: 'applied' })
      setResult(undefined)
      setBase(undefined)
      setText('')
      setConflict(false)
    } catch (e) {
      setErrors([`적용하지 못했어요: ${(e as Error).message}`])
    } finally {
      setApplying(false)
    }
  }

  if (p.compact && !open)
    return (
      <button type="button" className="btn small" onClick={() => setOpen(true)} disabled={!!p.blocked}>
        {p.title}
      </button>
    )

  return (
    <div className="genbox">
      <div className="card-head">
        <h3>{p.title}</h3>
        {p.compact && (
          <button type="button" className="btn ghost small" onClick={() => (setOpen(false), setResult(undefined), (reqId.current += 1), setAiBusy(false))}>
            닫기
          </button>
        )}
      </div>
      {p.blocked ? (
        <p className="muted small">{p.blocked}</p>
      ) : (
        <>
          <div className="row-inline">
            {ws.aiReady && (
              <button type="button" className="btn primary small" disabled={aiBusy} onClick={runAI}>
                {aiBusy ? 'AI 작성 중… (10~30초)' : p.runLabel ?? 'AI로 초안 받기'}
              </button>
            )}
            {aiBusy && (
              <button type="button" className="btn small" onClick={() => ((reqId.current += 1), setAiBusy(false))}>
                요청 취소
              </button>
            )}
            <CopyButton text={() => snapshot().prompt} label="프롬프트 복사" className="small" />
          </div>
          {!ws.aiReady && <p className="hint">AI 키가 연결되지 않았어요. 프롬프트를 복사해 Claude·Gemini 등에 붙여넣고, 받은 JSON을 아래에 붙여넣으세요.</p>}
          <details className="paste">
            <summary className="small">결과 붙여넣기</summary>
            <label className="sr-only" htmlFor={`paste-${p.operation}`}>
              생성 결과 JSON
            </label>
            <textarea id={`paste-${p.operation}`} rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"...": "..."} 형태의 JSON' />
            <button
              type="button"
              className="btn small"
              disabled={!text.trim()}
              onClick={() => {
                try {
                  accept(extractJSON(text), '붙여넣기')
                } catch (e) {
                  setErrors(e instanceof ParseError ? e.errors : [(e as Error).message])
                }
              }}
            >
              결과 확인
            </button>
          </details>
        </>
      )}

      {errors.length > 0 && (
        <Notice kind="error">
          <ul className="errs">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {text && <span className="small">붙여넣은 내용은 그대로 남아 있어요.</span>}
        </Notice>
      )}

      {result && (
        <div className="draft-box">
          <p className="draft-label">
            <span className="tag warn">초안</span> 아직 적용되지 않았어요
          </p>
          {p.preview(result.value)}
          {conflict && (
            <Notice kind="warn">
              요청한 뒤에 내용이 바뀌었어요. 최신 내용과 비교해 본 뒤 적용할지 정해 주세요.
              <div className="row-inline">
                <button type="button" className="btn small" onClick={() => doApply(true)}>
                  확인했고 그래도 적용
                </button>
              </div>
            </Notice>
          )}
          <div className="row-inline">
            <button type="button" className="btn primary small" disabled={applying} onClick={() => doApply()}>
              {applying ? '적용 중…' : p.applyLabel ?? '적용'}
            </button>
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                await updateDraft({ ...result.draft, status: 'discarded' })
                setResult(undefined)
                setBase(undefined)
                setConflict(false)
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
