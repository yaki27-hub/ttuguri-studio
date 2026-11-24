'use client'

import { FORMAT_LABEL } from '@/lib/work/format'
import { dialogueLines } from '@/lib/work/prompts'
import { cardName, cardSettings, cardStyleOf, overLimits } from '@/lib/work/cards'
import { brandOf, designOf } from '@/lib/work/cardDesign'
import type { Panel } from '@/lib/work/types'
import { AssetImage } from './ui'
import { useWS } from './Workspace'

/** 오른쪽(모바일은 ‘미리보기’ 탭): 슬라이드가 있으면 게시 순서, 없으면 콘티 */
export default function Preview() {
  const { ep, b, story, settings } = useWS()
  const cn = cardSettings(settings)
  const eoj = designOf(cn) === 'eojjeoda'
  if (b.slides.length)
    return (
      <div className="preview">
        <h2 className="small muted">게시 미리보기 · {b.slides.length}장</h2>
        <ol className="pv-slides">
          {b.slides.map((s, i) => (
            <li key={s.id}>
              <div className="pv-frame">
                {s.assetId ? <AssetImage id={s.assetId} alt={s.altText || `슬라이드 ${i + 1}`} className="slot-img" /> : <div className="slot-empty">이미지 없음</div>}
                <span className="pv-no">
                  {i + 1}/{b.slides.length}
                </span>
              </div>
              <p className="small muted">{s.altText || '대체텍스트 없음'}</p>
            </li>
          ))}
        </ol>
      </div>
    )
  if (ep.contentType === 'cardnews')
    return (
      <div className="preview">
        <h2 className="small muted">카드뉴스 미리보기 · {b.panels.length}장</h2>
        {b.panels.length === 0 ? (
          <p className="muted small">아직 장이 없어요.</p>
        ) : (
          <ol className="pv-cards">
            {b.panels.map((p, i) => (
              <li key={p.id} className={i === 0 ? 'cover' : ''}>
                {/* 글자 포함 최종 이미지(피그마 완성본)는 그대로 보여 주고, 앱 글자를 겹쳐 그리지 않는다 */}
                {eoj && !(p.assetId && p.assetIsFinal) ? (
                  <EojCard p={p} i={i} n={b.panels.length} series={brandOf(cn).series} />
                ) : (
                  <div className={`pv-card ${p.assetId && p.assetIsFinal ? 'final' : ''}`}>
                    {p.assetId && <AssetImage id={p.assetId} alt={`${i + 1}장`} className="pv-card-bg" />}
                    <span className="pv-no">
                      {i + 1}/{b.panels.length}
                    </span>
                    {!(p.assetId && p.assetIsFinal) && (
                      <>
                        <b className="pv-card-head">{p.scene || '제목 미정'}</b>
                        {p.narration && <span className="pv-card-body">{p.narration}</span>}
                        {p.direction && <span className="pv-card-hl">{p.direction}</span>}
                      </>
                    )}
                  </div>
                )}
                {overLimits(p, i, b.panels.length, cardStyleOf(ep)).length > 0 && <p className="small warn-text">{cardName(i, b.panels.length)}: 글자 수 초과</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    )
  return (
    <div className="preview">
      <h2 className="small muted">콘티 미리보기 · {FORMAT_LABEL[ep.format]}</h2>
      <p className="pv-summary">「{ep.title}」</p>
      {story?.summary && <p className="small muted">{story.summary}</p>}
      {b.panels.length === 0 ? (
        <p className="muted small">아직 컷이 없어요.</p>
      ) : (
        <ol className="pv-panels">
          {b.panels.map((p, i) => (
            <li key={p.id}>
              <div className="pv-frame small-frame">
                {p.assetId ? <AssetImage id={p.assetId} alt={`컷 ${i + 1}`} className="slot-img" /> : <span className="pv-scene">{p.scene || '화면 미정'}</span>}
                <span className="pv-no">{i + 1}</span>
              </div>
              {dialogueLines(p).map((d, k) => (
                <p key={k} className="pv-dialogue">
                  {d}
                </p>
              ))}
              {p.narration && <p className="small muted">{p.narration}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** 제목에서 강조색으로 칠할 범위: 강조 단어가 있으면 그 부분, 없고 두 줄이면 둘째 줄 (피그마 paintAccent 와 같은 규칙) */
function accentParts(t: string, hl: string, lineFallback = true): [string, string, string] {
  const k = hl.trim() ? t.indexOf(hl.trim()) : -1
  if (k >= 0) return [t.slice(0, k), hl.trim(), t.slice(k + hl.trim().length)]
  const nl = t.indexOf('\n')
  if (lineFallback && nl > 0) return [t.slice(0, nl + 1), t.slice(nl + 1), '']
  return [t, '', '']
}

/** '어쩌다 발견' 템플릿 미리보기 (864×1080 원본 좌표를 카드 폭에 맞춰 줄인다) */
function EojCard({ p, i, n, series }: { p: Panel; i: number; n: number; series: string }) {
  // 표지 제목은 강조 단어가 있을 때만 칠한다 (원본 템플릿은 흰 글씨)
  const [a, hl, z] = accentParts(p.scene || '제목 미정', p.direction, i > 0)
  const title = (
    <b className="eoj-title">
      {a}
      {hl && <span className="eoj-hl">{hl}</span>}
      {z}
    </b>
  )
  if (i === 0)
    return (
      <div className="eoj cover">
        {p.assetId ? <AssetImage id={p.assetId} alt="1장 그림" className="eoj-hero" /> : <div className="eoj-hero eoj-noimg">표지 그림</div>}
        <div className="eoj-fade" />
        <div className="eoj-cstack">
          <span className="eoj-pill">{series || '어쩌다 발견'}</span>
          {title}
          {p.narration && <span className="eoj-lead">{p.narration}</span>}
        </div>
      </div>
    )
  const foot = p.dialogue.trim() || (p.action.trim() ? `출처 · ${p.action.trim()}` : '')
  return (
    <div className="eoj">
      <i className="eoj-rule top" />
      <span className="eoj-pill center">{series || '어쩌다 발견'}</span>
      <div className="eoj-main">
        {title}
        <div className="eoj-body">
          {p.narration
            .split(/\n\s*\n/)
            .filter((x) => x.trim())
            .map((x, k) => (
              <span key={k}>{x.trim()}</span>
            ))}
        </div>
      </div>
      <div className="eoj-foot">
        <span>{foot}</span>
        <span className="eoj-page">
          {i + 1}/{n}
        </span>
      </div>
      <i className="eoj-rule bottom" />
    </div>
  )
}
