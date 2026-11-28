'use client'

import { useEffect, useState } from 'react'
import { onBroadcast } from '@/lib/work/db'
import { linkReference, listReferences, refTitle, unlinkReference } from '@/lib/work/refs'
import type { ContentType, Reference } from '@/lib/work/types'
import { Modal } from './ui'
import { RefCard, RefDetail, useRefFilter } from './Refs'
import { useWS } from './Workspace'
import { PATTERNS, ROLE_HINT, ROLE_LABEL, type Role } from '@/lib/work/patterns'

/** 원문 메모 아래: 이 에피소드에 연결한 레퍼런스 */
export default function EpisodeRefs() {
  const ws = useWS()
  const ep = ws.ep
  const [refs, setRefs] = useState<Reference[] | null>(null)
  const [picker, setPicker] = useState(false)
  const [open, setOpen] = useState<Reference>()
  const rf = useRefFilter(refs)

  useEffect(() => {
    const load = () => listReferences().then(setRefs, () => setRefs([]))
    load()
    return onBroadcast((m) => m.kind === 'references' && load())
  }, [])

  const ids = ep.referenceIds ?? []
  const connected = (refs ?? []).filter((r) => ids.includes(r.id))

  return (
    <section className="ep-refs">
      <div className="card-head">
        <h3>연결된 레퍼런스 {connected.length}</h3>
        <button type="button" className="btn small" onClick={() => setPicker(true)}>
          + 추가
        </button>
      </div>
      {connected.length === 0 ? (
        <p className="muted small">콘티와 나란히 볼 레퍼런스를 추가해 보세요.</p>
      ) : (
        <ul className="ep-ref-list">
          {connected.map((r) => (
            <li key={r.id}>
              <button type="button" className="ref-mini" onClick={() => setOpen(r)}>
                <b>@{r.account}</b>
                <span className="clamp">{refTitle(r)}</span>
              </button>
              <button
                type="button"
                className="btn ghost icon"
                aria-label={`@${r.account} 연결 해제`}
                onClick={() => ws.act(() => unlinkReference(ep.id, r.id), '연결을 해제했어요.')}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="field">
        <label htmlFor="ep-ctype">콘텐츠 유형</label>
        <select id="ep-ctype" value={ep.contentType ?? 'instatoon'} onChange={(e) => ws.editEp({ contentType: e.target.value as ContentType })}>
          <option value="instatoon">인스타툰</option>
          <option value="cardnews">카드뉴스</option>
        </select>
      </div>

      {ep.contentType !== 'cardnews' && (
        <>
          <div className="field">
            <label htmlFor="ep-role">목적</label>
            <select id="ep-role" value={ep.role ?? ''} onChange={(e) => ws.editEp({ role: (e.target.value || undefined) as Role | undefined })}>
              <option value="">정하지 않음</option>
              {(['reach', 'convert'] as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            {ep.role && <p className="hint">{ROLE_HINT[ep.role]}</p>}
          </div>
          <fieldset className="field">
            <legend>제목 패턴</legend>
            <div className="chips">
              {PATTERNS.map((p) => {
                const on = (ep.patterns ?? []).includes(p)
                return (
                  <button
                    key={p}
                    type="button"
                    className={`chip ${on ? 'on' : ''}`}
                    aria-pressed={on}
                    onClick={() => ws.editEp({ patterns: on ? (ep.patterns ?? []).filter((x) => x !== p) : [...(ep.patterns ?? []), p] })}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
            <p className="hint">성과 화면의 ‘후킹·패턴별 성과’에 쓰여요.</p>
          </fieldset>
        </>
      )}

      {picker && (
        <Modal title="레퍼런스 추가" onClose={() => setPicker(false)}>
          {refs && refs.length === 0 && <p className="muted small">아직 저장한 레퍼런스가 없어요. 작업 첫 화면 입력칸에 링크를 붙여넣어 저장해 주세요.</p>}
          {refs && refs.length > 0 && rf.controls}
          <ul className="ref-grid one">
            {rf.list.map((r) => {
              const on = ids.includes(r.id)
              return (
                <RefCard
                  key={r.id}
                  r={r}
                  proven={rf.proven(r)}
                  onOpen={() => setOpen(r)}
                  action={
                    <button
                      type="button"
                      className={`btn small ${on ? '' : 'primary'}`}
                      disabled={on}
                      onClick={() => ws.act(() => linkReference(ep.id, r.id), `@${r.account} 레퍼런스를 연결했어요.`)}
                    >
                      {on ? '연결됨' : '연결'}
                    </button>
                  }
                />
              )
            })}
          </ul>
        </Modal>
      )}
      {open && <RefDetail r={open} onClose={() => setOpen(undefined)} />}
    </section>
  )
}
