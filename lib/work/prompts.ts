import type { CharacterSettings, Episode, FactStatus, Format, Panel, Purpose, Slide, StoryVersion } from './types'
import type { PanelDraftItem } from './repo'

/* ───────── 프롬프트 ───────── */

/** 설정으로 만든 공통 지시문. 서버(AI 호출)와 수동 프롬프트가 같이 쓴다. */
export function buildSystem(s: CharacterSettings) {
  const ref = s.referenceAssetIds.length
    ? `캐릭터 레퍼런스 이미지 ${s.referenceAssetIds.length}장 등록됨 (작업자가 별도 첨부). 외형은 레퍼런스를 따른다.`
    : '캐릭터 레퍼런스 미등록. 외형을 새로 확정하거나 묘사하지 말 것.'
  return [
    `너는 인스타툰 「${s.seriesName}」의 제작 보조다. 주인공: ${s.characterName}.`,
    s.introduction && `작품 소개: ${s.introduction}`,
    s.voiceRules && `말투·연출: ${s.voiceRules}`,
    s.prohibitions && `금지사항:\n${s.prohibitions}`,
    s.styleNotes && `그림체 메모: ${s.styleNotes}`,
    s.recurringExpressions.length ? `반복 표현: ${s.recurringExpressions.join(', ')}` : '',
    ref,
    '공통 원칙: 원문에 없는 사건·대사·이유·시점을 사실처럼 만들지 않는다. 창작한 대사나 연출은 adaptationNotes 등에 "각색 제안"으로 표시한다. 모르는 사실은 미정으로 둔다. 감정 해석은 제안일 뿐이다.',
  ]
    .filter(Boolean)
    .join('\n')
}

const JSON_ONLY = '\n\n출력은 아래 형식의 JSON 하나만. 설명 문장, 마크다운, HTML 없이.'

