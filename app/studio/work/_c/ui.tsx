'use client'

import { useEffect, useId, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { getAsset } from '@/lib/work/repo'
import { copyText } from '@/lib/work/format'

/* ───────── 입력 ───────── */

interface FieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  label: ReactNode
  value: string
  onChange: (v: string) => void
  hint?: ReactNode
  single?: boolean
}

export function Field({ label, value, onChange, hint, single, className, ...rest }: FieldProps) {
  const id = useId()
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || single) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 2 + 'px'
  }, [value, single])
  return (
    <div className={`field ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      {single ? (
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} readOnly={rest.readOnly} placeholder={rest.placeholder} onBlur={rest.onBlur as never} />
      ) : (
        <textarea id={id} ref={ref} rows={rest.rows ?? 2} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      )}
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

export function ListField({ label, value, onChange, hint, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; hint?: string; placeholder?: string }) {
  const [text, setText] = useState(value.join(', '))
  const id = useId()
  useEffect(() => {
    if (text.split(',').map((s) => s.trim()).filter(Boolean).join('|') !== value.join('|')) setText(value.join(', '))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.join('|')])
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value)
          onChange(
            e.target.value
              .split(',')
              .map((s) => s.trim().replace(/^#/, ''))
              .filter(Boolean),
          )
        }}
      />
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

/* ───────── 복사 ───────── */

export function CopyButton({ text, label = '복사', className = '' }: { text: string | (() => string); label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [fallback, setFallback] = useState('')
  return (
    <>
      <button
        type="button"
        className={`btn ${className}`}
        onClick={async () => {
          const t = typeof text === 'function' ? text() : text
          const ok = await copyText(t)
          setState(ok ? 'ok' : 'fail')
          if (!ok) setFallback(t)
          setTimeout(() => setState('idle'), 1800)
        }}
      >
        {state === 'ok' ? '✓ 복사됨' : label}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === 'ok' ? '클립보드에 복사했어요' : ''}
      </span>
      {fallback && (
        <Modal title="직접 복사해 주세요" onClose={() => setFallback('')}>
          <p className="hint">클립보드 접근이 막혀 있어요. 아래 텍스트를 길게 눌러 전체 선택 후 복사하세요.</p>
          <textarea className="fallback" readOnly value={fallback} rows={10} onFocus={(e) => e.currentTarget.select()} autoFocus />
        </Modal>
      )}
    </>
  )
}

/* ───────── 모달 ───────── */

export function Modal({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-labelledby="modal-title">
      <div className="modal-head">
        <h2 id="modal-title">{title}</h2>
        <button type="button" className="btn ghost icon" aria-label="닫기" onClick={() => ref.current?.close()}>
          ✕
        </button>
      </div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </dialog>
  )
}

/* ───────── 이미지 ───────── */

/** assetId로 이미지를 표시. object URL은 표시용으로만 만들고 해제한다. */
export function AssetImage({ id, alt, className, onClick }: { id?: string; alt: string; className?: string; onClick?: () => void }) {
  const [url, setUrl] = useState<string>()
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    let u: string | undefined
    let live = true
    setUrl(undefined)
    setMissing(false)
    if (id)
      getAsset(id).then((a) => {
        if (!live) return
        if (!a) return setMissing(true)
        u = URL.createObjectURL(a.blob)
        setUrl(u)
      })
    return () => {
      live = false
      if (u) URL.revokeObjectURL(u)
    }
  }, [id])
  if (!id) return null
  if (missing) return <div className={`img-missing ${className ?? ''}`}>파일 없음</div>
  if (!url) return <div className={`img-loading ${className ?? ''}`} aria-busy="true" />
  return onClick ? (
    <button type="button" className="img-btn" onClick={onClick} aria-label={`${alt} 크게 보기`}>
      <img src={url} alt={alt} className={className} />
    </button>
  ) : (
    <img src={url} alt={alt} className={className} />
  )
}

export function FilePick({ label, onFile, className = '', disabled }: { label: string; onFile: (f: File) => void; className?: string; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button type="button" className={`btn ${className}`} disabled={disabled} onClick={() => ref.current?.click()}>
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />
    </>
  )
}

export function Lightbox({ id, alt, onClose }: { id: string; alt: string; onClose: () => void }) {
  return (
    <Modal title={alt} onClose={onClose}>
      <AssetImage id={id} alt={alt} className="lightbox-img" />
    </Modal>
  )
}

/* ───────── 알림 ───────── */

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const icon = { info: 'ℹ︎', warn: '⚠︎', error: '⛔︎', ok: '✓' }[kind]
  return (
    <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span aria-hidden="true">{icon}</span>
      <div>{children}</div>
    </div>
  )
}

export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

/** 하나만 고르는 칩 줄 */
export function Chips<T extends string>({ legend, value, options, onChange }: { legend: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <fieldset className="chips">
      <legend className="small muted">{legend}</legend>
      {options.map(([v, label]) => (
        <label key={v} className={`chip${v === value ? ' on' : ''}`}>
          <input type="radio" name={legend} value={v} checked={v === value} onChange={() => onChange(v)} />
          {label}
        </label>
      ))}
    </fieldset>
  )
}
