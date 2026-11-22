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
 *   dialogue        → 태그 (이슈형: 섹션 이름 — 예: 사건의 시작 / 정리형: 날짜·상태)
 *   action          → 출처 (이슈형: 그 장의 근거 매체·기관)
 * 장의 역할은 순서로 정한다: 첫 장 = 표지, 마지막 장 = 마무리, 나머지 = 본문.
 */
import { ParseError } from './prompts'
import { defaultCardNews } from './repo'
import { brandOf, isDark, seriesBlock } from './cardDesign'
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

/** 글 구성 형식: 이슈형은 장마다 2~3문단으로 이야기가 흐르게, 정리형은 장마다 한 메시지 */
export type CardStyle = 'story' | 'brief'
export const CARD_STYLE_LABEL: Record<CardStyle, string> = {
  story: '읽는 이슈형 — 장마다 2~3문단, 이야기가 흐르게',
  brief: '짧은 정리형 — 장마다 메시지 하나',
}
export const cardStyleOf = (ep: Pick<Episode, 'cardStyle'>): CardStyle => ep.cardStyle ?? 'story'

const STORY_LIMITS: typeof CARD_LIMITS = {
  cover: { headline: 34, body: 50, highlight: 20 },
  content: { headline: 30, body: 260, highlight: 20 },
  outro: { headline: 30, body: 220, highlight: 20 },
}
export const limitsOf = (style: CardStyle) => (style === 'brief' ? CARD_LIMITS : STORY_LIMITS)

export const CARD_FIELD_LABEL: Record<CardRole, { headline: string; body: string }> = {
  cover: { headline: '후킹 제목', body: '부제' },
  content: { headline: '제목', body: '본문' },
  outro: { headline: '정리 한 줄', body: '마무리 문구 (저장·팔로우 유도)' },
}

export const len = (s: string) => [...s.trim()].length

export const defaultCount = (style: CardStyle) => (style === 'brief' ? CARD_DEFAULT : 8)
export const cardCountOf = (ep: Episode) => Math.min(CARD_MAX, Math.max(CARD_MIN, ep.cardCount ?? defaultCount(cardStyleOf(ep))))

export const cardName = (i: number, count: number) => `${i + 1}장 · ${CARD_ROLE_LABEL[cardRole(i, count)]}`

/** 글자 수 한도를 넘은 칸 목록 */
export function overLimits(p: Pick<Panel, 'scene' | 'narration' | 'direction'>, i: number, count: number, style: CardStyle = 'story') {
  const L = limitsOf(style)[cardRole(i, count)]
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
    isDark(c) && seriesBlock(brandOf(c)),
    '공통 원칙: 원문 메모에 없는 사실·수치·제도·인용을 지어내지 않는다. 확인이 필요한 것은 따로 표시한다. 과장된 제목, 공포 마케팅, 근거 없는 단정 금지. 특정 캐릭터나 마스코트를 등장시키지 않는다.',
  ]
    .filter(Boolean)
    .join('\n')
}

const JSON_ONLY = '\n\n출력은 아래 형식의 JSON 하나만. 설명 문장, 마크다운, HTML 없이.'

const CARD_SHAPE = '{"tag":"작은 태그(없으면 빈 문자열)","headline":"제목","body":"본문","highlight":"강조(없으면 빈 문자열)","source":"출처(없으면 빈 문자열)","imageNote":"이 장 문구에 맞는 이미지 한 줄","check":"사실 확인이 필요한 수치·제도·출처(없으면 빈 문자열)"}'

/** 디자인에 따라 강조·태그를 어떻게 쓰는지 */
function designGuide(s: CharacterSettings, style: CardStyle = 'brief') {
  if (style === 'story')
    return isDark(cardSettings(s))
      ? '- highlight: headline 안에서 강조색으로 칠할 1~3단어. headline에 글자 그대로 들어 있어야 한다. 표지는 headline을 두 줄(\\n)로 나누고 둘째 줄(반전)을 highlight로.'
      : '- highlight: headline 안에서 강조할 1~3단어(headline에 그대로 들어 있게).'
  return isDark(cardSettings(s))
    ? [
        '- highlight: headline 안에서 강조색으로 칠할 1~3단어. headline에 글자 그대로 들어 있어야 한다(예: headline "이미지 2.6", highlight "2.6"). 표지는 headline을 두 줄(\\n)로 나누고 둘째 줄을 highlight로.',
        '- tag: 본문 장 오른쪽 위 작은 알약에 들어갈 날짜·상태(예: "11.04 출시", "순차 적용", "무료 플랜 가능"). 원문에 근거가 없으면 빈 문자열. 표지·마무리는 빈 문자열.',
      ].join('\n')
    : '- highlight: 꼭 기억할 한 줄. tag는 빈 문자열.'
}

