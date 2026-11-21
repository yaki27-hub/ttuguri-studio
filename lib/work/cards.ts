/*
 * 카드뉴스 장 구성
 *
 * 저장 구조는 인스타툰 컷(Panel)을 그대로 쓴다. 잠금·버전·이미지 연결이 같이 동작하게 하려고
 * 칸 이름만 이렇게 바꿔 읽는다.
 *   scene           → 제목 (표지는 후킹 제목)
 *   narration       → 본문 (표지는 부제)
 *   direction       → 강조 한 줄
 *   productionNotes → 이미지 메모 (그 장 문구에 맞는 그림)
 *   adaptationNotes → 확인 필요 (수치·제도·출처)
 * 장의 역할은 순서로 정한다: 첫 장 = 표지, 마지막 장 = 마무리, 나머지 = 본문.
 */
import { ParseError } from './prompts'
import { defaultCardNews } from './repo'
import type { PanelDraftItem } from './repo'
import type { CharacterSettings, Episode, ImageMemo, Panel, Slide } from './types'

export const CARD_MIN = 3
export const CARD_MAX = 10
export const CARD_DEFAULT = 5

export type CardRole = 'cover' | 'content' | 'outro'
export const CARD_ROLE_LABEL: Record<CardRole, string> = { cover: '표지', content: '본문', outro: '마무리' }

export function cardRole(i: number, count: number): CardRole {
  if (i === 0) return 'cover'
  if (i === count - 1 && count > 2) return 'outro'
  return 'content'
}

/** 역할별 글자 수 한도 (공백 포함). 한 장을 3초 안에 읽을 수 있는 정도 */
export const CARD_LIMITS: Record<CardRole, { headline: number; body: number; highlight: number }> = {
  cover: { headline: 22, body: 40, highlight: 20 },
  content: { headline: 20, body: 90, highlight: 25 },
  outro: { headline: 20, body: 60, highlight: 25 },
}

export const CARD_FIELD_LABEL: Record<CardRole, { headline: string; body: string }> = {
  cover: { headline: '후킹 제목', body: '부제' },
  content: { headline: '제목', body: '본문' },
  outro: { headline: '정리 한 줄', body: '마무리 문구 (저장·팔로우 유도)' },
}

export const len = (s: string) => [...s.trim()].length

export const cardCountOf = (ep: Episode) => Math.min(CARD_MAX, Math.max(CARD_MIN, ep.cardCount ?? CARD_DEFAULT))

export const cardName = (i: number, count: number) => `${i + 1}장 · ${CARD_ROLE_LABEL[cardRole(i, count)]}`

/** 글자 수 한도를 넘은 칸 목록 */
export function overLimits(p: Pick<Panel, 'scene' | 'narration' | 'direction'>, i: number, count: number) {
  const L = CARD_LIMITS[cardRole(i, count)]
  const out: string[] = []
  if (len(p.scene) > L.headline) out.push(`제목 ${len(p.scene)}/${L.headline}`)
  if (len(p.narration) > L.body) out.push(`본문 ${len(p.narration)}/${L.body}`)
  if (len(p.direction) > L.highlight) out.push(`강조 ${len(p.direction)}/${L.highlight}`)
  return out
}

/* ───────── 프롬프트 ───────── */

export const cardSettings = (s: CharacterSettings) => ({ ...defaultCardNews(), ...s.cardnews })

/** 카드뉴스 공통 지시문. 인스타툰 캐릭터(뚜구리) 설정은 쓰지 않는다. */
export function cardSystem(s: CharacterSettings) {
  const c = cardSettings(s)
  return [
    '너는 인스타그램 정보 카드뉴스 계정의 제작 보조다.',
    c.intro.trim() && `계정 소개·말투: ${c.intro.trim()}`,
    '공통 원칙: 원문 메모에 없는 사실·수치·제도·인용을 지어내지 않는다. 확인이 필요한 것은 따로 표시한다. 과장된 제목, 공포 마케팅, 근거 없는 단정 금지. 특정 캐릭터나 마스코트를 등장시키지 않는다.',
  ]
    .filter(Boolean)
    .join('\n')
}

const JSON_ONLY = '\n\n출력은 아래 형식의 JSON 하나만. 설명 문장, 마크다운, HTML 없이.'

const CARD_SHAPE = '{"headline":"제목","body":"본문","highlight":"강조 한 줄(없으면 빈 문자열)","imageNote":"이 장 문구에 맞는 이미지 한 줄","check":"사실 확인이 필요한 수치·제도·출처(없으면 빈 문자열)"}'

