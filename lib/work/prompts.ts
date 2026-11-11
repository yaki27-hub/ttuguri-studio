import type { CastItem, CastPosition, CharacterSettings, Episode, FactStatus, Format, ImageMemo, Panel, Purpose, Ratio, Slide, StoryVersion } from './types'
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
  return JSON.stringify({
    id: p.id,
    order: i + 1,
    scene: p.scene,
    ...(p.action ? { action: p.action } : {}),
    cast: (p.cast ?? []).map(({ position, name, action, dialogue }) => ({ position, name, action, dialogue })),
    direction: p.direction ?? '',
    dialogue: p.dialogue,
    narration: p.narration,
    productionNotes: p.productionNotes,
    adaptationNotes: p.adaptationNotes,
    ...(p.locked ? { locked: true } : {}),
  })
}

/* ───────── 콘티 형식 ───────── */

export const POSITION_LABEL: Record<CastPosition, string> = { left: '왼쪽', center: '가운데', right: '오른쪽', '': '' }
export const RATIO_LABEL: Record<Ratio, string> = { '4:5': '4:5 세로', '1:1': '1:1 정사각형' }

export const IMAGE_MEMO_FIELDS: { k: Exclude<keyof ImageMemo, 'ratio'>; label: (s: CharacterSettings) => string; placeholder: string }[] = [
  { k: 'composition', label: () => '구도', placeholder: '두 캐릭터가 나란히 보이는 정면 구도' },
  { k: 'placement', label: () => '캐릭터 배치', placeholder: '왼쪽 동료 / 오른쪽 뚜구리' },
  { k: 'characterLook', label: (s) => `${s.characterName} 외형`, placeholder: '기본 디자인 유지' },
  { k: 'extras', label: () => '주변 인물', placeholder: '얼굴 없는 익명 실루엣' },
  { k: 'background', label: () => '배경', placeholder: '사무실 책상, 모니터, 천장 에어컨' },
  { k: 'direction', label: () => '연출', placeholder: '대비를 소품과 행동으로 표현' },
  { k: 'text', label: () => '텍스트', placeholder: '이미지에는 넣지 않고 Figma에서 작업' },
]

/** 인물 대사 + 기타 대사를 “이름: "대사"” 줄로 */
export function dialogueLines(p: Pick<Panel, 'cast' | 'dialogue'>) {
  const out = (p.cast ?? []).filter((c) => c.dialogue.trim()).map((c) => `${c.name || '인물'}: "${c.dialogue.trim()}"`)
  if (p.dialogue?.trim()) out.push(p.dialogue.trim())
  return out
}

const bullets = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim().replace(/^[-•·]\s*/, ''))
    .filter(Boolean)
    .map((l) => `- ${l}`)

const castHead = (c: CastItem) => [POSITION_LABEL[c.position], c.name || '인물'].filter(Boolean).join(' — ')

