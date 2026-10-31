'use client'

import { useState } from 'react'
import {
  addPanel, applyPanelDraft, confirmPanels, patchPanelMeta, removePanel, reorderPanels, savePanel, snapshotOf, newPanel, type PanelDraftItem,
} from '@/lib/work/repo'
import { PANEL_OP_LABEL, panelOpPrompt, panelsPrompt, parsePanels, type PanelOp } from '@/lib/work/prompts'
import { fmtDateTime, FORMAT_LABEL } from '@/lib/work/format'
import type { Format, Panel, PanelSnapshot } from '@/lib/work/types'
import { Field, Notice } from './ui'
import GenBox from './GenBox'
import { useWS } from './Workspace'

const FIELDS: { k: keyof PanelSnapshot; label: string }[] = [
  { k: 'scene', label: '화면' },
  { k: 'action', label: '행동·표정' },
  { k: 'dialogue', label: '대사' },
  { k: 'narration', label: '속마음·내레이션' },
  { k: 'productionNotes', label: '제작 메모' },
  { k: 'adaptationNotes', label: '각색 표시' },
]

export default function PanelsStage() {
  const ws = useWS()
  const { ep, b, story } = ws
  const panels = b.panels
  const target: Format = ep.format
  const n = target === 'single' ? 1 : 4
  const [dragId, setDragId] = useState<string>()
  const [fmtPreview, setFmtPreview] = useState<Format>()
  const storyStale = panels.length > 0 && ep.panelsBaseStoryRevision !== undefined && ep.storyRevision > ep.panelsBaseStoryRevision

  const move = (from: number, to: number) => {
    if (to < 0 || to >= panels.length) return
    const ids = panels.map((p) => p.id)
    const [x] = ids.splice(from, 1)
    ids.splice(to, 0, x)
    ws.act(() => reorderPanels(ep.id, ids))
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>콘티</h2>
          <span className="muted small">
            {panels.length}컷 · 목표 {FORMAT_LABEL[target]}
            {ep.confirmedPanelRevision !== undefined && ` · 확정 r${ep.confirmedPanelRevision}`}
          </span>
        </div>
        <div className="field">
          <label htmlFor="pfmt">형식</label>
          <select id="pfmt" value={target} onChange={(e) => (panels.length ? setFmtPreview(e.target.value as Format) : ws.editEp({ format: e.target.value as Format }))}>
            <option value="four">4컷</option>
            <option value="single">한컷</option>
          </select>
        </div>
        {fmtPreview && fmtPreview !== target && (
          <FormatChange
            to={fmtPreview}
            onCancel={() => setFmtPreview(undefined)}
            onDone={() => setFmtPreview(undefined)}
          />
        )}
        {storyStale && <Notice kind="warn">이 콘티를 만든 뒤 이야기가 수정됐어요. 자동으로 다시 만들지 않으니 내용을 확인해 주세요.</Notice>}
        {panels.length === 0 && (
          <div className="row-inline">
            <button
              type="button"
              className="btn"
              onClick={() =>
                ws.act(() => applyPanelDraft(ep.id, Array.from({ length: n }, () => snapshotOf(newPanel(ep.id, 0))), 'replace', '빈 콘티 만들기', ep.storyRevision), '빈 컷을 만들었어요.')
              }
            >
              빈 {FORMAT_LABEL[target]} 콘티로 직접 쓰기
            </button>
          </div>
        )}
      </section>

      {panels.length > 0 || story ? (
        <section className="card">
          <GenBox<PanelDraftItem[]>
            title={panels.length ? `새 ${FORMAT_LABEL[target]} 콘티 초안 (변경안 비교)` : `${FORMAT_LABEL[target]} 콘티 초안 받기`}
            target="panels"
            targetIds={panels.map((p) => p.id)}
            operation="콘티 초안"
            compact={panels.length > 0}
            buildPrompt={() => panelsPrompt(ep, story, target, ws.settings, panels.filter((p) => p.locked))}
            parse={(raw) => parsePanels(raw, { count: n })}
            getBase={() => ep.panelsRevision}
            preview={(items) => <DraftCompare items={items} panels={panels} />}
            applyLabel={panels.length ? '변경안 적용 (잠긴 컷 유지)' : '콘티에 적용'}
            apply={async (items) => {
              const r = await ws.act(() => applyPanelDraft(ep.id, items, 'replace', '콘티 초안 적용', ep.storyRevision))
              if (r) ws.flash(`콘티를 적용했어요.${r.skipped.length ? ` 잠긴 컷 ${r.skipped.length}개는 그대로 뒀어요.` : ''}${r.removedPanels.length ? ` 빠진 컷 ${r.removedPanels.length}개의 이미지는 파일로 보관돼요.` : ''}`, 'ok')
            }}
          />
        </section>
      ) : (
        <p className="muted small">이야기를 먼저 정리하거나 빈 콘티로 바로 시작하세요.</p>
      )}

      <ol className="panel-list">
        {panels.map((p, i) => (
          <li
            key={p.id}
            className={`panel-card ${p.locked ? 'locked' : ''} ${dragId === p.id ? 'dragging' : ''}`}
            draggable
            onDragStart={() => setDragId(p.id)}
            onDragEnd={() => setDragId(undefined)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const from = panels.findIndex((x) => x.id === dragId)
              if (from >= 0 && from !== i) move(from, i)
              setDragId(undefined)
            }}
          >
            <PanelCard p={p} i={i} last={i === panels.length - 1} onMove={(d) => move(i, i + d)} count={panels.length} />
          </li>
        ))}
      </ol>

      {panels.length > 0 && (
        <section className="card">
          <div className="row-inline">
            <button type="button" className="btn small" onClick={() => ws.act(() => addPanel(ep.id, panels.length + 1))}>
              + 컷 추가
            </button>
          </div>
          <p className="hint">컷 {panels.length}개 · 게시 이미지 장수는 게시 단계에서 따로 정해요 (기본 컷 1개 = 1장).</p>
          <button
            type="button"
            className="btn primary block"
            onClick={() => ws.act(() => confirmPanels(ep), '콘티를 확정했어요. 이후 수정하면 재확인 표시가 붙어요.')}
          >
            {ep.confirmedPanelRevision !== undefined ? (ep.needsReview ? '확인 완료 · 다시 확정' : '확정됨 · 다시 확정') : '콘티 확정'}
          </button>
          {ep.confirmedPanelRevision !== undefined && (
            <button type="button" className="btn block" onClick={() => ws.goStage('images')}>
              이미지 단계로 →
            </button>
          )}
        </section>
      )}
    </div>
  )
}