function limitGuide(count: number) {
  const c = CARD_LIMITS.cover
  const m = CARD_LIMITS.content
  const o = CARD_LIMITS.outro
  return [
    `- 1장(표지): headline은 스크롤을 멈추게 하는 후킹 제목 ${c.headline}자 이내, body는 부제 ${c.body}자 이내. 숫자·대상·약속을 분명하게(예: "프리랜서 3년 차가 매번 쓰는 견적 문장 5개").`,
    `- 2~${count - 1}장(본문): 장마다 메시지 하나. headline ${m.headline}자 이내, body ${m.body}자 이내(2~3줄), highlight는 꼭 기억할 한 줄 ${m.highlight}자 이내.`,
    `- ${count}장(마무리): headline에 전체를 한 줄로 정리(${o.headline}자 이내), body에 저장·공유·팔로우를 자연스럽게 권하는 문구(${o.body}자 이내). 강요하는 말투 금지.`,
    '- 글자 수는 공백 포함. 한도를 넘기지 마. 문장은 짧게, 보고서체 대신 말하듯이.',
  ].join('\n')
}

function cardLine(p: Panel, i: number, count: number) {
  return JSON.stringify({
    id: p.id,
    order: i + 1,
    role: CARD_ROLE_LABEL[cardRole(i, count)],
    headline: p.scene,
    body: p.narration,
    highlight: p.direction,
    imageNote: p.productionNotes,
    check: p.adaptationNotes,
    ...(p.locked ? { locked: true } : {}),
  })
}