/** 붙여넣기·공유용 콘티 문서 (제목 → 장면 → 인물별 → 핵심 연출 → 이미지 제작 메모 → 최종 대사) */
export function kontiDocument(ep: Episode, panels: Panel[], s: CharacterSettings, memo: ImageMemo) {
  const single = panels.length === 1
  const lines: string[] = ['상단 제목', `「${ep.title}」`, '']
  panels.forEach((p, i) => {
    lines.push(single ? '한컷 장면' : `컷 ${i + 1} 장면`, p.scene || '(미정)')
    if (p.action) lines.push(...bullets(p.action))
    lines.push('')
    for (const c of p.cast ?? []) {
      lines.push(castHead(c), ...bullets(c.action))
      if (c.dialogue.trim()) lines.push(`- 대사: "${c.dialogue.trim()}"`)
      lines.push('')
    }
    if (p.dialogue.trim()) lines.push('기타 대사·효과음', ...bullets(p.dialogue), '')
    if (p.narration.trim()) lines.push('속마음·내레이션', ...bullets(p.narration), '')
    if (p.direction?.trim()) lines.push('핵심 연출', ...p.direction.trim().split('\n').map((l) => l.trim()).filter(Boolean), '')
    if (p.productionNotes.trim()) lines.push('제작 메모', p.productionNotes.trim(), '')
    if (p.adaptationNotes.trim()) lines.push(`각색 표시: ${p.adaptationNotes.trim()}`, '')
  })
  lines.push('이미지 제작 메모', '항목\t제작 가이드', `화면 비율\t${RATIO_LABEL[memo.ratio] ?? memo.ratio}`)
  for (const f of IMAGE_MEMO_FIELDS) if (memo[f.k].trim()) lines.push(`${f.label(s)}\t${memo[f.k].trim().replace(/\n/g, ' ')}`)
  const confirmed = ep.confirmedPanelRevision !== undefined && !ep.needsReview
  lines.push('', confirmed ? '최종 확정 대사' : '대사 (미확정)', `제목: ${ep.title}`)
  panels.forEach((p, i) => {
    const d = dialogueLines(p)
    if (!single && d.length) lines.push(`컷 ${i + 1}`)
    lines.push(...d)
  })
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

function memoBlock(memo: ImageMemo, s: CharacterSettings) {
  return `이번 편 이미지 제작 메모(현재 값):\n화면 비율: ${memo.ratio}\n${IMAGE_MEMO_FIELDS.map((f) => `${f.label(s)}: ${memo[f.k] || '(비어 있음)'}`).join('\n')}`
}

const PANEL_SHAPE = `{"scene":"장소와 전체 상황 한두 문장","cast":[{"position":"left|center|right","name":"인물 이름(주변 인물은 역할로 — 예: 동료 직원)","action":"차림·행동·표정·소품 (한 줄에 하나)","dialogue":"이 인물의 대사(없으면 빈 문자열)"}],"direction":"핵심 연출 — 대비·거리감 등 이 컷에서 강조할 것","dialogue":"인물에 속하지 않는 대사·효과음(보통 빈 문자열)","narration":"속마음·내레이션","productionNotes":"제작 메모","adaptationNotes":"각색 표시"}`

const MEMO_FIELDS_SHAPE = `"composition":"구도","placement":"캐릭터 배치","characterLook":"주인공 외형 지시","extras":"주변 인물","background":"배경 소품","direction":"연출","text":"텍스트 처리"`

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

export function panelsPrompt(ep: Episode, st: StoryVersion | undefined, format: Format, s: CharacterSettings, locked: Panel[], memo: ImageMemo) {
  const n = format === 'single' ? 1 : 4
  return `${buildSystem(s)}

[작업: ${n === 1 ? '한컷' : '4컷'} 콘티]
${sourceBlock(ep)}

${storyBlock(st)}

${memoBlock(memo, s)}

컷 ${n}개를 만들어. 컷마다 핵심 행동 하나. 그림으로 전달되면 설명을 줄여.
- 컷에 나오는 인물마다 cast 항목을 하나씩 만들고, 화면 위치(left/center/right)와 차림·행동·표정·소품을 한 줄에 하나씩 적어.
- 대사는 그 인물의 dialogue에. 인물당 짧은 한 문장, 빈 대사도 가능.
- direction에는 웃음이 전달되는 핵심 연출(대비, 거리감, 소품)을 짧게.
- 원문에 없는 대사는 adaptationNotes에 "각색 제안"이라고 적어.
- title은 짧은 상단 제목 제안. imageMemo는 이번 편에 맞게 채우되, 비어 있지 않은 현재 값은 그대로 두고 화면 비율은 넣지 마.${
    locked.length ? `\n다음 컷은 잠겨 있어 바뀌지 않으니 흐름만 맞춰:\n${locked.map(panelLine).join('\n')}` : ''
  }${JSON_ONLY}
{"title":"상단 제목","panels":[${PANEL_SHAPE}],"imageMemo":{${MEMO_FIELDS_SHAPE}}}`
}

/** 다른 곳(ChatGPT 등)에서 만든 콘티 글을 앱 형식으로 옮긴다. 내용은 바꾸지 않는다. */
export function importKontiPrompt(text: string, s: CharacterSettings) {
  return `${buildSystem(s)}

[작업: 콘티 옮겨 적기]
아래 <콘티> 안의 글은 작업자가 다른 곳에서 이미 확정한 콘티다. 내용을 고치거나 다듬지 말고, 적힌 그대로 JSON 칸에 나눠 담아.
- 컷 수는 글에 적힌 대로(한컷이면 1개, 4컷이면 4개).
- 인물별 블록(예: "왼쪽 — 동료 직원")은 cast 항목 하나로. 위치는 left/center/right, 없으면 빈 문자열. 블록 안의 줄은 action에 한 줄씩, "대사:" 줄은 dialogue로.
- 글에 없는 칸은 빈 문자열. 새 대사·연출을 지어내지 마. adaptationNotes도 글에 없으면 빈 문자열.
- "최종 확정 대사"가 따로 있으면 그 대사를 해당 인물의 dialogue로 쓴다.
- 이미지 제작 메모 표가 있으면 imageMemo에, 화면 비율은 ratio에 "1:1" 또는 "4:5"로.

<콘티>
${text.trim()}
</콘티>${JSON_ONLY}
{"title":"상단 제목","panels":[${PANEL_SHAPE}],"imageMemo":{"ratio":"1:1|4:5",${MEMO_FIELDS_SHAPE}}}`
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
    expression: '대사·내레이션 대신 표정과 행동으로 전달되게 바꿔. 인물 대사는 최소화.',
    ending: `마지막 컷만 다시 써. 첫 장면과 연결되는 건조한 마무리로. 교훈·설명형 마무리 금지. ${request}`,
  }[op]
  return `${buildSystem(s)}

[작업: 부분 수정 — 대상 컷 id ${target.id}만]
${sourceBlock(ep)}

${storyBlock(st)}

전체 컷(참고용, 대상 외에는 바꾸지 말 것):
${all.map(panelLine).join('\n')}

${task}
인물별 위치·행동·대사는 cast에, 핵심 연출은 direction에 둬.${JSON_ONLY}
{"panels":[${PANEL_SHAPE.replace('{', `{"id":"${target.id}",`)}]}`
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

export function sceneDescription(p: Panel, idx: number, s: CharacterSettings, memo: ImageMemo) {
  const ref = s.referenceAssetIds.length ? `캐릭터 레퍼런스 ${s.referenceAssetIds.length}장 첨부 기준` : '캐릭터 레퍼런스 미등록 — 외형 임의 확정 금지'
  const cast = (p.cast ?? []).map((c) => [castHead(c), ...bullets(c.action)].join('\n'))
  const memoLines = IMAGE_MEMO_FIELDS.filter((f) => memo[f.k].trim()).map((f) => `${f.label(s)}: ${memo[f.k].trim()}`)
  const d = dialogueLines(p)
  return [
    `[그림 설명 — ${s.seriesName} 컷 ${idx + 1}]`,
    `화면 비율: ${RATIO_LABEL[memo.ratio] ?? memo.ratio}`,
    `장면: ${p.scene || '(미정)'}`,
    p.action && `행동·표정: ${p.action}`,
    cast.length ? `\n${cast.join('\n\n')}\n` : '',
    p.direction && `핵심 연출: ${p.direction}`,
    `캐릭터: ${s.characterName} (${ref})`,
    ...memoLines,
    s.styleNotes && `그림체: ${s.styleNotes}`,
    '※ 그림에는 글자·말풍선 넣지 않기 (대사는 별도 레이어)',
    '\n[올릴 텍스트 — 말풍선/내레이션 레이어]',
    `대사: ${d.length ? `\n${d.join('\n')}` : '(없음)'}`,
    `속마음·내레이션: ${p.narration || '(없음)'}`,
    p.productionNotes && `\n제작 메모: ${p.productionNotes}`,
  ]
    .filter((x): x is string => typeof x === 'string' && x !== '')
    .join('\n')
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
      return { scene: '', action: '', cast: [], direction: '', dialogue: '', narration: '', productionNotes: '', adaptationNotes: '' }
    }
    const P = `panels[${i}]`
    const item: PanelDraftItem = {
      scene: str(p, 'scene', errs, true, `${P}.scene`),
      action: str(p, 'action', errs, false, `${P}.action`),
      cast: parseCast(p.cast, P, errs),
      direction: str(p, 'direction', errs, false, `${P}.direction`),
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

function parseCast(v: unknown, P: string, errs: string[]): CastItem[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) {
    errs.push(`${P}.cast: 배열이어야 해요.`)
    return []
  }
  return v.flatMap((c, j) => {
    const C = `${P}.cast[${j}]`
    if (!isObj(c)) {
      errs.push(`${C}: 객체여야 해요.`)
      return []
    }
    const pos = c.position ?? ''
    if (pos !== '' && pos !== 'left' && pos !== 'center' && pos !== 'right') errs.push(`${C}.position: left/center/right 중 하나여야 해요.`)
    // 줄 목록을 배열로 보내는 경우도 받아 준다
    const action = Array.isArray(c.action) && c.action.every((x) => typeof x === 'string') ? (c.action as string[]).join('\n') : str(c, 'action', errs, false, `${C}.action`)
    const item: CastItem = {
      id: Math.random().toString(36).slice(2, 10),
      position: pos === 'left' || pos === 'center' || pos === 'right' ? pos : '',
      name: str(c, 'name', errs, false, `${C}.name`),
      action,
      dialogue: str(c, 'dialogue', errs, false, `${C}.dialogue`),
    }
    return [item]
  })
}

export interface PanelsDoc {
  title: string
  imageMemo: Partial<ImageMemo>
  items: PanelDraftItem[]
}

/** 콘티 전체 초안: 제목·컷·이미지 제작 메모 */
export function parsePanelsDoc(raw: unknown, expect?: { count?: number }): PanelsDoc {
  const items = parsePanels(raw, expect)
  const o = raw as Record<string, unknown>
  const errs: string[] = []
  const title = typeof o.title === 'string' ? o.title.trim().replace(/^「|」$/g, '') : ''
  const imageMemo: Partial<ImageMemo> = {}
  if (o.imageMemo !== undefined) {
    if (!isObj(o.imageMemo)) errs.push('imageMemo: 객체여야 해요.')
    else {
      const m = o.imageMemo
      if (m.ratio !== undefined && m.ratio !== '') {
        const r = String(m.ratio).replace(/\s/g, '')
        if (r.startsWith('1:1')) imageMemo.ratio = '1:1'
        else if (r.startsWith('4:5')) imageMemo.ratio = '4:5'
        else errs.push('imageMemo.ratio: "1:1" 또는 "4:5"여야 해요.')
      }
      for (const f of IMAGE_MEMO_FIELDS) {
        const v = str(m, f.k, errs, false, `imageMemo.${f.k}`).trim()
        if (v) imageMemo[f.k] = v
      }
    }
  }
  if (errs.length) throw new ParseError(errs)
  return { title, imageMemo, items }
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
