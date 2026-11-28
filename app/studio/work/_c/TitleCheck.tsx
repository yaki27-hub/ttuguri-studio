'use client'

import { buildSystem, dialogueLines } from '@/lib/work/prompts'
import GenBox from './GenBox'
import { useWS } from './Workspace'

/** 제목·첫 화면 문구 점검 항목 */
const CHECKS = [
  { id: 'stop', label: '처음 보는 사람이 피드를 내리다 멈출까?', hint: '내 상황처럼 느껴지는 말·숫자·질문이 있나요' },
  { id: 'noName', label: '캐릭터 이름 없이도 이해되나?', hint: '‘뚜구리’를 몰라도 무슨 상황인지 알 수 있나요' },
  { id: 'twist', label: '기대가 꺾이는 부분이 있나?', hint: '“~인 줄 알았는데”처럼 예상과 다른 지점' },
] as const
type CheckId = (typeof CHECKS)[number]['id']

type Feedback = { checks: { id: CheckId; ok: boolean; why: string }[]; better: string[] }

function parseFeedback(raw: unknown): Feedback {
  const o = raw as { checks?: unknown; better?: unknown }
  if (!o || typeof o !== 'object' || !Array.isArray(o.checks)) throw new Error('checks 배열이 필요해요.')
  const ids = CHECKS.map((c) => c.id) as string[]
  const checks = o.checks
    .filter((c): c is { id: CheckId; ok: unknown; why: unknown } => !!c && typeof c === 'object' && ids.includes((c as { id: string }).id))
    .map((c) => ({ id: c.id, ok: c.ok === true, why: String(c.why ?? '') }))
  if (!checks.length) throw new Error('checks 안에 stop·noName·twist 항목이 없어요.')
  const better = Array.isArray(o.better) ? o.better.map(String).filter(Boolean).slice(0, 3) : []
  return { checks, better }
}

/** 콘티 단계: 제목·첫 화면 문구 점검 (직접 체크 + AI 피드백) */
export default function TitleCheck() {
  const ws = useWS()
  const ep = ws.ep
  const done = ep.titleChecks ?? []
  const toggle = (id: string) => ws.editEp({ titleChecks: done.includes(id) ? done.filter((x) => x !== id) : [...done, id] })

  const prompt = () => {
    const first = ws.b.panels[0]
    return `${buildSystem(ws.settings)}

[작업: 제목·첫 화면 점검]
인스타 피드에서 처음 보는 사람 입장에서 아래 제목과 첫 화면을 점검해.
제목: ${ep.title}
첫 화면 문구: ${ep.hookText || '(없음)'}
첫 컷: ${first ? [first.scene, ...dialogueLines(first)].join(' / ') : '(없음)'}

항목:
- stop: 피드를 내리다 멈출 만한가 (내 일 같은 상황·숫자·질문·대비가 있나)
- noName: 캐릭터 이름(${ws.settings.characterName})을 몰라도 이해되나
- twist: 기대가 꺾이는 지점이 있나
ok는 엄격하게. why는 한 문장. better에는 원래 내용을 지키면서 더 멈추게 할 제목 후보 3개(각 20자 안팎, 캐릭터 이름 없이).

출력은 아래 형식의 JSON 하나만. 설명 문장, 마크다운 없이.
{"checks":[{"id":"stop","ok":true,"why":""},{"id":"noName","ok":true,"why":""},{"id":"twist","ok":true,"why":""}],"better":["","",""]}`
  }

  return (
    <details className="title-check">
      <summary>
        제목 점검 <span className="muted small">{done.length}/{CHECKS.length}</span>
      </summary>
      <ul className="check-list">
        {CHECKS.map((c) => (
          <li key={c.id}>
            <label className="check">
              <input type="checkbox" checked={done.includes(c.id)} onChange={() => toggle(c.id)} /> {c.label}
            </label>
            <p className="hint">{c.hint}</p>
          </li>
        ))}
      </ul>
      <GenBox<Feedback>
        title="AI에게 점검 받기"
        target="panels"
        targetIds={[ep.id]}
        operation="제목 점검"
        compact
        buildPrompt={prompt}
        parse={parseFeedback}
        getBase={() => ep.revision}
        preview={(f) => (
          <div className="title-fb">
            <ul className="check-list">
              {f.checks.map((c) => (
                <li key={c.id}>
                  {c.ok ? '✅' : '⚠️'} {CHECKS.find((x) => x.id === c.id)?.label}
                  {c.why && <p className="hint">{c.why}</p>}
                </li>
              ))}
            </ul>
            {f.better.length > 0 && (
              <div className="row-inline wraps">
                <span className="small muted">제목 후보</span>
                {f.better.map((t) => (
                  <button key={t} type="button" className="btn small" onClick={() => ws.editEp({ title: t, titleIsAuto: false })}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        applyLabel="통과한 항목 체크하기"
        apply={async (f) => ws.editEp({ titleChecks: f.checks.filter((c) => c.ok).map((c) => c.id) })}
      />
    </details>
  )
}
