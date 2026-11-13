'use client'

import { FORMAT_LABEL } from '@/lib/work/format'
import { dialogueLines } from '@/lib/work/prompts'
import { AssetImage } from './ui'
import { useWS } from './Workspace'
import InstaPreview from './InstaPreview'
import type { Stage } from '@/lib/work/types'

/** 오른쪽(모바일은 ‘미리보기’ 탭): 슬라이드가 있으면 게시 순서, 없으면 콘티 */
export default function Preview({ stage }: { stage?: Stage }) {
  const { ep, b, story } = useWS()
  if (stage === 'quick') return <InstaPreview />
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
