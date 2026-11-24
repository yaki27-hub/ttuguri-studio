'use client'

import { useState } from 'react'
import { addPanel, applyPanelDraft, confirmPanels, patchEpisode, patchPanelMeta, removePanel, reorderPanels, savePanel, type PanelDraftItem } from '@/lib/work/repo'
import {
  CARD_FIELD_LABEL, CARD_STYLE_LABEL, cardSettings, cardStyleOf, defaultCount, limitsOf, type CardStyle, CARD_MAX, CARD_MIN, CARD_OP_LABEL, cardCountOf, cardDocument, cardName, cardOpPrompt, cardRole, cardTextSheet, cardsPrompt, len, overLimits, parseCards,
  toDraftItem, type CardOp, type CardsDoc,
} from '@/lib/work/cards'
import { fmtDateTime } from '@/lib/work/format'
import { designOf, isDark } from '@/lib/work/cardDesign'
import type { Episode, Panel } from '@/lib/work/types'
import { CopyButton, Field, Notice } from './ui'
import GenBox from './GenBox'
import { useWS } from './Workspace'

/** 카드뉴스 2단계: 장 구성 (인스타툰의 콘티 자리) */
export default function CardStage() {
  const ws = useWS()
  const { ep, b } = ws
  const cards = b.panels
  const target = cardCountOf(ep)
  const [dragId, setDragId] = useState<string>()
  const style = cardStyleOf(ep)
  const over = cards.map((p, i) => overLimits(p, i, cards.length, style)).filter((x) => x.length).length
  const checks = cards.filter((p) => needsCheck(p.adaptationNotes)).length
  const read = ep.facts.some((f) => f.quote)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= cards.length) return
    const ids = cards.map((p) => p.id)
    const [x] = ids.splice(from, 1)
    ids.splice(to, 0, x)
    ws.act(() => reorderPanels(ep.id, ids))
  }

  async function applyDoc(doc: CardsDoc) {
    const r = await ws.act(async () => {
      const res = await applyPanelDraft(ep.id, doc.items, 'replace', '장 구성 초안 적용', ep.storyRevision)
      const patch: Partial<Episode> = {}
      if (doc.title && res.episode.titleIsAuto) patch.title = doc.title
      if (doc.hook && doc.hook !== res.episode.hookText) patch.hookText = doc.hook
      if (Object.keys(patch).length) await patchEpisode(ep.id, patch)
      return res
    })
    if (r) ws.flash(`장 구성을 적용했어요.${r.skipped.length ? ` 잠긴 장 ${r.skipped.length}개는 그대로 뒀어요.` : ''}`, 'ok')
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>장 구성</h2>
          <span className="muted small">
            {cards.length}장 · 목표 {target}장{ep.confirmedPanelRevision !== undefined && ` · 확정 r${ep.confirmedPanelRevision}`}
          </span>
        </div>
        <p className="muted small">표지(후킹) → 본문 → 마무리(저장·팔로우 유도) 순서예요. 장마다 메시지 하나, 3초 안에 읽히는 길이가 목표예요.</p>
        {!read && (
          <Notice kind="warn">
            기사 본문을 아직 안 읽었어요. 이대로 뽑으면 제목만 보고 쓰게 돼요.{' '}
            <button type="button" className="btn small" onClick={() => ws.goStage('source')}>
              ← 메모 단계에서 기사 읽기
            </button>
          </Notice>
        )}
        <Field label="작업 제목" single value={ep.title} onChange={(v) => ws.editEp({ title: v, titleIsAuto: false })} />
        <div className="field">
          <label htmlFor="card-style">글 구성</label>
          <select id="card-style" value={style} onChange={(e) => ws.editEp({ cardStyle: e.target.value as CardStyle })}>
            {(Object.keys(CARD_STYLE_LABEL) as CardStyle[]).map((k) => (
              <option key={k} value={k}>
                {CARD_STYLE_LABEL[k]}
              </option>
            ))}
          </select>
          <p className="hint">{style === 'story' ? '사건의 시작 → 핵심 사실 → 반응·쟁점 → 다른 시각 → 더 큰 질문 → 마무리 질문 순서로, 장마다 섹션 이름과 출처가 붙어요.' : '새 기능·사용법처럼 한 장에 한 가지만 짧게 알려 줄 때 좋아요.'}</p>
        </div>
        <div className="field">
          <label htmlFor="card-count">목표 장 수</label>
          <select id="card-count" value={target} onChange={(e) => ws.editEp({ cardCount: Number(e.target.value) })}>
            {Array.from({ length: CARD_MAX - CARD_MIN + 1 }, (_, k) => CARD_MIN + k).map((n) => (
              <option key={n} value={n}>
                {n}장{n === defaultCount(style) ? ' (추천)' : ''}
              </option>
            ))}
          </select>
          <p className="hint">{style === 'story' ? '이슈형은 7~8장이 알맞아요. 사실이 적으면 AI가 장 수를 줄여요.' : '원본이 10장이어도 5장 안팎으로 줄이면 끝까지 넘겨 보는 비율이 올라가요.'}</p>
        </div>
        {cards.length > 0 && (
          <>
            <div className="row-inline wraps">
              <CopyButton text={() => cardTextSheet(ep, cards)} label="화면 문구만 복사" className="small" />
              <CopyButton text={() => cardDocument(ep, cards)} label="장 구성 전체 복사" className="small" />
            </div>
            <p className="hint">피그마에는 ‘화면 문구’를 텍스트 레이어에 붙이고, 이미지는 다음 단계에서 장마다 프롬프트를 복사해 만들면 돼요.</p>
          </>
        )}
        {cards.length === 0 && (
          <div className="row-inline">
            <button
              type="button"
              className="btn"
              onClick={() => ws.act(() => applyPanelDraft(ep.id, Array.from({ length: target }, () => toDraftItem({})), 'replace', '빈 장 구성 만들기', ep.storyRevision), `빈 ${target}장을 만들었어요.`)}
            >
              빈 {target}장으로 직접 쓰기
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <GenBox<CardsDoc>
          title={cards.length ? `새 ${target}장 구성 초안 (변경안 비교)` : `카드뉴스 ${target}장 뽑기`}
          target="panels"
          targetIds={cards.map((p) => p.id)}
          operation="장 구성 초안"
          compact={cards.length > 0}
          buildPrompt={() => cardsPrompt(ep, ws.settings, target, cards.filter((p) => p.locked), cards)}
          parse={(raw) => parseCards(raw, { range: [CARD_MIN, CARD_MAX] })}
          getBase={() => ep.panelsRevision}
          preview={(doc) => <CardsPreview items={doc.items} style={style} />}
          applyLabel={cards.length ? '변경안 적용 (잠긴 장 유지)' : '장 구성에 적용'}
          apply={applyDoc}
        />
      </section>

      <ol className="panel-list">
        {cards.map((p, i) => (
          <li
            key={p.id}
            className={`panel-card ${p.locked ? 'locked' : ''} ${dragId === p.id ? 'dragging' : ''}`}
            draggable
            onDragStart={() => setDragId(p.id)}
            onDragEnd={() => setDragId(undefined)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const from = cards.findIndex((x) => x.id === dragId)
              if (from >= 0 && from !== i) move(from, i)
              setDragId(undefined)
            }}
          >
            <CardEditor p={p} i={i} count={cards.length} onMove={(d) => move(i, i + d)} />
          </li>
        ))}
      </ol>

      {cards.length > 0 && (
        <section className="card">
          <div className="row-inline">
            <button type="button" className="btn small" disabled={cards.length >= CARD_MAX} onClick={() => ws.act(() => addPanel(ep.id, cards.length + 1))}>
              + 장 추가
            </button>
          </div>
          {cards.length !== target && <p className="hint">지금 {cards.length}장이에요 (목표 {target}장).</p>}
          {over > 0 && <Notice kind="warn">글자 수 한도를 넘은 장이 {over}개 있어요. 장마다 ‘글자 수에 맞게 줄이기’를 쓸 수 있어요.</Notice>}
          {checks > 0 && <Notice kind="warn">‘확인 필요’가 적힌 장이 {checks}개 있어요. 수치·제도는 올리기 전에 꼭 확인해 주세요.</Notice>}
          <button type="button" className="btn primary block" onClick={() => ws.act(() => confirmPanels(ep), '장 구성을 확정했어요. 이후 수정하면 재확인 표시가 붙어요.')}>
            {ep.confirmedPanelRevision !== undefined ? (ep.needsReview ? '확인 완료 · 다시 확정' : '확정됨 · 다시 확정') : '장 구성 확정'}
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

/** 글자 수 표시: 12/20, 넘으면 빨간색 */
/** check 칸 맨 앞 "근거 F1, F3" */
const BASIS = /^\s*근거\s*((?:F\d+[\s,·]*)+)[.\/:·-]?\s*/
const basisOf = (note: string) => note.match(BASIS)?.[0].trim().replace(/[.\/:·-]$/, '').trim() ?? ''
const needsCheck = (note: string) => !!note.replace(BASIS, '').trim()

function Count({ v, max }: { v: string; max: number }) {
  const n = len(v)
  return <span className={n > max ? 'count over' : 'count'}>{n}/{max}</span>
}

function CardEditor({ p, i, count, onMove }: { p: Panel; i: number; count: number; onMove: (d: number) => void }) {
  const ws = useWS()
  const { ep, b } = ws
  const role = cardRole(i, count)
  const style = cardStyleOf(ep)
  const story = style === 'story'
  const L = limitsOf(style)[role]
  const F = CARD_FIELD_LABEL[role]
  const seodang = isDark(cardSettings(ws.settings))
  const eoj = designOf(cardSettings(ws.settings)) === 'eojjeoda'
  const [op, setOp] = useState<CardOp>()
  const [request, setRequest] = useState('')
  const [history, setHistory] = useState(false)
  const versions = b.panelVersions.filter((v) => v.panelId === p.id)
  const over = overLimits(p, i, count, style)
  const edit = (patch: Partial<Panel>) => !p.locked && ws.editPanel(p.id, patch)

  return (
    <>
      <div className="panel-head">
        <span className={`panel-no role-${role}`}>{cardName(i, count)}</span>
        {p.locked && <span className="tag">🔒 잠금</span>}
        {over.length > 0 && <span className="tag bad">글자 수 초과</span>}
        {needsCheck(p.adaptationNotes) && <span className="tag warn">확인 필요</span>}
        {basisOf(p.adaptationNotes) && <span className="tag good">{basisOf(p.adaptationNotes)}</span>}
        <span className="spacer" />
        <button type="button" className="btn ghost small" aria-label={`${i + 1}장 위로`} disabled={i === 0} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button type="button" className="btn ghost small" aria-label={`${i + 1}장 아래로`} disabled={i === count - 1} onClick={() => onMove(1)}>
          ↓
        </button>
        <button
          type="button"
          className="btn small"
          aria-pressed={p.locked}
          onClick={() => ws.act(() => patchPanelMeta(p.id, { locked: !p.locked }), p.locked ? `${i + 1}장 잠금을 풀었어요.` : `${i + 1}장을 잠갔어요. 생성 결과가 반영되지 않아요.`)}
        >
          {p.locked ? '잠금 해제' : '잠금'}
        </button>
      </div>
      <div className="panel-fields card-fields">
        {(eoj ? role !== 'cover' : story || (seodang && role === 'content')) && (
          <Field
            label={eoj ? (role === 'outro' ? '아래 한 줄 (예: 조선 선비와 함께 읽는 AI 뉴스 · 어쩌다 발견)' : '해시태그 (아래 왼쪽 · 예: #이미지2.6 #ChatGPT)') : story ? (role === 'cover' ? '분류 (예: AI ISSUE · MATHEMATICS)' : '섹션 이름 (예: 사건의 시작)') : '태그 (선택 · 예: 11.04 출시)'}
            single
            value={p.dialogue}
            readOnly={p.locked}
            onChange={(v) => edit({ dialogue: v })}
          />
        )}
        <Field label={F.headline} value={p.scene} readOnly={p.locked} rows={1} onChange={(v) => edit({ scene: v })} className="wide dialogue" hint={<Count v={p.scene} max={L.headline} />} />
        <Field label={story && role !== 'cover' ? `${F.body} (문단은 빈 줄로)` : F.body} value={p.narration} readOnly={p.locked} rows={story && role !== 'cover' ? 6 : 2} onChange={(v) => edit({ narration: v })} className="wide" hint={<Count v={p.narration} max={L.body} />} />
        <Field
          label={seodang ? '제목 강조 단어 (청록색으로 칠할 부분)' : '강조 한 줄 (선택)'}
          value={p.direction}
          readOnly={p.locked}
          rows={1}
          onChange={(v) => edit({ direction: v })}
          hint={seodang && p.direction.trim() && !p.scene.includes(p.direction.trim()) ? '제목에 똑같이 들어 있어야 칠해져요.' : <Count v={p.direction} max={L.highlight} />}
        />
        {story && <Field label="출처 (예: Quanta Magazine)" single value={p.action} readOnly={p.locked} onChange={(v) => edit({ action: v })} />}
        <Field label="이미지 메모" value={p.productionNotes} readOnly={p.locked} rows={1} onChange={(v) => edit({ productionNotes: v })} placeholder="이 장 문구에 맞는 그림 한 줄" />
        <Field label="확인 필요 (수치·제도·출처)" value={p.adaptationNotes} readOnly={p.locked} rows={1} onChange={(v) => edit({ adaptationNotes: v })} className="wide" placeholder="확인이 끝나면 비워 두세요" />
      </div>
      {p.locked ? (
        <p className="hint">잠긴 장은 직접 편집과 생성 반영이 막혀요. 순서 변경은 가능해요.</p>
      ) : (
        <div className="row-inline wraps">
          {(['shorten', 'rewrite'] as CardOp[]).map((o) => (
            <button key={o} type="button" className={`btn small ${op === o ? 'on' : ''} ${o === 'shorten' && over.length ? 'primary' : ''}`} onClick={() => setOp(op === o ? undefined : o)}>
              {CARD_OP_LABEL[o]}
            </button>
          ))}
          <button type="button" className="btn small" disabled={!versions.length} onClick={() => setHistory((h) => !h)}>
            이전 버전 {versions.length ? `(${versions.length})` : ''}
          </button>
          <button
            type="button"
            className="btn ghost small danger-text"
            onClick={() => {
              if (confirm(`${i + 1}장을 삭제할까요? 연결된 이미지는 파일로 보관돼요.`)) ws.act(() => removePanel(p), '장을 삭제했어요.')
            }}
          >
            삭제
          </button>
        </div>
      )}
      {op && !p.locked && (
        <div className="op-box">
          {op === 'rewrite' && <Field label="요청 (선택)" single value={request} onChange={setRequest} placeholder="예) 숫자로 시작하게" />}
          <GenBox<PanelDraftItem[]>
            key={op}
            title={`${CARD_OP_LABEL[op]} — ${i + 1}장만`}
            target="panels"
            targetIds={[p.id]}
            operation={CARD_OP_LABEL[op]}
            buildPrompt={() => cardOpPrompt(op, p, b.panels, ep, ws.settings, request)}
            parse={(raw) => parseCards(raw, { ids: [p.id] }).items}
            getBase={() => b.panels.find((x) => x.id === p.id)?.revision ?? -1}
            preview={(items) => <CardsPreview items={items} offset={i} count={count} style={style} />}
            applyLabel={`${i + 1}장에만 적용`}
            apply={async (items) => {
              const r = await ws.act(() => applyPanelDraft(ep.id, items, 'patch', `${CARD_OP_LABEL[op]} (${i + 1}장)`, ep.storyRevision))
              if (r?.skipped.length) ws.flash('요청 중에 잠긴 장이라 반영하지 않았어요.', 'warn')
              else if (r) {
                ws.flash(`${i + 1}장만 고쳤어요.`, 'ok')
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
                  {v.snapshot.scene} / {v.snapshot.narration}
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
                  }, `${i + 1}장을 이전 버전으로 되돌렸어요.`)
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

/** 초안 미리보기: 장마다 역할·제목·본문·글자 수 */
function CardsPreview({ items, offset = 0, count, style = 'story' }: { items: PanelDraftItem[]; offset?: number; count?: number; style?: CardStyle }) {
  const n = count ?? items.length
  return (
    <ol className="cards-preview">
      {items.map((it, k) => {
        const i = offset + k
        const over = overLimits(it, i, n, style)
        return (
          <li key={k}>
            <p className="small">
              <b>{cardName(i, n)}</b>{it.dialogue && ` · ${it.dialogue}`} {over.length > 0 && <span className="tag bad">{over.join(' · ')}</span>}
            </p>
            <p className="cp-head">{it.scene}</p>
            {it.narration && <p className="small pre-line">{it.narration}</p>}
            {it.action && <p className="small muted">출처 · {it.action}</p>}
            {it.direction && <p className="small"><b>강조</b> {it.direction}</p>}
            {it.productionNotes && <p className="small muted">🖼 {it.productionNotes}</p>}
            {it.adaptationNotes && <p className="small warn-text">⚠ {it.adaptationNotes}</p>}
          </li>
        )
      })}
    </ol>
  )
}
