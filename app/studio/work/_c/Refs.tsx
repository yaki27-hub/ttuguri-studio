'use client'

import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_PROVEN, isProven, loadProvenRule, saveProvenRule, type ProvenRule } from '@/lib/work/reflab'
import {
  DuplicateRefError,
  REF_FORMAT_LABEL,
  REF_PLATFORM_LABEL,
  REF_POST_TYPE_LABEL,
  REF_TAGS,
  createReference,
  fmtCount,
  parseCount,
  platformOf,
  postTypeOf,
  refTitle,
} from '@/lib/work/refs'
import { fmtDate } from '@/lib/work/format'
import { REF_FORMATS, REF_POST_TYPES, type RefFormat, type RefPostType, type Reference } from '@/lib/work/types'
import { Field, Modal } from './ui'

/* ───────── 새 레퍼런스 입력 ───────── */

/** 인스타 링크에서 계정명을 알 수 있으면 미리 채운다 (instagram.com/계정/…) */
function accountFromUrl(url: string) {
  try {
    const u = new URL(url)
    if (platformOf(url) !== 'instagram') return ''
    const first = u.pathname.split('/').filter(Boolean)[0] ?? ''
    return ['p', 'reel', 'reels', 'tv', 'stories', 'explore'].includes(first) ? '' : first
  } catch {
    return ''
  }
}

/** 다른 화면에서 미리 채워 여는 값 (비슷한 것 찾기 결과 등) */
export type RefFormInitial = Partial<{ account: string; postType: RefPostType; format: RefFormat; tags: string[]; likes: number; comments: number; metricsSource: string; take: string; note: string; caption: string }>

