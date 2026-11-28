/*
 * 컷마다 '카메라(샷)'를 다르게 잡아 강약을 준다.
 *
 * 테스트에서 배운 것: 편 전체 구도 메모와 캐릭터 레퍼런스만 주면 Gemini가 네 컷을
 * 같은 책상·같은 각도·같은 포즈로 그린다. 그래서 컷마다 샷을 정하고,
 * 정하지 않은 컷은 내용과 순서로 추정하되 같은 샷이 연달아 나오지 않게 한다.
 */
import type { Panel, Shot } from './types'

export const SHOTS: Shot[] = ['wide', 'medium', 'closeup', 'detail', 'over']

export const SHOT_LABEL: Record<Shot, string> = {
  wide: '전체 장면',
  medium: '인물 중심',
  closeup: '표정 클로즈업',
  detail: '화면·사물 클로즈업',
  over: '어깨 너머 시점',
}

/** 콘티 화면에 보여줄 한 줄 설명 */
export const SHOT_HINT: Record<Shot, string> = {
  wide: '공간과 상황을 한눈에 — 도입 컷에 좋아요',
  medium: '상반신과 손동작 — 무엇을 하는지 보여줄 때',
  closeup: '얼굴만 크게 — 반응·반전 컷에 좋아요',
  detail: '모니터·물건만 크게 — 화면 속 사건을 보여줄 때',
  over: '주인공 어깨 너머로 보는 시점 — 주인공이 보는 것을 함께 볼 때',
}

/** 이미지 생성 프롬프트에 넣는 카메라 지시 */
export const SHOT_CAMERA: Record<Shot, string> = {
  wide:
    '멀리서 보는 넓은 샷. 인물은 화면 높이의 1/3 정도로 작게 두고, 주변을 넉넉히 비워 거리감과 상황을 보여줘. 사람·사물을 늘어놓지 마.',
  medium:
    '허리 위 상반신 샷. 인물의 손동작과 들고 있는 물건이 잘 보이게, 배경은 일부만. 인물이 화면 높이의 절반 이상.',
  closeup:
    '얼굴 클로즈업. 얼굴과 표정이 화면의 60% 이상을 채우게. 책상·모니터·사무실 배경은 거의 빼고, 단색이나 흐릿한 배경·감정 효과선(땀방울, 집중선, 물음표 등)만. 표정이 이 컷의 전부.',
  detail:
    '사물·화면 클로즈업. 핵심 물건이나 모니터 화면이 화면의 70% 이상을 채우게. 인물은 나오지 않거나 손·어깨 끝만 살짝. 화면 속 내용은 글자 없이 도형·아이콘·커서로만.',
  over:
    '주인공 어깨 너머 시점. 주인공의 뒤통수와 어깨가 앞쪽 한쪽에 크게 걸리고, 주인공이 보고 있는 대상이 화면 중앙에 또렷하게.',
}

const has = (t: string, words: string[]) => words.some((w) => t.includes(w))

/** 장면·핵심 연출에 이런 말이 있으면 화면·물건이 주인공 */
const DETAIL_WORDS = ['화면 속', '화면 전체', '모니터 화면', '화면에', '커서', '아이콘', '알림', '메시지', '테두리', '손에 든', '파우치', '제품', '클로즈업된']
/** 강한 반응 신호 (그냥 '표정'은 거의 모든 컷에 있어서 쓰지 않는다) */
const CLOSE_WORDS = ['얼굴 클로즈업', '얼굴만', '멍', '동공', '식은땀', '머릿속', '하얘', '물음표', '눈 동그랗', '눈이 커', '굳어', '정지된', '울상', '현타']
const WIDE_WORDS = ['사무실 전체', '전경', '넓은', '텅 빈', '혼자 남', '모두 나가', '사람들']

/** 컷 내용으로 어울리는 샷을 짐작한다 (정해 둔 샷이 없을 때만 쓰임) */
export function guessShot(p: Panel, i: number, count: number): Shot {
  const main = [p.scene, p.direction].join(' ')
  const all = [main, p.action, ...(p.cast ?? []).map((c) => c.action)].join(' ')
  if (has(main, DETAIL_WORDS)) return 'detail'
  if (has(main, WIDE_WORDS)) return 'wide'
  if (has(all, CLOSE_WORDS)) return 'closeup'
  if (count === 1) return 'medium'
  if (i === 0) return 'wide'
  if (i === count - 1) return 'closeup'
  return 'medium'
}

/** 같은 샷이 연달아 나오면 다음 후보로 바꾼다 (직접 정한 샷은 그대로) */
const NEXT: Record<Shot, Shot[]> = {
  wide: ['medium', 'over', 'closeup'],
  medium: ['over', 'closeup', 'detail'],
  closeup: ['medium', 'detail', 'wide'],
  detail: ['closeup', 'over', 'medium'],
  over: ['closeup', 'detail', 'medium'],
}

/** 컷 전체의 실제 샷 목록. explicit = 작업자/AI가 정한 샷인지 */
export function shotPlan(panels: Panel[]): { shot: Shot; explicit: boolean }[] {
  const guess = panels.map((p, i) => p.shot ?? guessShot(p, i, panels.length))
  const out: { shot: Shot; explicit: boolean }[] = []
  panels.forEach((p, i) => {
    if (p.shot) return out.push({ shot: p.shot, explicit: true })
    let s = guess[i]
    const prev = out[i - 1]?.shot
    const next = guess[i + 1]
    if (s === prev) s = NEXT[s].find((c) => c !== prev && c !== next) ?? NEXT[s][0]
    out.push({ shot: s, explicit: false })
  })
  return out
}

export function isShot(v: unknown): v is Shot {
  return typeof v === 'string' && (SHOTS as string[]).includes(v)
}