function sourceBlock(ep: Episode) {
  const facts = ep.facts.map((f) => `- [${f.status}] ${f.text}`).join('\n')
  return [
    `원문 메모(수정 금지):\n"""${ep.originalMemo}"""`,
    ep.notes && `추가 메모/정정:\n${ep.notes}`,
    facts && `정리된 사실:\n${facts}`,
    ep.unknowns.length ? `미정: ${ep.unknowns.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function storyBlock(st?: StoryVersion) {
  if (!st) return ''
  return `현재 이야기:\n한 줄 요약: ${st.summary}\n도입: ${st.opening}\n전개: ${st.development}\n웃음 지점: ${st.humor}\n마무리: ${st.ending}\n형식: ${st.format === 'single' ? '한컷' : '4컷'}`
}

function panelLine(p: Panel, i: number) {
  return `{"id":"${p.id}","order":${i + 1},"scene":${JSON.stringify(p.scene)},"action":${JSON.stringify(p.action)},"dialogue":${JSON.stringify(p.dialogue)},"narration":${JSON.stringify(p.narration)},"productionNotes":${JSON.stringify(p.productionNotes)},"adaptationNotes":${JSON.stringify(p.adaptationNotes)}${p.locked ? ',"locked":true' : ''}}`
}

export function sourcePrompt(ep: Episode, s: CharacterSettings) {
  return `${buildSystem(s)}

[작업: 소재 정리]
${sourceBlock(ep)}

원문을 바꾸지 말고 정리만 해. facts의 status는 원문에 있는 내용만 confirmed, 추정은 proposed, 모르는 것은 unknown. 결말을 바꿀 만큼 중요한 확인 질문만 unknowns 앞쪽에 최대 2개 넣어. purpose는 discovery/exploration/relationship 중 하나 제안.${JSON_ONLY}
{"situation":"한 줄 상황","facts":[{"text":"","status":"confirmed|proposed|unknown"}],"emotions":["제안"],"humorPoint":"","unknowns":[""],"tags":[""],"purpose":"discovery"}`
}

export function storyPrompt(ep: Episode, s: CharacterSettings) {
  return `${buildSystem(s)}

[작업: 이야기 정리]
${sourceBlock(ep)}
${ep.situation ? `\n한 줄 상황: ${ep.situation}` : ''}${ep.humorPoint ? `\n웃음 포인트: ${ep.humorPoint}` : ''}

가장 적합한 방향 1개만 제안해. 첫 장면과 마지막 한 줄이 연결되게. 억지 반전 대신 실제 상황의 모순을 살려. 한컷이면 development는 빈 문자열이어도 된다. reason은 한 문장.${JSON_ONLY}
{"summary":"","opening":"","development":"","humor":"","ending":"","recommendedFormat":"single|four","reason":""}`
}

export function panelsPrompt(ep: Episode, st: StoryVersion | undefined, format: Format, s: CharacterSettings, locked: Panel[]) {
  const n = format === 'single' ? 1 : 4
  return `${buildSystem(s)}

[작업: ${n === 1 ? '한컷' : '4컷'} 콘티]
${sourceBlock(ep)}

${storyBlock(st)}

컷 ${n}개를 만들어. 컷마다 핵심 행동 하나. 그림으로 전달되면 설명을 줄여. 대사는 컷당 1~2개의 짧은 문장, 빈 대사도 가능. 원문에 없는 대사는 adaptationNotes에 "각색 제안"이라고 적어.${
    locked.length ? `\n다음 컷은 잠겨 있어 바뀌지 않으니 흐름만 맞춰:\n${locked.map(panelLine).join('\n')}` : ''
  }${JSON_ONLY}
{"panels":[{"scene":"화면","action":"행동·표정","dialogue":"대사","narration":"속마음·내레이션","productionNotes":"제작 메모","adaptationNotes":"각색 표시"}]}`
}

export type PanelOp = 'rewrite' | 'shorten' | 'expression' | 'ending'
export const PANEL_OP_LABEL: Record<PanelOp, string> = {
  rewrite: '이 컷만 수정',
  shorten: '대사 줄이기',
  expression: '표정으로 전달하기',
  ending: '마무리 다시 쓰기',
}

export function panelOpPrompt(op: PanelOp, target: Panel, all: Panel[], ep: Episode, st: StoryVersion | undefined, s: CharacterSettings, request: string) {
  const task = {
    rewrite: `이 컷만 다시 써. 요청: ${request || '(특별 요청 없음 — 더 간결하고 자연스럽게)'}`,
    shorten: '이 컷의 대사를 더 짧게 줄여. 의미가 그림으로 전달되면 대사를 비워도 된다.',
    expression: '대사·내레이션 대신 표정과 행동으로 전달되게 바꿔. dialogue는 최소화.',
    ending: `마지막 컷만 다시 써. 첫 장면과 연결되는 건조한 마무리로. 교훈·설명형 마무리 금지. ${request}`,
  }[op]
  return `${buildSystem(s)}

[작업: 부분 수정 — 대상 컷 id ${target.id}만]
${sourceBlock(ep)}

${storyBlock(st)}

전체 컷(참고용, 대상 외에는 바꾸지 말 것):
${all.map(panelLine).join('\n')}

${task}${JSON_ONLY}
{"panels":[{"id":"${target.id}","scene":"","action":"","dialogue":"","narration":"","productionNotes":"","adaptationNotes":""}]}`
}

export function publishPrompt(ep: Episode, st: StoryVersion | undefined, panels: Panel[], slides: Slide[], s: CharacterSettings) {
  return `${buildSystem(s)}

[작업: 게시 문구]
${storyBlock(st)}

컷:
${panels.map(panelLine).join('\n')}

슬라이드(id와 연결된 컷):
${slides.map((sl, i) => `${i + 1}. ${sl.id} (${sl.kind === 'cover' ? '표지' : '본문'}) 컷: ${sl.panelIds.join(', ') || '없음'}`).join('\n')}

짧은 캡션 1안(해시태그 제외), 자연스러운 댓글 유도 질문(선택, 억지스러우면 빈 문자열), 관련 해시태그 5~10개(# 없이), 슬라이드별 대체텍스트 초안. 실명·회사명 노출 금지.${JSON_ONLY}
{"caption":"","question":"","hashtags":[""],"slides":[{"slideId":"","altText":""}]}`
}

export function sceneDescription(p: Panel, idx: number, s: CharacterSettings) {
  const ref = s.referenceAssetIds.length ? `캐릭터 레퍼런스 ${s.referenceAssetIds.length}장 첨부 기준` : '캐릭터 레퍼런스 미등록 — 외형 임의 확정 금지'
  return `[그림 설명 — ${s.seriesName} 컷 ${idx + 1}]
화면: ${p.scene || '(미정)'}
행동·표정: ${p.action || '(미정)'}
캐릭터: ${s.characterName} (${ref})
주변 인물: 단순한 익명 실루엣
${s.styleNotes ? `그림체: ${s.styleNotes}\n` : ''}※ 그림에는 글자·말풍선 넣지 않기 (대사는 별도 레이어)

[올릴 텍스트 — 말풍선/내레이션 레이어]
대사: ${p.dialogue || '(없음)'}
속마음·내레이션: ${p.narration || '(없음)'}
${p.productionNotes ? `\n제작 메모: ${p.productionNotes}` : ''}`
}

/* ───────── 결과 파싱·검증 ───────── */

export class ParseError extends Error {
  constructor(public errors: string[]) {
    super(errors.join('\n'))
  }
}

export function extractJSON(text: string): unknown {
  const t = text.trim()
  if (!t) throw new ParseError(['붙여넣은 내용이 비어 있어요.'])
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fence ? fence[1] : t.slice(Math.max(0, t.indexOf('{')), t.lastIndexOf('}') + 1)
  try {
    return JSON.parse(body)
  } catch (e) {
    throw new ParseError([`JSON 형식이 아니에요: ${(e as Error).message}`])
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function str(o: Record<string, unknown>, k: string, errs: string[], required = false, path = k) {
  const v = o[k]
  if (v === undefined || v === null) {
    if (required) errs.push(`${path}: 필수 항목이 없어요.`)
    return ''
  }
  if (typeof v !== 'string') {
    errs.push(`${path}: 문자열이어야 해요.`)
    return ''
  }
  if (required && !v.trim()) errs.push(`${path}: 비어 있어요.`)
  return v
}

function strArr(o: Record<string, unknown>, k: string, errs: string[]) {
  const v = o[k]
  if (v === undefined) return []
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    errs.push(`${k}: 문자열 배열이어야 해요.`)
    return []
  }
  return (v as string[]).map((x) => x.trim()).filter(Boolean)
}

export interface SourceOut {
  situation: string
  facts: { text: string; status: FactStatus }[]
  emotions: string[]
  humorPoint: string
  unknowns: string[]
  tags: string[]
  purpose?: Purpose
}

export function parseSource(raw: unknown): SourceOut {
  const errs: string[] = []
  if (!isObj(raw)) throw new ParseError(['최상위가 객체({})여야 해요.'])
  const situation = str(raw, 'situation', errs, true)
  const facts: SourceOut['facts'] = []
  if (raw.facts !== undefined) {
    if (!Array.isArray(raw.facts)) errs.push('facts: 배열이어야 해요.')
    else
      raw.facts.forEach((f, i) => {
        if (!isObj(f)) return errs.push(`facts[${i}]: 객체여야 해요.`)
        const text = str(f, 'text', errs, true, `facts[${i}].text`)
        const status = f.status
        if (status !== 'confirmed' && status !== 'proposed' && status !== 'unknown')
          errs.push(`facts[${i}].status: confirmed/proposed/unknown 중 하나여야 해요.`)
        else if (text) facts.push({ text, status })
      })
  }
  let purpose: Purpose | undefined
  if (raw.purpose !== undefined && raw.purpose !== '') {
    if (raw.purpose === 'discovery' || raw.purpose === 'exploration' || raw.purpose === 'relationship') purpose = raw.purpose
    else errs.push('purpose: discovery/exploration/relationship 중 하나여야 해요.')
  }
  const out = {
    situation,
    facts,
    emotions: strArr(raw, 'emotions', errs),
    humorPoint: str(raw, 'humorPoint', errs),
    unknowns: strArr(raw, 'unknowns', errs),
    tags: strArr(raw, 'tags', errs).map((t) => t.replace(/^#/, '')),
    purpose,
  }
  if (errs.length) throw new ParseError(errs)
  return out
}

export interface StoryOut {
  summary: string
  opening: string
  development: string
  humor: string
  ending: string
  recommendedFormat: Format
  reason: string
}

export function parseStory(raw: unknown): StoryOut {
  const errs: string[] = []
  if (!isObj(raw)) throw new ParseError(['최상위가 객체({})여야 해요.'])
  const f = raw.recommendedFormat
  if (f !== 'single' && f !== 'four') errs.push('recommendedFormat: single 또는 four여야 해요.')
  const out = {
    summary: str(raw, 'summary', errs, true),
    opening: str(raw, 'opening', errs),
    development: str(raw, 'development', errs),
    humor: str(raw, 'humor', errs),
    ending: str(raw, 'ending', errs, true),
    recommendedFormat: (f === 'single' ? 'single' : 'four') as Format,
    reason: str(raw, 'reason', errs),
  }
  if (errs.length) throw new ParseError(errs)
  return out
}

export function parsePanels(raw: unknown, expect?: { ids?: string[]; count?: number }): PanelDraftItem[] {
  const errs: string[] = []
  if (!isObj(raw)) throw new ParseError(['최상위가 객체({})여야 해요.'])
  if (!Array.isArray(raw.panels) || raw.panels.length === 0) throw new ParseError(['panels: 컷이 하나 이상 있는 배열이어야 해요.'])
  const items: PanelDraftItem[] = raw.panels.map((p, i) => {
    if (!isObj(p)) {
      errs.push(`panels[${i}]: 객체여야 해요.`)
      return { scene: '', action: '', dialogue: '', narration: '', productionNotes: '', adaptationNotes: '' }
    }
    const P = `panels[${i}]`
    const item: PanelDraftItem = {
      scene: str(p, 'scene', errs, true, `${P}.scene`),
      action: str(p, 'action', errs, false, `${P}.action`),
      dialogue: str(p, 'dialogue', errs, false, `${P}.dialogue`),
      narration: str(p, 'narration', errs, false, `${P}.narration`),
      productionNotes: str(p, 'productionNotes', errs, false, `${P}.productionNotes`),
      adaptationNotes: str(p, 'adaptationNotes', errs, false, `${P}.adaptationNotes`),
    }
    if (typeof p.id === 'string') item.id = p.id
    return item
  })
  if (expect?.ids) {
    if (items.length !== expect.ids.length) errs.push(`panels: 대상 컷 ${expect.ids.length}개만 있어야 해요 (현재 ${items.length}개).`)
    items.forEach((it, i) => {
      if (it.id && !expect.ids!.includes(it.id)) errs.push(`panels[${i}].id: 대상이 아닌 컷 id예요 (${it.id}).`)
      if (!it.id) it.id = expect.ids![i]
    })
  }
  if (expect?.count && !expect.ids && items.length !== expect.count) errs.push(`panels: ${expect.count}컷이어야 해요 (현재 ${items.length}컷). 그래도 적용하려면 형식을 바꿔 주세요.`)
  if (errs.length) throw new ParseError(errs)
  return items
}

export interface PublishOut {
  caption: string
  question: string
  hashtags: string[]
  slides: { slideId: string; altText: string }[]
}

export function parsePublish(raw: unknown, slideIds: string[]): PublishOut {
  const errs: string[] = []
  if (!isObj(raw)) throw new ParseError(['최상위가 객체({})여야 해요.'])
  const slides: PublishOut['slides'] = []
  if (raw.slides !== undefined) {
    if (!Array.isArray(raw.slides)) errs.push('slides: 배열이어야 해요.')
    else
      raw.slides.forEach((s, i) => {
        if (!isObj(s)) return errs.push(`slides[${i}]: 객체여야 해요.`)
        const slideId = str(s, 'slideId', errs, true, `slides[${i}].slideId`)
        if (slideId && !slideIds.includes(slideId)) errs.push(`slides[${i}].slideId: 없는 슬라이드 id예요.`)
        slides.push({ slideId, altText: str(s, 'altText', errs, false, `slides[${i}].altText`) })
      })
  }
  const out = {
    caption: str(raw, 'caption', errs, true),
    question: str(raw, 'question', errs),
    hashtags: strArr(raw, 'hashtags', errs).map((t) => t.replace(/^#/, '')),
    slides,
  }
  if (errs.length) throw new ParseError(errs)
  return out
}