/** 읽는 이슈형: 이야기 흐름·문단·섹션 이름·출처 */
function storyGuide(count: number) {
  const L = STORY_LIMITS
  return [
    '[글 구성: 읽는 이슈형] 짧은 요약 나열이 아니라, 끝까지 넘겨 읽고 싶은 해설 기사처럼 쓴다. 장과 장이 이야기로 이어져야 한다.',
    `- 흐름(장 수 ${count}장에 맞게 줄이거나 합친다): 표지(사실 + 반전) → 사건의 시작(배경, 무슨 일이 있었나) → 핵심 숫자·사실 → 예상 밖의 반응·쟁점 → 논쟁의 핵심 → 또 다른 시각 → 더 큰 질문(독자의 일·삶과 연결) → 마무리(독자에게 묻기).`,
    '- 사실이 부족하면 쟁점·의미를 늘려 쓰지 말고 장 수를 줄인다. 모든 사실 서술은 사실 목록 범위 안에서.',
    `- tag: 그 장의 섹션 이름 2~8자(예: 사건의 시작, 놀라운 숫자, 예상 밖의 반응, 논쟁의 핵심, 또 다른 시각, 더 큰 질문, 마무리). 표지는 영문 대문자 분류(예: "AI ISSUE · MATHEMATICS").`,
    `- 1장(표지): headline은 두 줄(\\n) — 첫 줄은 놀라운 사실, 둘째 줄은 반전·긴장("그런데 수학자들은 걱정했다."). 줄마다 15자 안팎, 전체 ${L.cover.headline}자 이내. body는 부제 한 줄 ${L.cover.body}자 이내(예: "리만가설을 둘러싼 예상 밖의 논쟁").`,
    `- 본문 장: headline은 한 문장으로 다음 내용이 궁금해지게(${L.content.headline}자 이내, 예: "그런데 일부 수학자들의 반응은 달랐습니다."). body는 2~3문단, 문단 사이는 빈 줄(\\n\\n), 문단마다 1~2문장, ${L.content.body}자 이내. "~했어요/~습니다"를 섞은 해설체. 어려운 용어는 한 번 풀어 준다.`,
    `- 마지막 장(마무리): headline은 전체를 꿰는 한 문장(${L.outro.headline}자 이내). body는 2~3문단, 마지막 문단은 독자에게 던지는 질문(${L.outro.body}자 이내). 저장·팔로우 강요 금지.`,
    '- source: 그 장 내용의 근거 매체·기관 이름(예: "Quanta Magazine", "앤트로픽 발표"). 기사·사실 목록에 나온 출처만. 근거가 여러 곳이면 쉼표로. 표지·마무리는 빈 문자열이어도 된다.',
    '- 같은 말 반복, 막연한 "주목된다/귀추가 주목된다" 같은 기사체 상투어 금지.',
  ].join('\n')
}

function limitGuide(count: number) {
  const c = CARD_LIMITS.cover
  const m = CARD_LIMITS.content
  const o = CARD_LIMITS.outro
  return [
    `- 1장(표지): headline은 스크롤을 멈추게 하는 후킹 제목 ${c.headline}자 이내, body는 부제 ${c.body}자 이내. 숫자·대상·약속을 분명하게(예: "프리랜서 3년 차가 매번 쓰는 견적 문장 5개").`,
    `- 2~${count - 1}장(본문): 장마다 메시지 하나. headline ${m.headline}자 이내, body ${m.body}자 이내(2~3줄), highlight ${m.highlight}자 이내(쓰임은 아래).`,
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
    tag: p.dialogue,
    source: p.action,
    imageNote: p.productionNotes,
    check: p.adaptationNotes,
    ...(p.locked ? { locked: true } : {}),
  })
}