function sourceOf(ep: Episode) {
  return [
    `원문 메모(작가가 아는 내용 — 이 범위를 벗어난 사실을 지어내지 말 것):\n"""${ep.originalMemo}"""`,
    ep.notes && `추가 메모:\n${ep.notes}`,
    ep.facts.length ? `정리된 사실:\n${ep.facts.map((f) => `- [${f.status}] ${f.text}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function cardsPrompt(ep: Episode, s: CharacterSettings, count: number, locked: Panel[], all: Panel[]) {
  return `${cardSystem(s)}

[작업: 카드뉴스 ${count}장 구성]
인스타그램 카드뉴스(4:5, 1080×1350)다. 정보를 주고 저장하게 만드는 게 목표다. 만화 콘티가 아니므로 인물·대사는 쓰지 않는다.

${sourceOf(ep)}

${limitGuide(count)}
- 원문 메모에 없는 수치·통계·제도·법은 지어내지 마. 일반 상식이라도 확인이 필요하면 check에 "확인 필요: …"로 적어.
- imageNote는 그 장 문구와 정확히 맞는 그림 한 줄(사물·상황·도식 위주). 특정 캐릭터 없이. 이미지 안에는 글자를 넣지 않는다고 가정.
- title은 작업용 짧은 제목, hook은 표지 headline과 같아도 된다.${
    locked.length ? `\n다음 장은 잠겨 있어 바뀌지 않으니 흐름만 맞춰(같은 순서 자리에 그대로 둘 것):\n${locked.map((p) => cardLine(p, all.indexOf(p), all.length)).join('\n')}` : ''
  }${JSON_ONLY}
{"title":"","hook":"","cards":[${CARD_SHAPE}]}`
}

export type CardOp = 'shorten' | 'rewrite'
export const CARD_OP_LABEL: Record<CardOp, string> = { shorten: '글자 수에 맞게 줄이기', rewrite: '이 장 다시 쓰기' }

export function cardOpPrompt(op: CardOp, target: Panel, all: Panel[], ep: Episode, s: CharacterSettings, request: string) {
  const i = all.indexOf(target)
  const role = cardRole(i, all.length)
  const L = CARD_LIMITS[role]
  const task =
    op === 'shorten'
      ? `이 장의 뜻은 그대로 두고 글자 수만 줄여. headline ${L.headline}자, body ${L.body}자, highlight ${L.highlight}자 이내(공백 포함). 핵심 단어는 남겨.`
      : `이 장만 다시 써. 역할은 ${CARD_ROLE_LABEL[role]}. 요청: ${request || '(특별 요청 없음 — 더 짧고 분명하게)'}. 한도: headline ${L.headline}자, body ${L.body}자, highlight ${L.highlight}자.`
  return `${cardSystem(s)}

[작업: 카드뉴스 부분 수정 — 대상 장 id ${target.id}만]
${sourceOf(ep)}

전체 장(참고용, 대상 외에는 바꾸지 말 것):
${all.map((p, k) => cardLine(p, k, all.length)).join('\n')}

${task}
원문에 없는 수치·제도는 지어내지 말고 check에 적어.${JSON_ONLY}
{"cards":[${CARD_SHAPE.replace('{', `{"id":"${target.id}",`)}]}`
}

/* ───────── 파싱 ───────── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function toDraftItem(c: Record<string, unknown>): PanelDraftItem {
  const item: PanelDraftItem = {
    scene: str(c.headline),
    narration: str(c.body),
    direction: str(c.highlight),
    productionNotes: str(c.imageNote),
    adaptationNotes: str(c.check),
    action: '',
    cast: [],
    dialogue: '',
  }
  if (typeof c.id === 'string') item.id = c.id
  return item
}

export interface CardsDoc {
  title: string
  hook: string
  imageMemo: Partial<ImageMemo>
  items: PanelDraftItem[]
}

export function parseCards(raw: unknown, expect?: { ids?: string[]; range?: [number, number] }): CardsDoc {
  if (!isObj(raw)) throw new ParseError(['최상위가 객체({})여야 해요.'])
  const arr = Array.isArray(raw.cards) ? raw.cards : Array.isArray(raw.panels) ? raw.panels : null
  if (!arr || !arr.length) throw new ParseError(['cards: 장이 하나 이상 있는 배열이어야 해요.'])
  const errs: string[] = []
  const items = arr.map((c, i) => {
    if (!isObj(c)) {
      errs.push(`cards[${i}]: 객체여야 해요.`)
      return toDraftItem({})
    }
    const it = toDraftItem(c)
    if (!it.scene) errs.push(`cards[${i}].headline: 비어 있어요.`)
    return it
  })
  if (expect?.ids) {
    if (items.length !== expect.ids.length) errs.push(`cards: 대상 장 ${expect.ids.length}개만 있어야 해요 (현재 ${items.length}개).`)
    items.forEach((it, i) => {
      if (it.id && !expect.ids!.includes(it.id)) errs.push(`cards[${i}].id: 대상이 아닌 장 id예요.`)
      if (!it.id) it.id = expect.ids![i]
    })
  }
  const r = expect?.range
  if (r && !expect?.ids && (items.length < r[0] || items.length > r[1])) errs.push(`cards: ${r[0]}~${r[1]}장이어야 해요 (현재 ${items.length}장).`)
  if (errs.length) throw new ParseError(errs)
  return { title: str(raw.title).replace(/^「|」$/g, ''), hook: str(raw.hook), imageMemo: {}, items }
}

/* ───────── 복사용 문서 ───────── */

/** 피그마 텍스트 레이어에 붙일 글자만 */
export function cardTextSheet(ep: Episode, cards: Panel[]) {
  const lines = [`「${ep.title}」 카드뉴스 ${cards.length}장 · 화면 문구`, '']
  cards.forEach((p, i) => {
    const F = CARD_FIELD_LABEL[cardRole(i, cards.length)]
    lines.push(`[${cardName(i, cards.length)}]`, `${F.headline}: ${p.scene || '(미정)'}`)
    if (p.narration.trim()) lines.push(`${F.body}: ${p.narration.trim()}`)
    if (p.direction.trim()) lines.push(`강조: ${p.direction.trim()}`)
    lines.push('')
  })
  return lines.join('\n').trim() + '\n'
}

/** 장 구성 전체 (이미지 메모·확인 필요 포함) */
export function cardDocument(ep: Episode, cards: Panel[]) {
  const lines = [`「${ep.title}」 카드뉴스 ${cards.length}장`, '4:5 (1080×1350)', '']
  cards.forEach((p, i) => {
    const F = CARD_FIELD_LABEL[cardRole(i, cards.length)]
    lines.push(`[${cardName(i, cards.length)}]`, `${F.headline}: ${p.scene || '(미정)'}`)
    if (p.narration.trim()) lines.push(`${F.body}: ${p.narration.trim()}`)
    if (p.direction.trim()) lines.push(`강조: ${p.direction.trim()}`)
    if (p.productionNotes.trim()) lines.push(`이미지: ${p.productionNotes.trim()}`)
    if (p.adaptationNotes.trim()) lines.push(`⚠ ${p.adaptationNotes.trim()}`)
    lines.push('')
  })
  return lines.join('\n').trim() + '\n'
}

/** 카드뉴스 게시 문구: 저장이 목표. 캡션 끝에 저장·공유 유도 한 줄 */
export function cardPublishPrompt(ep: Episode, panels: Panel[], slides: Slide[], s: CharacterSettings) {
  const cards = panels.map((p, i) => `${i + 1}장: ${p.scene}${p.narration ? ` — ${p.narration.replace(/\n/g, ' ')}` : ''}`).join('\n')
  return `${cardSystem(s)}

[작업: 카드뉴스 게시 문구]
카드뉴스 「${ep.title}」 ${panels.length}장:
${cards}

슬라이드(id와 연결된 장):
${slides.map((sl, i) => `${i + 1}. ${sl.id} 장: ${sl.panelIds.map((id) => panels.findIndex((p) => p.id === id) + 1).filter((n) => n > 0).join(', ') || '없음'}`).join('\n')}

- caption: 첫 줄은 표지 제목을 다르게 말한 한 문장(피드에서 잘리기 전에 읽히게). 이어서 핵심 2~3줄 요약. 마지막 줄은 저장·공유를 자연스럽게 권하는 한 문장(예: "필요할 때 꺼내 보게 저장해 두세요"). 장문 금지.
- question: 경험을 묻는 댓글 질문(선택, 억지스러우면 빈 문자열).
- hashtags: 주제 관련 5~10개(# 없이). 너무 넓은 태그만 쓰지 말 것.
- slides: 슬라이드별 대체텍스트 — 그 장 글을 그대로 읽어 주는 문장.
실명·회사명 노출 금지(기사에 나온 회사·서비스 이름은 괜찮음).${JSON_ONLY}
{"caption":"","question":"","hashtags":[""],"slides":[{"slideId":"","altText":""}]}`
}
