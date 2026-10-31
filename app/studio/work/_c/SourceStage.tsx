'use client'

import { useState } from 'react'
import { uid } from '@/lib/work/db'
import { patchEpisode, putAsset } from '@/lib/work/repo'
import { parseSource, sourcePrompt, type SourceOut } from '@/lib/work/prompts'
import { PURPOSE_LABEL } from '@/lib/work/format'
import type { Fact, FactStatus, Purpose } from '@/lib/work/types'
import { AssetImage, Field, FilePick, Lightbox, ListField } from './ui'
import GenBox from './GenBox'
import { useWS } from './Workspace'

const FACT_LABEL: Record<FactStatus, string> = { confirmed: '확인한 사실', proposed: '추정·제안', unknown: '모름' }

export function hashText(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

export default function SourceStage() {
  const ws = useWS()
  const ep = ws.ep
  const [big, setBig] = useState<string>()
  const setFacts = (facts: Fact[]) => ws.editEp({ facts })

  return (
    <div className="stack">
      <section className="card">
        <h2>소재 정리</h2>
        <p className="muted small">비워 둬도 괜찮아요. 직접 쓰거나 아래 생성 보조를 써서 채우세요.</p>
        <Field label="한 줄 상황" single value={ep.situation} onChange={(v) => ws.editEp({ situation: v })} placeholder="예) 새 프로젝트 첫 주, 주변 자리가 다 비었다" />

        <fieldset className="facts">
          <legend>사실 목록</legend>
          {ep.facts.length === 0 && <p className="muted small">아직 정리된 사실이 없어요.</p>}
          {ep.facts.map((f, i) => (
            <div key={f.id} className={`fact f-${f.status}`}>
              <label className="sr-only" htmlFor={`fact-${f.id}`}>
                사실 {i + 1}
              </label>
              <input id={`fact-${f.id}`} value={f.text} onChange={(e) => setFacts(ep.facts.map((x) => (x.id === f.id ? { ...x, text: e.target.value } : x)))} />
              <select
                aria-label={`사실 ${i + 1} 구분`}
                value={f.status}
                onChange={(e) => setFacts(ep.facts.map((x) => (x.id === f.id ? { ...x, status: e.target.value as FactStatus } : x)))}
              >
                {Object.entries(FACT_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button type="button" className="btn ghost small" aria-label={`사실 ${i + 1} 삭제`} onClick={() => setFacts(ep.facts.filter((x) => x.id !== f.id))}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn small" onClick={() => setFacts([...ep.facts, { id: uid(), text: '', status: 'confirmed' }])}>
            + 사실 추가
          </button>
        </fieldset>

        <ListField label="감정 (제안 — 확인 전)" value={ep.emotions} onChange={(v) => ws.editEp({ emotions: v })} placeholder="당황, 체념" />
        <Field label="웃음 포인트" value={ep.humorPoint} onChange={(v) => ws.editEp({ humorPoint: v })} />
        <Field
          label="미정 항목 (한 줄에 하나)"
          value={ep.unknowns.join('\n')}
          onChange={(v) => ws.editEp({ unknowns: v.split('\n') })}
          onBlur={() => ws.editEp({ unknowns: ep.unknowns.map((s) => s.trim()).filter(Boolean) })}
          hint="결말을 바꾸는 질문만 위쪽에 두세요. 나머지는 미정으로 둬도 돼요."
        />
        <ListField label="태그" value={ep.tags} onChange={(v) => ws.editEp({ tags: v })} placeholder="회사생활, 입사첫주" hint="쉼표로 구분" />
        <div className="field">
          <label htmlFor="purpose">콘텐츠 목적 (제안·편집 가능)</label>
          <select id="purpose" value={ep.purpose ?? ''} onChange={(e) => ws.editEp({ purpose: (e.target.value || undefined) as Purpose | undefined })}>
            <option value="">미정</option>
            {Object.entries(PURPOSE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <p className="hint">성장 효과를 보장하는 값이 아니라, 나중에 반응을 목적별로 비교하기 위한 표시예요.</p>
        </div>

        <fieldset>
          <legend>참고 링크 · 이미지</legend>
          {ep.links.map((l) => (
            <div key={l.id} className="fact">
              <input aria-label="링크 주소" value={l.url} placeholder="https://" onChange={(e) => ws.editEp({ links: ep.links.map((x) => (x.id === l.id ? { ...x, url: e.target.value } : x)) })} />
              <input aria-label="링크 메모" value={l.note} placeholder="메모" onChange={(e) => ws.editEp({ links: ep.links.map((x) => (x.id === l.id ? { ...x, note: e.target.value } : x)) })} />
              <button type="button" className="btn ghost small" aria-label="링크 삭제" onClick={() => ws.editEp({ links: ep.links.filter((x) => x.id !== l.id) })}>
                ✕
              </button>
            </div>
          ))}
          <div className="thumbs">
            {ep.sourceAssetIds.map((a) => (
              <div key={a} className="thumb-item">
                <AssetImage id={a} alt="참고 이미지" className="thumb-img" onClick={() => setBig(a)} />
                <button type="button" className="btn ghost small" onClick={() => ws.editEp({ sourceAssetIds: ep.sourceAssetIds.filter((x) => x !== a) })}>
                  빼기
                </button>
              </div>
            ))}
          </div>
          <div className="row-inline">
            <button type="button" className="btn small" onClick={() => ws.editEp({ links: [...ep.links, { id: uid(), url: '', note: '' }] })}>
              + 링크
            </button>
            <FilePick
              label="+ 이미지"
              className="small"
              onFile={async (f) => {
                try {
                  const a = await putAsset(f, 'source')
                  ws.editEp({ sourceAssetIds: [...ep.sourceAssetIds, a.id] })
                } catch (e) {
                  ws.flash((e as Error).message, 'error')
                }
              }}
            />
          </div>
        </fieldset>
      </section>

      <section className="card">
        <GenBox<SourceOut>
          title="소재 정리 초안"
          target="source"
          targetIds={[ep.id]}
          operation="소재 정리"
          buildPrompt={() => sourcePrompt(ep, ws.settings)}
          parse={parseSource}
          getBase={() => hashText(ep.originalMemo + ep.notes)}
          preview={(s) => (
            <dl className="kv">
              <dt>한 줄 상황</dt>
              <dd>{s.situation}</dd>
              <dt>사실</dt>
              <dd>
                <ul>
                  {s.facts.map((f, i) => (
                    <li key={i}>
                      <span className={`tag f-${f.status}`}>{FACT_LABEL[f.status]}</span> {f.text}
                    </li>
                  ))}
                </ul>
              </dd>
              <dt>감정(제안)</dt>
              <dd>{s.emotions.join(', ') || '—'}</dd>
              <dt>웃음 포인트</dt>
              <dd>{s.humorPoint || '—'}</dd>
              <dt>미정</dt>
              <dd>{s.unknowns.join(' / ') || '—'}</dd>
              <dt>태그</dt>
              <dd>{s.tags.map((t) => `#${t}`).join(' ') || '—'}</dd>
              <dt>목적</dt>
              <dd>{s.purpose ? PURPOSE_LABEL[s.purpose] : '—'}</dd>
            </dl>
          )}
          apply={async (s) => {
            await ws.act(
              () =>
                patchEpisode(ep.id, {
                  situation: s.situation,
                  facts: s.facts.map((f) => ({ id: uid(), ...f })),
                  emotions: s.emotions,
                  humorPoint: s.humorPoint,
                  unknowns: s.unknowns,
                  tags: [...new Set([...ep.tags, ...s.tags])],
                  purpose: s.purpose ?? ep.purpose,
                }),
              '소재 정리 초안을 적용했어요. 원문은 그대로예요.',
            )
          }}
          applyLabel="소재 정리에 적용"
        />
      </section>

      <button type="button" className="btn primary block" onClick={() => ws.goStage('story')}>
        이야기로 정리하기 →
      </button>
      {big && <Lightbox id={big} alt="참고 이미지" onClose={() => setBig(undefined)} />}
    </div>
  )
}
