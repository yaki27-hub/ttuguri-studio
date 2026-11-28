'use client'

import { ART_GUIDE_VERSION, ART_RULES, ART_SECTIONS, ART_STATUS_LABEL, BG_STYLE_LABEL, bgStyleOf, ruleOn } from '@/lib/work/artGuide'
import type { BgStyle } from '@/lib/work/types'
import type { CharacterSettings } from '@/lib/work/types'

/** 설정: 뚜구리툰 그림 설정 — 확정은 항상, 제안은 기본 켜짐, 확인 필요는 켜야 컷 이미지·콘티 프롬프트에 들어간다 */
export default function ArtGuideSettings({ s, edit }: { s: CharacterSettings; edit: (patch: Partial<CharacterSettings>) => void }) {
  const set = (id: string, v: boolean) => edit({ artRules: { ...(s.artRules ?? {}), [id]: v } })
  const on = ART_RULES.filter((r) => ruleOn(r, s)).length

  return (
    <section className="card art-guide" aria-labelledby="art-guide-title">
      <div className="card-head">
        <h2 id="art-guide-title">그림 설정</h2>
        <span className="muted small">
          {ART_GUIDE_VERSION} · {on}/{ART_RULES.length} 적용 중
        </span>
      </div>
      <p className="muted small">
        확정 규칙은 항상, 제안은 기본으로 적용돼요. 확인 필요 항목은 공식 설정이 맞으면 켜 주세요. 켠 규칙 중 그림에 관한 것은 컷 이미지 프롬프트(Gemini·Higgsfield)에, 연출에 관한 것은 콘티 프롬프트에 들어가요. 업로드 전 그림 검수 9항목은 게시 단계에 있어요.
      </p>
      <fieldset className="art-sec art-bg">
        <legend>배경 스타일</legend>
        {(Object.keys(BG_STYLE_LABEL) as BgStyle[]).map((k) => (
          <label key={k} className="check">
            <input type="radio" name="bg-style" checked={bgStyleOf(s) === k} onChange={() => edit({ bgStyle: k })} /> {BG_STYLE_LABEL[k]}
          </label>
        ))}
        <p className="hint">배경 없음: 벽·바닥 없이 흰 바탕에 뚜구리와 장면에 꼭 필요한 물건(예: 에어컨·책상)만 그려요. 컷 이미지·Higgsfield·콘티 프롬프트에 같이 들어가요.</p>
      </fieldset>
      {ART_SECTIONS.map((sec) => (
        <fieldset key={sec} className="art-sec">
          <legend>{sec}</legend>
          <ul>
            {ART_RULES.filter((r) => r.sec === sec).map((r) => {
              const active = ruleOn(r, s)
              const where = [r.prompt && '이미지', r.konti && '콘티'].filter(Boolean).join('·')
              return (
                <li key={r.id} className={active ? '' : 'off'}>
                  <span className={`tag art-${r.status}`}>{ART_STATUS_LABEL[r.status]}</span>
                  {r.status === 'fixed' ? (
                    <span className="art-text">{r.text}</span>
                  ) : (
                    <label className="check art-text">
                      <input type="checkbox" checked={active} onChange={(e) => set(r.id, e.target.checked)} /> {r.text}
                    </label>
                  )}
                  {where ? <span className="muted small"> → {where}</span> : <span className="muted small"> → Figma·운영 참고</span>}
                </li>
              )
            })}
          </ul>
        </fieldset>
      ))}
    </section>
  )
}