function PanelCard({ p, i, last, onMove, count }: { p: Panel; i: number; last: boolean; onMove: (d: number) => void; count: number }) {
  const ws = useWS()
  const { ep, b, story } = ws
  const [op, setOp] = useState<PanelOp>()
  const [request, setRequest] = useState('')
  const [history, setHistory] = useState(false)
  const versions = b.panelVersions.filter((v) => v.panelId === p.id)

  return (
    <>
      <div className="panel-head">
        <span className="panel-no">컷 {i + 1}</span>
        {p.locked && <span className="tag">🔒 잠금</span>}
        {p.adaptationNotes && <span className="tag warn">각색 있음</span>}
        <span className="spacer" />
        <button type="button" className="btn ghost small" aria-label={`컷 ${i + 1} 위로`} disabled={i === 0} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button type="button" className="btn ghost small" aria-label={`컷 ${i + 1} 아래로`} disabled={i === count - 1} onClick={() => onMove(1)}>
          ↓
        </button>
        <button
          type="button"
          className="btn small"
          aria-pressed={p.locked}
          onClick={() => ws.act(() => patchPanelMeta(p.id, { locked: !p.locked }), p.locked ? `컷 ${i + 1} 잠금을 풀었어요.` : `컷 ${i + 1}을 잠갔어요. 생성 결과가 반영되지 않아요.`)}
        >
          {p.locked ? '잠금 해제' : '잠금'}
        </button>
      </div>
      <div className="panel-fields">
        {FIELDS.map((f) => (
          <Field
            key={f.k}
            label={f.label}
            value={p[f.k]}
            readOnly={p.locked}
            rows={1}
            onChange={(v) => !p.locked && ws.editPanel(p.id, { [f.k]: v })}
            className={f.k === 'dialogue' ? 'dialogue' : ''}
          />
        ))}
      </div>
      {p.locked ? (
        <p className="hint">잠긴 컷은 직접 편집과 생성 반영이 막혀요. 순서 변경은 가능해요.</p>
      ) : (
        <div className="row-inline wraps">
          {(['rewrite', 'shorten', 'expression'] as PanelOp[]).map((o) => (
            <button key={o} type="button" className={`btn small ${op === o ? 'on' : ''}`} onClick={() => setOp(op === o ? undefined : o)}>
              {PANEL_OP_LABEL[o]}
            </button>
          ))}
          {last && (
            <button type="button" className={`btn small ${op === 'ending' ? 'on' : ''}`} onClick={() => setOp(op === 'ending' ? undefined : 'ending')}>
              {PANEL_OP_LABEL.ending}
            </button>
          )}
          <button type="button" className="btn small" disabled={!versions.length} onClick={() => setHistory((h) => !h)}>
            이전 버전 {versions.length ? `(${versions.length})` : ''}
          </button>
          <button
            type="button"
            className="btn ghost small danger-text"
            onClick={() => {
              if (confirm(`컷 ${i + 1}을 삭제할까요? 연결된 이미지는 파일로 보관돼요.`)) ws.act(() => removePanel(p), '컷을 삭제했어요.')
            }}
          >
            삭제
          </button>
        </div>
      )}
      {op && !p.locked && (
        <div className="op-box">
          {(op === 'rewrite' || op === 'ending') && <Field label="요청 (선택)" single value={request} onChange={setRequest} placeholder="예) 대사 없이 표정만" />}
          <GenBox<PanelDraftItem[]>
            key={op}
            title={`${PANEL_OP_LABEL[op]} — 컷 ${i + 1}만`}
            target="panels"
            targetIds={[p.id]}
            operation={PANEL_OP_LABEL[op]}
            buildPrompt={() => panelOpPrompt(op, p, b.panels, ep, story, ws.settings, request)}
            parse={(raw) => parsePanels(raw, { ids: [p.id] })}
            getBase={() => b.panels.find((x) => x.id === p.id)?.revision ?? -1}
            preview={(items) => <DraftCompare items={items} panels={[p]} />}
            applyLabel={`컷 ${i + 1}에만 적용`}
            apply={async (items) => {
              const r = await ws.act(() => applyPanelDraft(ep.id, items, 'patch', `${PANEL_OP_LABEL[op]} (컷 ${i + 1})`, ep.storyRevision))
              if (r?.skipped.length) ws.flash('요청 중에 잠긴 컷이라 반영하지 않았어요.', 'warn')
              else if (r) {
                ws.flash(`컷 ${i + 1}만 고쳤어요. 다른 컷과 이미지 연결은 그대로예요.`, 'ok')
                setOp(undefined)
              }
            }}
          />
        </div>
      )}
      {history && (
        <ul className="versions">
          {versions.map((v) => (
            <li key={v.id}>
              <div>
                <p className="small">
                  <b>{v.operation}</b> 전 · {fmtDateTime(v.createdAt)}
                </p>
                <p className="muted small clamp">
                  {v.snapshot.scene} / {v.snapshot.dialogue || '(대사 없음)'}
                </p>
              </div>
              <button
                type="button"
                className="btn small"
                disabled={p.locked}
                onClick={() =>
                  ws.act(async () => {
                    const cur = ws.b.panels.find((x) => x.id === p.id)!
                    await savePanel({ ...cur, ...v.snapshot }, '이전 버전 복원')
                  }, `컷 ${i + 1}을 이전 버전으로 되돌렸어요. (되돌리기 전 내용도 이력에 남아요)`)
                }
              >
                되돌리기
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function DraftCompare({ items, panels }: { items: PanelDraftItem[]; panels: Panel[] }) {
  const byId = new Map(panels.map((p) => [p.id, p]))
  const rows = items.map((it, i) => ({ it, old: it.id ? byId.get(it.id) : panels[i] }))
  return (
    <div className="compare">
      {rows.map(({ it, old }, i) => (
        <div key={i} className="compare-row">
          <p className="small">
            <b>컷 {i + 1}</b> {old?.locked && <span className="tag">🔒 잠금 — 반영 안 됨</span>}
          </p>
          {old && (
            <p className="old small">
              <span className="sr-only">기존: </span>
              {old.scene} · “{old.dialogue}”
            </p>
          )}
          <p className="new small">
            <span className="sr-only">새: </span>
            {it.scene} · {it.action} · “{it.dialogue}” {it.narration && `(${it.narration})`}
          </p>
          {it.adaptationNotes && <p className="small warn-text">각색: {it.adaptationNotes}</p>}
        </div>
      ))}
      {!items[0]?.id && panels.length > items.length && (
        <Notice kind="warn">
          기존 {panels.length}컷 중 {panels.length - items.length}컷이 콘티에서 빠져요. 그 컷의 이미지는 지우지 않고 ‘연결 안 된 이미지’로 보관돼요.
        </Notice>
      )}
    </div>
  )
}

/** 한컷↔4컷 변경 미리보기: 기존 작업을 지우지 않고 어떤 컷이 남는지 보여준다 */
function FormatChange({ to, onCancel, onDone }: { to: Format; onCancel: () => void; onDone: () => void }) {
  const ws = useWS()
  const { ep, b } = ws
  const panels = b.panels
  const n = to === 'single' ? 1 : 4
  const keep = panels.slice(0, n)
  const out = panels.slice(n)
  const add = Math.max(0, n - panels.length)
  return (
    <div className="draft-box">
      <p className="draft-label">
        <span className="tag warn">미리보기</span> {FORMAT_LABEL[ep.format]} → {FORMAT_LABEL[to]}
      </p>
      <ul className="small">
        <li>유지: 컷 {keep.map((_, i) => i + 1).join(', ') || '없음'}</li>
        {out.length > 0 && (
          <li>
            콘티에서 제외: 컷 {out.map((_, i) => n + i + 1).join(', ')}
            {out.some((p) => p.assetId) && ' — 연결된 이미지는 삭제하지 않고 ‘연결 안 된 이미지’로 보관'}
            {out.some((p) => p.locked) && ' (잠긴 컷 포함 — 적용하면 잠금과 관계없이 제외됨)'}
          </li>
        )}
        {add > 0 && <li>빈 컷 {add}개 추가</li>}
        <li>새 콘티 초안이 필요하면 적용 뒤 초안 받기를 쓰세요.</li>
      </ul>
      <div className="row-inline">
        <button type="button" className="btn small" onClick={() => (ws.editEp({ format: to }), onDone())}>
          형식만 바꾸고 컷은 그대로
        </button>
        <button
          type="button"
          className="btn primary small"
          onClick={async () => {
            await ws.act(async () => {
              for (const p of out) await removePanel(p)
              for (let k = 0; k < add; k++) await addPanel(ep.id, panels.length + k + 1)
            })
            ws.editEp({ format: to })
            onDone()
          }}
        >
          적용
        </button>
        <button type="button" className="btn small" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  )
}
