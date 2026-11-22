/*
 * 이미지 생성 프롬프트 (Gemini 나노바나나용, 복사해서 다른 곳에 써도 됨)
 *
 * 테스트에서 배운 것: 장 문구를 그대로 넣으면 모델이 그 글자를 그림 안에 써 넣고,
 * 한 장을 두 칸 만화로 나누기도 했다. 그래서
 * - 문구는 "뜻 참고용"으로만 주고, 글자·숫자·말풍선·간판·UI 글씨를 모두 금지한다.
 * - 한 장면, 한 칸, 테두리·칸 나누기 금지를 맨 앞과 맨 뒤에 두 번 적는다.
 */
import { designOf, isDark } from './cardDesign'
import { CARD_ROLE_LABEL, cardRole, cardSettings } from './cards'
import { RATIO_LABEL } from './prompts'
import type { CharacterSettings, ImageMemo, Panel } from './types'

const NO_TEXT =
  '이미지 안에 어떤 글자도 넣지 마: 한글·영어·숫자·말풍선·간판·화면 속 글씨·종이 위 글씨 모두 금지. 종이나 화면이 나오면 선이나 빈칸으로만 표현해.'
const ONE_FRAME = '한 장면을 한 칸에 꽉 채워 그려. 칸 나누기·테두리·여러 컷 배치 금지.'

function refLine(s: CharacterSettings, refCount: number) {
  if (!refCount) return ''
  return `함께 보낸 이미지 ${refCount}장은 주인공 「${s.characterName}」의 캐릭터 레퍼런스야. 얼굴·몸 비율·색·선 굵기를 그대로 따르고, 새로운 디자인으로 바꾸지 마. 단, 레퍼런스 속 배경·소품·구도·포즈는 따라 하지 말고 아래 '그릴 것'의 장면을 새로 그려.`
}

function styleLines(s: CharacterSettings, memo: ImageMemo) {
  return [
    s.styleNotes.trim() && `그림체: ${s.styleNotes.trim().replace(/\n/g, ' ')}`,
    memo.background.trim() && `배경 톤: ${memo.background.trim()}`,
    memo.characterLook.trim() && `${s.characterName} 외형: ${memo.characterLook.trim()}`,
    memo.extras.trim() && `주변 인물: ${memo.extras.trim()}`,
  ].filter(Boolean) as string[]
}

/** 예전 장 구성의 이미지 메모에 남은 캐릭터 이름을 일반 사람으로 바꾼다 */
const noMascot = (t: string, s: CharacterSettings) => (s.characterName ? t.split(s.characterName).join('사람') : t)

/** 카드뉴스 한 장 — 뚜구리 캐릭터·그림체는 쓰지 않고 카드뉴스 설정만 쓴다. refCount = 그림체 참고 이미지 수 */
export function cardGenPrompt(p: Panel, i: number, count: number, s: CharacterSettings, memo: ImageMemo, refCount = 0) {
  const c = cardSettings(s)
  const role = cardRole(i, count)
  const space =
    isDark(c)
      ? '그림의 주제는 위쪽 60% 안에 두고, 아래쪽 40%는 거의 검은 배경으로 자연스럽게 어두워지게 비워 둬(글이 올라가). 위쪽 가장자리도 살짝 어둡게.'
      : role === 'cover'
        ? '위쪽 40%는 제목이 올라갈 빈 여백으로 비워 둬.'
        : '위쪽 1/3은 글이 올라갈 빈 여백으로 비워 둬.'
  return [
    `인스타그램 정보 카드뉴스 ${i + 1}장(${CARD_ROLE_LABEL[role]})의 배경 그림. 비율 ${RATIO_LABEL[memo.ratio] ?? '4:5 세로'}.`,
    ONE_FRAME,
    NO_TEXT,
    space,
    '',
    `그릴 것: ${noMascot(p.productionNotes.trim(), s) || '아래 내용의 핵심을 한눈에 보여주는 장면이나 사물 하나'}`,
    `(뜻 참고용 — 이 문장을 그림에 쓰지 말 것) 이 장의 내용: ${[p.scene, p.narration].filter((x) => x.trim()).join(' / ') || '(미정)'}`,
    c.imageStyle.trim() && `그림체·톤: ${c.imageStyle.trim().replace(/\n/g, ' ')}`,
    c.imageRules.trim() && `지킬 것:\n${c.imageRules.trim().split('\n').map((l) => `- ${l.trim().replace(/^[-•·]\s*/, '')}`).join('\n')}`,
    refCount ? `함께 보낸 이미지 ${refCount}장은 그림체·색감 참고용이야. 색·선·질감만 따르고, 그 안의 내용·인물·글자·구도는 따라 하지 마.` : '',
    '특정 캐릭터나 마스코트를 넣지 마.',
    '',
    `다시 한 번: ${ONE_FRAME} 글자 금지.`,
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 인스타툰 한 컷 (대사는 피그마에서 올리므로 그림에는 넣지 않는다) */
export function cutGenPrompt(p: Panel, i: number, s: CharacterSettings, memo: ImageMemo, refCount = 0) {
  const cast = (p.cast ?? []).map((c) => {
    const pos = { left: '왼쪽', center: '가운데', right: '오른쪽', '': '' }[c.position]
    const act = c.action.split('\n').map((l) => l.trim().replace(/^[-•·]\s*/, '')).filter(Boolean).join(', ')
    return `- ${[pos, c.name || '인물'].filter(Boolean).join(' ')}: ${act || '(행동 미정)'}`
  })
  return [
    `인스타툰 「${s.seriesName}」 컷 ${i + 1}. 비율 ${RATIO_LABEL[memo.ratio] ?? memo.ratio}.`,
    ONE_FRAME,
    NO_TEXT,
    '대사는 나중에 따로 올리니 말풍선 자리만 위쪽에 조금 비워 둬.',
    '',
    `장면: ${p.scene || '(미정)'}`,
    p.action.trim() && `행동·표정: ${p.action.trim()}`,
    cast.length ? `인물:\n${cast.join('\n')}` : '',
    p.direction.trim() && `핵심 연출: ${p.direction.trim()}`,
    memo.composition.trim() && `구도: ${memo.composition.trim()}`,
    memo.placement.trim() && `배치: ${memo.placement.trim()}`,
    memo.direction.trim() && `연출: ${memo.direction.trim()}`,
    refLine(s, refCount),
    ...styleLines(s, memo),
    '',
    `다시 한 번: ${ONE_FRAME} 글자·말풍선 금지.`,
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
