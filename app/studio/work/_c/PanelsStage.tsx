'use client'

import { useState } from 'react'
import {
  addPanel, applyPanelDraft, confirmPanels, imageMemoOf, patchEpisode, patchPanelMeta, removePanel, reorderPanels, savePanel, snapshotOf, newPanel, type PanelDraftItem,
} from '@/lib/work/repo'
import {
  IMAGE_MEMO_FIELDS, PANEL_OP_LABEL, POSITION_LABEL, RATIO_LABEL, cutName, dialogueLines, importKontiPrompt, kontiDocument, panelOpPrompt, panelsPrompt, parsePanels, parsePanelsDoc,
  sceneSheet, screenTextSheet, textLabel,
  type PanelOp, type PanelsDoc,
} from '@/lib/work/prompts'
import { uid } from '@/lib/work/db'
import { FORMATS, FORMAT_LABEL, countRange, fitCount, fmtDateTime, fmtDuration } from '@/lib/work/format'
import type { CastItem, CastPosition, Episode, Format, ImageMemo, Panel, Ratio } from '@/lib/work/types'
import { CopyButton, Field, Notice } from './ui'
import GenBox from './GenBox'
import { useWS } from './Workspace'

export default function PanelsStage() {
  const ws = useWS()
  const { ep, b, story } = ws
  const panels = b.panels
  const target: Format = ep.format
  const range = countRange(target)
  const n = fitCount(target, 0)
  const [dragId, setDragId] = useState<string>()
  const [fmtPreview, setFmtPreview] = useState<Format>()
  const [importText, setImportText] = useState('')
  // 아직 컷도 이야기도 없으면 형식은 AI가 고르게 둔다
  const [autoPick, setAutoPick] = useState(panels.length === 0 && !story)
  const auto = autoPick && panels.length === 0
  const memo = imageMemoOf(ep, ws.settings)
  const storyStale = panels.length > 0 && ep.panelsBaseStoryRevision !== undefined && ep.storyRevision > ep.panelsBaseStoryRevision

  const move = (from: number, to: number) => {
    if (to < 0 || to >= panels.length) return
    const ids = panels.map((p) => p.id)
    const [x] = ids.splice(from, 1)
    ids.splice(to, 0, x)
    ws.act(() => reorderPanels(ep.id, ids))
  }

  /** 콘티 초안 적용: 컷 교체(잠긴 컷 유지) + 제목·이미지 메모. imported면 붙여넣은 콘티를 그대로 따른다. */
  async function applyDoc(doc: PanelsDoc, operation: string, imported: boolean, pickFormat = imported) {
    const r = await ws.act(async () => {
      const res = await applyPanelDraft(ep.id, doc.items, 'replace', operation, ep.storyRevision)
      const cur = res.episode
      const patch: Partial<Episode> = {}
      if (doc.title && (imported || cur.titleIsAuto)) Object.assign(patch, { title: doc.title, titleIsAuto: !imported && cur.titleIsAuto })
      const now = imageMemoOf(cur, ws.settings)
      const next: ImageMemo = { ...now }
      for (const [k, v] of Object.entries(doc.imageMemo) as [keyof ImageMemo, string][]) {
        // AI 초안은 빈 칸만 채우고, 가져온 콘티는 적힌 대로 덮어쓴다
        if (imported || !now[k].trim()) (next as unknown as Record<string, string>)[k] = v
      }
      if (JSON.stringify(next) !== JSON.stringify(now)) patch.imageMemo = next
      if (doc.hook && (imported || doc.hook !== cur.hookText)) patch.hookText = doc.hook
      if (pickFormat) {
        const k = doc.items.length
        const f = doc.format && k >= countRange(doc.format)[0] && k <= countRange(doc.format)[1] ? doc.format : k === 1 ? 'single' : k === 4 ? 'four' : k <= 4 ? 'captions' : undefined
        if (f) patch.format = f
      }
      if (Object.keys(patch).length) await patchEpisode(ep.id, patch)
      return res
    })
    if (r)
      ws.flash(
        `콘티를 적용했어요.${r.skipped.length ? ` 잠긴 컷 ${r.skipped.length}개는 그대로 뒀어요.` : ''}${r.removedPanels.length ? ` 빠진 컷 ${r.removedPanels.length}개의 이미지는 파일로 보관돼요.` : ''}`,
        'ok',
      )
    return r
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>콘티</h2>
          <span className="muted small">
            {panels.length}컷 · 목표 {auto ? '자동 추천' : FORMAT_LABEL[target]}
            {ep.confirmedPanelRevision !== undefined && ` · 확정 r${ep.confirmedPanelRevision}`}
          </span>
        </div>
        <Timing />
        <Field label="상단 제목" single value={ep.title} onChange={(v) => ws.editEp({ title: v, titleIsAuto: false })} />
        <Field
          label="첫 화면 문구"
          single
          value={ep.hookText ?? ''}
          onChange={(v) => ws.editEp({ hookText: v })}
          placeholder={target === 'single' ? '그림 안 자막으로 들어갈 한 줄' : '첫 장에 올릴 짧은 문구'}
          hint={target === 'single' ? '한컷에서는 그림 안 자막으로 써도 돼요.' : undefined}
        />
        <div className="field">
          <label htmlFor="pfmt">형식</label>
          <select
            id="pfmt"
            value={auto ? 'auto' : target}
            onChange={(e) => {
              const v = e.target.value
              if (v === 'auto') return setAutoPick(true)
              setAutoPick(false)
              if (panels.length) setFmtPreview(v as Format)
              else ws.editEp({ format: v as Format })
            }}
          >
            {panels.length === 0 && <option value="auto">자동 추천 (AI가 골라요)</option>}
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
                {f === 'captions' ? ' (2~4장)' : ''}
              </option>
            ))}
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
        {panels.length > 0 && (
          <>
            <div className="row-inline wraps">
              <CopyButton text={() => sceneSheet(ep, panels, ws.settings, memo)} label="장면 설명만 복사" className="small" />
              <CopyButton text={() => screenTextSheet(ep, panels)} label="화면 문구만 복사" className="small" />
              <CopyButton text={() => kontiDocument(ep, panels, ws.settings, memo)} label="콘티 문서 전체" className="small" />
            </div>
            <p className="hint">피그마에는 ‘장면 설명’을 그림 작업 옆에, ‘화면 문구’를 말풍선·자막 레이어에 붙이면 돼요.</p>
          </>
        )}
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

      <section className="card">
          <GenBox<PanelsDoc>
            title={panels.length ? `새 ${FORMAT_LABEL[target]} 콘티 초안 (변경안 비교)` : auto ? '콘티 뽑기 — 형식은 AI가 골라요' : `${FORMAT_LABEL[target]} 콘티 뽑기`}
            target="panels"
            targetIds={panels.map((p) => p.id)}
            operation="콘티 초안"
            compact={panels.length > 0}
            buildPrompt={() =>
              panelsPrompt(
                ep,
                story,
                auto ? 'auto' : target,
                ws.settings,
                panels.filter((p) => p.locked),
                memo,
                panels.flatMap((p, i) => (p.locked ? [] : p.cast.filter((c) => c.fixed && c.dialogue.trim()).map((c) => `${cutName(ep, panels.length, i)} ${c.name || '인물'}: "${c.dialogue}"`))),
              )
            }
            parse={(raw) => parsePanelsDoc(raw, { range: auto ? [1, 4] : range })}
            getBase={() => ep.panelsRevision}
            preview={(doc) => <DocPreview doc={doc} panels={panels} imported={false} />}
            applyLabel={panels.length ? '변경안 적용 (잠긴 컷 유지)' : '콘티에 적용'}
            apply={async (doc) => {
              await applyDoc(doc, '콘티 초안 적용', false, auto)
            }}
          />
        </section>

      <details className="card">
        <summary>
          <b>다른 곳에서 만든 콘티 가져오기</b>
        </summary>
        <p className="muted small">ChatGPT 등과 대화하며 만든 콘티 글을 그대로 붙여넣으면, 내용은 바꾸지 않고 장면·인물별·핵심 연출·이미지 제작 메모 칸으로 나눠 담아요.</p>
        <Field label="콘티 글" value={importText} rows={6} onChange={setImportText} placeholder={'상단 제목\n「사무실 온도차」\n한컷 장면\n…'} />
        <GenBox<PanelsDoc>
          title="앱 형식으로 옮기기"
          target="panels"
          targetIds={panels.map((p) => p.id)}
          operation="콘티 가져오기"
          blocked={importText.trim() ? undefined : '위에 콘티 글을 붙여넣으면 옮길 수 있어요.'}
          buildPrompt={() => importKontiPrompt(importText, ws.settings)}
          parse={(raw) => parsePanelsDoc(raw)}
          getBase={() => ep.panelsRevision}
          preview={(doc) => <DocPreview doc={doc} panels={panels} imported />}
          applyLabel={panels.length ? '이 콘티로 바꾸기 (잠긴 컷 유지)' : '이 콘티로 적용'}
          apply={async (doc) => {
            if (await applyDoc(doc, '콘티 가져오기', true)) setImportText('')
          }}
        />
      </details>

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
          <div className="card-head">
            <h2>이미지 제작 메모</h2>
            <span className="muted small">이번 편만 적용</span>
          </div>
          <div className="memo-grid">
            <div className="field">
              <label htmlFor="ratio">화면 비율</label>
              <select id="ratio" value={memo.ratio} onChange={(e) => ws.editEp({ imageMemo: { ...memo, ratio: e.target.value as Ratio } })}>
                {Object.entries(RATIO_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            {IMAGE_MEMO_FIELDS.map((f) => (
              <Field
                key={f.k}
                label={f.label(ws.settings)}
                single
                value={memo[f.k]}
                placeholder={f.placeholder}
                onChange={(v) => ws.editEp({ imageMemo: { ...memo, [f.k]: v } })}
              />
            ))}
          </div>
          <p className="hint">처음 값은 설정 탭의 ‘이미지 제작 기본값’에서 와요. 여기서 바꾼 내용은 이 편에만 남아요.</p>
        </section>
      )}

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
  const edit = (patch: Partial<Panel>) => !p.locked && ws.editPanel(p.id, patch)

  return (
    <>
      <div className="panel-head">
        <span className="panel-no">{cutName(ep, count, i)}</span>
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
        <Field label={count === 1 ? '한컷 장면' : '장면'} value={p.scene} readOnly={p.locked} rows={1} onChange={(v) => edit({ scene: v })} className="wide" />
        {p.action && <Field label="행동·표정 (컷 전체)" value={p.action} readOnly={p.locked} rows={1} onChange={(v) => edit({ action: v })} className="wide" />}
        <CastEditor p={p} />
        <Field label="핵심 연출" value={p.direction} readOnly={p.locked} rows={1} onChange={(v) => edit({ direction: v })} className="wide" placeholder="예) 두 캐릭터 사이의 거리와 대비를 강조" />
        <Field label={p.cast.length ? '기타 대사·효과음' : '대사'} value={p.dialogue} readOnly={p.locked} rows={1} onChange={(v) => edit({ dialogue: v })} />
        <Field label={textLabel(ep.format)} value={p.narration} readOnly={p.locked} rows={1} onChange={(v) => edit({ narration: v })} className={ep.format === 'captions' ? 'dialogue' : ''} />
        <Field label="제작 메모" value={p.productionNotes} readOnly={p.locked} rows={1} onChange={(v) => edit({ productionNotes: v })} />
        <Field label="각색 표시" value={p.adaptationNotes} readOnly={p.locked} rows={1} onChange={(v) => edit({ adaptationNotes: v })} />
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
                  {v.snapshot.scene} / {dialogueLines(v.snapshot).join(' ') || '(대사 없음)'}
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

const castSummary = (cast: CastItem[] = []) =>
  cast.map((c) => `${[POSITION_LABEL[c.position], c.name || '인물'].filter(Boolean).join(' ')}: ${c.action.split('\n').filter(Boolean).join(' / ')}${c.fixed ? ' (📌 고정 대사)' : ''}`)

/** 검증용: 메모 → 첫 콘티 초안 → 첫 확정까지 걸린 시간 */
function Timing() {
  const { ep, b } = useWS()
  const first = (xs: string[]) => xs.sort()[0]
  const draftAt = first([
    ...b.drafts.filter((d) => d.targetType === 'panels').map((d) => d.createdAt),
    ...b.activities.filter((a) => /^콘티 (초안 적용|가져오기)/.test(a.operation)).map((a) => a.timestamp),
  ])
  const confirmAt = first(b.activities.filter((a) => a.operation.startsWith('콘티 확정')).map((a) => a.timestamp))
  if (!draftAt && !confirmAt) return null
  const span = (from?: string, to?: string) => (from && to && to >= from ? fmtDuration(Date.parse(to) - Date.parse(from)) : '—')
  return (
    <p className="timing small">
      ⏱ 메모 → 첫 초안 <b>{span(ep.createdAt, draftAt)}</b>
      {' · '}첫 초안 → 확정 <b>{confirmAt ? span(draftAt, confirmAt) : '아직'}</b>
      {confirmAt && (
        <>
          {' · '}전체 <b>{span(ep.createdAt, confirmAt)}</b>
        </>
      )}
    </p>
  )
}

/** 컷의 인물(위치·이름·행동·대사)을 편집 */
function CastEditor({ p }: { p: Panel }) {
  const ws = useWS()
  const set = (cast: CastItem[]) => !p.locked && ws.editPanel(p.id, { cast })
  const upd = (id: string, patch: Partial<CastItem>) => set(p.cast.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const add = (name: string) => set([...p.cast, { id: uid(), position: '', name, action: '', dialogue: '' }])
  const hasMain = p.cast.some((c) => c.name === ws.settings.characterName)
  return (
    <fieldset className="cast wide">
      <legend>인물별</legend>
      {p.cast.length === 0 && <p className="muted small">인물을 추가하면 위치·행동·대사를 인물마다 따로 적을 수 있어요.</p>}
      {p.cast.map((c, j) => (
        <div key={c.id} className="cast-item">
          <div className="cast-head">
            <select aria-label={`인물 ${j + 1} 위치`} value={c.position} disabled={p.locked} onChange={(e) => upd(c.id, { position: e.target.value as CastPosition })}>
              <option value="">위치</option>
              <option value="left">왼쪽</option>
              <option value="center">가운데</option>
              <option value="right">오른쪽</option>
            </select>
            <input aria-label={`인물 ${j + 1} 이름`} value={c.name} readOnly={p.locked} placeholder="이름 (예: 동료 직원)" onChange={(e) => upd(c.id, { name: e.target.value })} />
            {!p.locked && (
              <button type="button" className="btn ghost small" aria-label={`인물 ${j + 1} 삭제`} onClick={() => set(p.cast.filter((x) => x.id !== c.id))}>
                ✕
              </button>
            )}
          </div>
          <Field label="차림·행동·표정·소품 (한 줄에 하나)" value={c.action} readOnly={p.locked} rows={2} onChange={(v) => upd(c.id, { action: v })} />
          <div className="field dialogue">
            <label htmlFor={`dlg-${c.id}`}>대사{c.fixed && ' · 📌 고정'}</label>
            <div className="pin-row">
              <input id={`dlg-${c.id}`} value={c.dialogue} readOnly={p.locked || c.fixed} onChange={(e) => upd(c.id, { dialogue: e.target.value })} />
              <button
                type="button"
                className={`btn small ${c.fixed ? 'on' : ''}`}
                aria-pressed={!!c.fixed}
                disabled={p.locked || (!c.fixed && !c.dialogue.trim())}
                title="이 대사 그대로 — 초안을 다시 받아도 바뀌지 않아요"
                onClick={() => upd(c.id, { fixed: !c.fixed })}
              >
                {c.fixed ? '고정 해제' : '📌 고정'}
              </button>
            </div>
          </div>
        </div>
      ))}
      {!p.locked && (
        <div className="row-inline">
          {!hasMain && (
            <button type="button" className="btn small" onClick={() => add(ws.settings.characterName)}>
              + {ws.settings.characterName}
            </button>
          )}
          <button type="button" className="btn small" onClick={() => add('')}>
            + 인물
          </button>
        </div>
      )}
    </fieldset>
  )
}

/** 콘티 전체 초안 미리보기: 제목 + 컷 비교 + 이미지 메모 */
function DocPreview({ doc, panels, imported }: { doc: PanelsDoc; panels: Panel[]; imported: boolean }) {
  const ws = useWS()
  const memoEntries = [
    ...(doc.imageMemo.ratio ? [['화면 비율', RATIO_LABEL[doc.imageMemo.ratio]]] : []),
    ...IMAGE_MEMO_FIELDS.filter((f) => doc.imageMemo[f.k]).map((f) => [f.label(ws.settings), doc.imageMemo[f.k]!]),
  ]
  return (
    <div className="stack">
      {doc.hook && (
        <p className="small">
          <b>첫 화면 문구</b> {doc.hook}
        </p>
      )}
      {doc.format && (
        <p className="small">
          <b>형식</b> {FORMAT_LABEL[doc.format]}
        </p>
      )}
      {doc.title && (
        <p className="small">
          <b>상단 제목</b> 「{doc.title}」
          {!imported && !ws.ep.titleIsAuto && <span className="muted"> — 직접 정한 제목이 있어 바꾸지 않아요</span>}
        </p>
      )}
      <DraftCompare items={doc.items} panels={panels} />
      {memoEntries.length > 0 && (
        <dl className="kv">
          {memoEntries.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {memoEntries.length > 0 && <p className="hint">{imported ? '이미지 제작 메모는 붙여넣은 값으로 바뀌어요.' : '이미지 제작 메모는 비어 있는 칸만 채워요.'}</p>}
    </div>
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
              {old.scene} · {dialogueLines(old).join(' ') || '(대사 없음)'}
            </p>
          )}
          <div className="new small">
            <span className="sr-only">새: </span>
            <p>{it.scene}</p>
            {it.action && <p>{it.action}</p>}
            {castSummary(it.cast).map((line, k) => (
              <p key={k}>· {line}</p>
            ))}
            {it.direction && <p>핵심 연출: {it.direction}</p>}
            {dialogueLines(it).map((d, k) => (
              <p key={k} className="pv-dialogue">
                {d}
              </p>
            ))}
            {it.narration && <p>({it.narration})</p>}
          </div>
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
  const n = fitCount(to, panels.length)
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