function sourceOf(ep: Episode) {
  const facts = ep.facts.filter((f) => f.text.trim())
  const read = facts.some((f) => f.quote)
  return [
    `원문 메모(작가가 아는 내용 — 이 범위를 벗어난 사실을 지어내지 말 것):\n"""${ep.originalMemo}"""`,
    ep.notes && `추가 메모:\n${ep.notes}`,
    ep.articleSummary && `기사 요약: ${ep.articleSummary}`,
    facts.length
      ? `${read ? '기사에서 확인한 사실 (번호로 근거를 댈 것)' : '정리된 사실'}:\n${facts
          .map((f, i) => `F${i + 1}. [${f.status === 'confirmed' ? '확인' : f.status === 'proposed' ? '주장·추정' : '모름'}] ${f.text}${f.quote ? ` (원문: "${f.quote}")` : ''}`)
          .join('\n')}`
      : '',
    read &&
      [
        '사실 사용 규칙:',
        ...((ep.articles ?? []).some((a) => a.from === 'instagram')
          ? ['- 해외 인스타 게시물에서 온 내용이다. 그 게시물의 장 구성·문장·예시를 그대로 옮기지 말고, 사실만 가져와 새로 구성한다.']
          : []),
        '- 본문 장은 [확인] 사실로 채운다. 숫자·날짜·제품명·요금제 이름은 사실에 적힌 그대로.',
        '- [주장·추정]은 "~라고 밝혔다/주장했다"처럼 누가 한 말인지 붙여서만 쓴다.',
        '- 사실 목록에 없는 내용을 덧붙이지 않는다. 장마다 근거 사실 번호를 check 맨 앞에 "근거 F1, F3"처럼 적고, 확인할 게 있으면 그 뒤에 이어 쓴다.',
        '- 내용이 부족하면 "검증 필요", "지켜보자" 같은 말로 장을 채우지 말고 장 수를 줄인다.',
      ].join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n')
}

/* ───────── 기사 번역·사실 정리 ───────── */

const ARTICLE_BUDGET = 24000

/** 읽어 온 기사들을 한국어 사실 목록으로 정리하는 프롬프트 */
export function articleFactsPrompt(ep: Episode, s: CharacterSettings) {
  const arts = ep.articles ?? []
  const per = Math.floor(ARTICLE_BUDGET / Math.max(1, arts.length))
  return `${cardSystem(s)}

[작업: 기사 읽고 사실 정리]
아래 기사를 끝까지 읽고, 카드뉴스에 쓸 수 있게 한국어로 정리한다. 영어 기사는 번역해서 정리한다.

작가 메모: ${ep.originalMemo.trim().slice(0, 1500)}

${arts
  .map(
    (a, i) => `<기사 ${i + 1}>
출처: ${a.site}${a.published ? ` (${a.published.slice(0, 10)})` : ''} ${a.url}
제목: ${a.title}
본문:
${a.text.slice(0, per)}
</기사 ${i + 1}>`,
  )
  .join('\n\n')}

규칙:
- summary: 이 기사가 실제로 말하는 내용 한두 문장 (제목이 과장됐으면 본문 기준으로).
- facts: 카드뉴스에 쓸 만한 사실 5~12개. 하나에 사실 하나, 한국어 한 문장. 숫자·날짜·제품명·요금제는 원문 그대로.
  - status: 기사가 사실로 보도·공식 발표한 것은 confirmed, 누군가의 주장·전망·소문·익명 소식통은 proposed (text에 누가 한 말인지 넣기).
  - quote: 근거가 된 원문 문장 그대로(영어면 영어로, 200자 이내).
- unknowns: 기사만으로는 알 수 없어 작가가 확인해야 할 것 (한국 출시, 요금, 날짜 등). 최대 4개.
- reliability: 출처 신뢰도 한 줄. 공식 발표/주요 매체/개인 블로그·출처 불명 중 무엇인지, 제목과 본문이 다르면 그 점도.
- 기사에 없는 내용은 쓰지 않는다. 본문이 광고·목록 페이지라 내용이 없으면 facts를 비우고 reliability에 그렇게 적는다.${
    arts.some((a) => a.from === 'instagram')
      ? '\n- 인스타그램 게시물은 1차 출처가 아니다. 게시물이 인용한 원래 출처(공식 발표·기사·논문)를 reliability에 적고, 원 출처 확인을 unknowns 첫 번째로 넣는다. 게시물 속 주장은 proposed로.'
      : ''
  }${JSON_ONLY}
{"summary":"","facts":[{"text":"","status":"confirmed|proposed","quote":""}],"unknowns":[""],"reliability":""}`
}

export interface ArticleFactsOut {
  summary: string
  facts: { text: string; status: 'confirmed' | 'proposed'; quote: string }[]
  unknowns: string[]
  reliability: string
}

export function parseArticleFacts(raw: unknown): ArticleFactsOut {
  if (!isObj(raw)) throw new ParseError(['최상위가 객체({})여야 해요.'])
  const facts = (Array.isArray(raw.facts) ? raw.facts : [])
    .filter(isObj)
    .map((f) => ({ text: str(f.text), status: f.status === 'proposed' ? ('proposed' as const) : ('confirmed' as const), quote: str(f.quote) }))
    .filter((f) => f.text)
  const out = {
    summary: str(raw.summary),
    facts,
    unknowns: (Array.isArray(raw.unknowns) ? raw.unknowns : []).map(str).filter(Boolean).slice(0, 4),
    reliability: str(raw.reliability),
  }
  if (!out.summary && !facts.length) throw new ParseError(['summary와 facts가 모두 비어 있어요.'])
  return out
}

export function cardsPrompt(ep: Episode, s: CharacterSettings, count: number, locked: Panel[], all: Panel[]) {
  return `${cardSystem(s)}

[작업: 카드뉴스 ${count}장 구성]
인스타그램 카드뉴스(4:5, 1080×1350)다. ${cardStyleOf(ep) === 'story' ? '끝까지 넘겨 읽고 저장하게 만드는 게 목표다.' : '정보를 주고 저장하게 만드는 게 목표다.'} 만화 콘티가 아니므로 인물·대사는 쓰지 않는다.

${sourceOf(ep)}

${cardStyleOf(ep) === 'story' ? storyGuide(count) : limitGuide(count)}
${designGuide(s, cardStyleOf(ep))}
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
  const style = cardStyleOf(ep)
  const L = limitsOf(style)[role]
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
${style === 'story' ? storyGuide(all.length) : ''}
${designGuide(s, style)}
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
    cast: [],
    dialogue: str(c.tag),
    action: str(c.source),
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
    lines.push(`[${cardName(i, cards.length)}]${p.dialogue.trim() ? ` · ${p.dialogue.trim()}` : ''}`, `${F.headline}: ${p.scene || '(미정)'}`)
    if (p.narration.trim()) lines.push(`${F.body}: ${p.narration.trim()}`)
    if (p.direction.trim()) lines.push(`강조: ${p.direction.trim()}`)
    if (p.action.trim()) lines.push(`출처: ${p.action.trim()}`)
    lines.push('')
  })
  return lines.join('\n').trim() + '\n'
}

/** 장 구성 전체 (이미지 메모·확인 필요 포함) */
export function cardDocument(ep: Episode, cards: Panel[]) {
  const lines = [`「${ep.title}」 카드뉴스 ${cards.length}장`, '4:5 (1080×1350)', '']
  cards.forEach((p, i) => {
    const F = CARD_FIELD_LABEL[cardRole(i, cards.length)]
    lines.push(`[${cardName(i, cards.length)}]${p.dialogue.trim() ? ` · ${p.dialogue.trim()}` : ''}`, `${F.headline}: ${p.scene || '(미정)'}`)
    if (p.narration.trim()) lines.push(`${F.body}: ${p.narration.trim()}`)
    if (p.direction.trim()) lines.push(`강조: ${p.direction.trim()}`)
    if (p.action.trim()) lines.push(`출처: ${p.action.trim()}`)
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
실명·회사명 노출 금지(기사에 나온 회사·서비스 이름은 괜찮음).${(() => {
    const ig = (ep.articles ?? []).filter((a) => a.from === 'instagram').map((a) => a.site)
    return ig.length ? `\n- caption 마지막에 출처를 한 줄로 밝힌다: "출처: ${ig.join(', ')}"` : ''
  })()}${JSON_ONLY}
{"caption":"","question":"","hashtags":[""],"slides":[{"slideId":"","altText":""}]}`
}