export function RefForm({ url, onSaved, onCancel, onExisting, channel = 'toon', initial = {} }: { url: string; onSaved: (r: Reference) => void; onCancel: () => void; onExisting: (r: Reference) => void; channel?: 'toon' | 'card'; initial?: RefFormInitial }) {
  const num = (n?: number) => (n === undefined || n === null ? '' : String(n))
  const [account, setAccount] = useState(() => initial.account ?? accountFromUrl(url))
  const [postType, setPostType] = useState<RefPostType | ''>(() => initial.postType ?? postTypeOf(url) ?? '')
  const [format, setFormat] = useState<RefFormat | ''>(initial.format ?? 'four')
  const [tags, setTags] = useState<string[]>(initial.tags ?? [])
  const [likes, setLikes] = useState(num(initial.likes))
  const [comments, setComments] = useState(num(initial.comments))
  const [views, setViews] = useState('')
  const [metricsSource, setMetricsSource] = useState(initial.metricsSource ?? '직접 확인')
  const [take, setTake] = useState(initial.take ?? '')
  const [note, setNote] = useState(initial.note ?? '')
  const [caption, setCaption] = useState(initial.caption ?? '')
  const [err, setErr] = useState('')
  const [dup, setDup] = useState<Reference>()
  const [busy, setBusy] = useState(false)

  const bad = (v: string) => v.trim() !== '' && parseCount(v) === undefined

  async function save() {
    setErr('')
    setDup(undefined)
    if (!account.trim()) return setErr('계정명을 입력해 주세요.')
    if ([likes, comments, views].some(bad)) return setErr('지표는 숫자로 적어 주세요. 예) 1200, 3.4천, 15만')
    setBusy(true)
    try {
      const hasMetric = [likes, comments, views].some((v) => v.trim())
      const r = await createReference({
        url,
        account,
        postType: postType || undefined,
        format: format || undefined,
        tags,
        likes: parseCount(likes),
        comments: parseCount(comments),
        views: parseCount(views),
        metricsAt: hasMetric ? new Date().toISOString() : undefined,
        metricsSource: hasMetric ? metricsSource.trim() : '',
        take: take.trim(),
        note: note.trim(),
        caption: caption.trim(),
        channel,
      })
      onSaved(r)
    } catch (e) {
      if (e instanceof DuplicateRefError) setDup(e.existing)
      else setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ref-form">
      <p className="small">
        링크를 붙여서 <b>레퍼런스</b>로 저장해요. <span className="muted">{REF_PLATFORM_LABEL[platformOf(url)]}</span>
      </p>
      <div className="grid2">
        <Field single label="계정명" value={account} onChange={setAccount} placeholder="@ 없이" />
        <div className="field">
          <label htmlFor="ref-type">게시물 유형</label>
          <select id="ref-type" value={postType} onChange={(e) => setPostType(e.target.value as RefPostType | '')}>
            <option value="">모름</option>
            {REF_POST_TYPES.map((t) => (
              <option key={t} value={t}>
                {REF_POST_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="field">
        <legend>형식</legend>
        <div className="chips">
          {REF_FORMATS.map((f) => (
            <button key={f} type="button" className={`chip ${format === f ? 'on' : ''}`} aria-pressed={format === f} onClick={() => setFormat(format === f ? '' : f)}>
              {REF_FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="field">
        <legend>태그</legend>
        <div className="chips">
          {REF_TAGS.map((t) => {
            const on = tags.includes(t)
            return (
              <button key={t} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}>
                {t}
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="grid3">
        <Field single label="좋아요" value={likes} onChange={setLikes} placeholder="3.4천" />
        <Field single label="댓글" value={comments} onChange={setComments} placeholder="120" />
        <Field single label="조회수" value={views} onChange={setViews} placeholder="15만" />
      </div>
      {[likes, comments, views].some((v) => v.trim()) && (
        <Field single label="지표 출처" value={metricsSource} onChange={setMetricsSource} hint="예: 직접 확인, 추정치" />
      )}
      <Field single label={channel === 'card' ? '내 버전 (한 줄)' : '뚜구리 버전 (한 줄)'} value={take} onChange={(v) => setTake(v.slice(0, 100))} placeholder={channel === 'card' ? '이 주제를 내 카드뉴스로 바꾼 한 줄' : '이 소재를 뚜구리 개그로 바꾼 한 줄'} hint={`${take.length}/100`} />
      <Field label="참고 메모" value={note} onChange={setNote} placeholder="연출, 후킹, 컷 구성에서 참고할 점" />
      <details className="fold-mini">
        <summary>캡션 붙여넣기 (선택)</summary>
        <Field label="원본 캡션" value={caption} onChange={setCaption} />
      </details>
      {err && <p className="flash bad">{err}</p>}
      {dup && (
        <p className="flash bad">
          이미 저장한 레퍼런스예요 (@{dup.account}).{' '}
          <button type="button" className="link-btn" onClick={() => onExisting(dup)}>
            저장한 것 보기
          </button>
        </p>
      )}
      <div className="row-inline">
        <button type="button" className="btn primary" disabled={busy} onClick={save}>
          {busy ? '저장 중…' : '레퍼런스 저장'}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          취소
        </button>
      </div>
      <p className="hint">원본 그림·캡션은 참고용이에요. 콘티 프롬프트에 그대로 넣지 않아요.</p>
    </div>
  )
}

/* ───────── 카드·상세 ───────── */

export function RefCard({ r, onOpen, action, proven }: { r: Reference; onOpen: () => void; action?: React.ReactNode; proven?: boolean }) {
  return (
    <li className="ref-card">
      <button type="button" className="ref-main" onClick={onOpen}>
        <span className="ref-account">@{r.account}</span>
        <span className="ref-take">{refTitle(r)}</span>
        <span className="ep-meta">
          {proven && <span className="tag hot">🔥 검증됨</span>}
          {r.breakdown && <span className="tag good">뜯어봄</span>}
          {!!r.variants?.length && <span className="tag">변주 {r.variants.length}</span>}
          {r.format && <span className="tag">{REF_FORMAT_LABEL[r.format]}</span>}
          {r.postType && <span className="tag">{REF_POST_TYPE_LABEL[r.postType]}</span>}
          {r.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
        </span>
        {(r.likes !== undefined || r.views !== undefined) && (
          <span className="muted small">
            ♥ {fmtCount(r.likes)} · 💬 {fmtCount(r.comments)} · 👁 {fmtCount(r.views)}
          </span>
        )}
      </button>
      {action}
    </li>
  )
}

export function RefDetail({ r, onClose, footer, children }: { r: Reference; onClose: () => void; footer?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Modal title={`@${r.account}`} onClose={onClose} footer={footer}>
      <dl className="kv">
        <dt>원본</dt>
        <dd>
          <a className="link" href={r.url} target="_blank" rel="noreferrer">
            {REF_PLATFORM_LABEL[r.platform]}에서 열기 ↗
          </a>
        </dd>
        {r.format && (
          <>
            <dt>형식</dt>
            <dd>
              {REF_FORMAT_LABEL[r.format]}
              {r.postType && ` · ${REF_POST_TYPE_LABEL[r.postType]}`}
            </dd>
          </>
        )}
        {r.tags.length > 0 && (
          <>
            <dt>태그</dt>
            <dd>{r.tags.map((t) => `#${t}`).join(' ')}</dd>
          </>
        )}
        {(r.likes !== undefined || r.comments !== undefined || r.views !== undefined) && (
          <>
            <dt>지표</dt>
            <dd>
              좋아요 {fmtCount(r.likes)} · 댓글 {fmtCount(r.comments)} · 조회 {fmtCount(r.views)}
              <span className="muted small">
                {' '}
                ({r.metricsAt ? fmtDate(r.metricsAt) : ''}
                {r.metricsSource ? ` · ${r.metricsSource}` : ''})
              </span>
            </dd>
          </>
        )}
        {r.take && (
          <>
            <dt>뚜구리 버전</dt>
            <dd>
              <b>{r.take}</b>
            </dd>
          </>
        )}
        {r.note && (
          <>
            <dt>참고 메모</dt>
            <dd className="pre">{r.note}</dd>
          </>
        )}
        {r.caption && (
          <>
            <dt>캡션</dt>
            <dd className="pre muted small">{r.caption}</dd>
          </>
        )}
        <dt>저장</dt>
        <dd className="muted small">{fmtDate(r.createdAt)}</dd>
      </dl>
      {children}
    </Modal>
  )
}

/* ───────── 검색·필터 ───────── */

export type RefSort = 'recent' | 'likes' | 'views'

export function useRefFilter(refs: Reference[] | null) {
  const [q, setQ] = useState('')
  const [fmt, setFmt] = useState<RefFormat | ''>('')
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState<RefSort>('recent')
  const [onlyProven, setOnlyProven] = useState(false)
  const [rule, setRule] = useState<ProvenRule>(DEFAULT_PROVEN)
  useEffect(() => setRule(loadProvenRule()), [])
  const proven = (r: Reference) => isProven(r, rule)
  const allTags = useMemo(() => [...new Set([...REF_TAGS, ...(refs ?? []).flatMap((r) => r.tags)])], [refs])
  const list = useMemo(() => {
    if (!refs) return []
    const t = q.trim().toLowerCase().replace(/^@/, '')
    const out = refs.filter(
      (r) =>
        (!t || [r.account, r.take, r.note, r.caption].some((x) => x.toLowerCase().includes(t))) &&
        (!fmt || r.format === fmt) &&
        (!tag || r.tags.includes(tag)) &&
        (!onlyProven || isProven(r, rule)),
    )
    if (sort === 'likes') return [...out].sort((a, b) => (b.likes ?? -1) - (a.likes ?? -1))
    if (sort === 'views') return [...out].sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
    return out
  }, [refs, q, fmt, tag, sort, onlyProven, rule])
  const controls = (
    <div className="filters">
      <input type="search" aria-label="레퍼런스 검색" placeholder="계정명·메모 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="형식" value={fmt} onChange={(e) => setFmt(e.target.value as RefFormat | '')}>
        <option value="">모든 형식</option>
        {REF_FORMATS.map((f) => (
          <option key={f} value={f}>
            {REF_FORMAT_LABEL[f]}
          </option>
        ))}
      </select>
      <select aria-label="태그" value={tag} onChange={(e) => setTag(e.target.value)}>
        <option value="">모든 태그</option>
        {allTags.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select aria-label="정렬" value={sort} onChange={(e) => setSort(e.target.value as RefSort)}>
        <option value="recent">최근 저장순</option>
        <option value="likes">좋아요순</option>
        <option value="views">조회수순</option>
      </select>
      <label className="check">
        <input type="checkbox" checked={onlyProven} onChange={(e) => setOnlyProven(e.target.checked)} /> 🔥 검증된 것만
      </label>
      <details className="fold-mini proven-rule">
        <summary>검증 기준: 좋아요 {fmtCount(rule.likes)} · 댓글 {fmtCount(rule.comments)} · 조회 {fmtCount(rule.views)} 중 하나 이상</summary>
        <div className="grid3">
          {(
            [
              ['likes', '좋아요'],
              ['comments', '댓글'],
              ['views', '조회수'],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="field small">
              {l}
              <input
                defaultValue={rule[k] === undefined ? '' : String(rule[k])}
                placeholder="비우면 안 봄"
                onBlur={(e) => {
                  const next = { ...rule, [k]: parseCount(e.target.value) }
                  setRule(next)
                  saveProvenRule(next)
                }}
              />
            </label>
          ))}
        </div>
        <p className="hint">남들이 이미 반응한 게시물부터 따라 해 보는 게 빨라요. 기준은 이 기기에만 저장돼요.</p>
      </details>
    </div>
  )
  const filtering = !!(q || fmt || tag || onlyProven)
  const reset = () => {
    setQ('')
    setFmt('')
    setTag('')
    setOnlyProven(false)
  }
  return { list, controls, filtering, reset, proven }
}
