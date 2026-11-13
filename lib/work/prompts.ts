import type { CastItem, CastPosition, Category, CharacterSettings, ClassCandidate, Classification, Episode, FactStatus, Format, ImageMemo, Output, Panel, Purpose, Ratio, Slide, StoryVersion } from './types'
import { CATEGORY, CATEGORIES, FORMAT_LABEL, countRange } from './format'
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
    '공통 원칙: 원문에 없는 사건·대사·이유·시점을 사실처럼 만들지 않는다. 창작한 대사나 시각적 장치는 adaptationNotes 등에 "각색 제안"으로 표시한다. 모르는 사실은 미정으로 둔다. 감정 해석은 제안일 뿐이다.',
    '원문에서 "이 대사 그대로"처럼 고정해 달라고 한 말은 글자 하나 바꾸지 않고 쓴다.',
    '소재의 결을 지킨다: 웃긴 얘기는 짧은 밈처럼, 잔잔한 얘기는 그 분위기를 살려서. 억지로 웃기게 만들지 않는다.',
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
  return `현재 이야기:\n한 줄 요약: ${st.summary}\n도입: ${st.opening}\n전개: ${st.development}\n웃음 지점: ${st.humor}\n마무리: ${st.ending}\n형식: ${FORMAT_GUIDE[st.format]}`
}

function panelLine(p: Panel, i: number) {
  return JSON.stringify({
    id: p.id,
    order: i + 1,
    scene: p.scene,
    ...(p.action ? { action: p.action } : {}),
    cast: (p.cast ?? []).map(({ position, name, action, dialogue, fixed }) => ({ position, name, action, dialogue, ...(fixed ? { fixed: true } : {}) })),
    direction: p.direction ?? '',
    dialogue: p.dialogue,
    narration: p.narration,
    productionNotes: p.productionNotes,
    adaptationNotes: p.adaptationNotes,
    ...(p.locked ? { locked: true } : {}),
  })
}

/* ───────── 콘티 형식 ───────── */

export const FORMAT_GUIDE: Record<Format, string> = {
  single: '한컷 — 한 장면으로 끝나는 밈. 첫 화면 문구를 그림 안 자막으로 써도 된다.',
  four: '4컷 — 상황 → 진행 → 반전 단서 → 결말의 짧은 스토리.',
  captions: '컷자막형 — 2~4장. 장마다 그림 한 장과 짧은 자막 한 줄로 잔잔하게 흘러가는 이야기.',
}

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
  const lines: string[] = ['상단 제목', `「${ep.title}」`, '', `형식: ${FORMAT_LABEL[ep.format]}`, '']
  if (ep.hookText?.trim()) lines.push('첫 화면 문구', ep.hookText.trim(), '')
  panels.forEach((p, i) => {
    lines.push(`${cutName(ep, panels.length, i)} 장면`, p.scene || '(미정)')
    if (p.action) lines.push(...bullets(p.action))
    lines.push('')
    for (const c of p.cast ?? []) {
      lines.push(castHead(c), ...bullets(c.action))
      if (c.dialogue.trim()) lines.push(`- 대사: "${c.dialogue.trim()}"`)
      lines.push('')
    }
    if (p.dialogue.trim()) lines.push('기타 대사·효과음', ...bullets(p.dialogue), '')
    if (p.narration.trim()) lines.push(textLabel(ep.format), ...bullets(p.narration), '')
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
    if (!single && d.length) lines.push(cutName(ep, panels.length, i))
    lines.push(...d)
  })
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** 한컷 / 컷 2 / 2장 */
export function cutName(ep: Pick<Episode, 'format'>, count: number, i: number) {
  if (count === 1) return '한컷'
  return ep.format === 'captions' ? `${i + 1}장` : `컷 ${i + 1}`
}

/** narration 칸 이름: 컷자막형은 자막 */
export const textLabel = (f: Format) => (f === 'captions' ? '자막' : '속마음·내레이션')

/** 피그마용 ① 그릴 것만: 컷별 장면·인물 행동·핵심 연출 + 이미지 제작 메모 */
export function sceneSheet(ep: Episode, panels: Panel[], s: CharacterSettings, memo: ImageMemo) {
  const lines: string[] = [`「${ep.title}」 장면 설명 · ${FORMAT_LABEL[ep.format]}`, '']
  panels.forEach((p, i) => {
    lines.push(`[${cutName(ep, panels.length, i)}]`, p.scene || '(미정)')
    if (p.action) lines.push(...bullets(p.action))
    for (const c of p.cast ?? []) lines.push(`${castHead(c)}: ${c.action.split('\n').map((l) => l.trim().replace(/^[-•·]\s*/, '')).filter(Boolean).join(' / ') || '(행동 미정)'}`)
    if (p.direction?.trim()) lines.push(`핵심 연출: ${p.direction.trim().replace(/\n/g, ' / ')}`)
    lines.push('')
  })
  lines.push('이미지 제작 메모', `화면 비율\t${RATIO_LABEL[memo.ratio] ?? memo.ratio}`)
  for (const f of IMAGE_MEMO_FIELDS) if (memo[f.k].trim()) lines.push(`${f.label(s)}\t${memo[f.k].trim().replace(/\n/g, ' ')}`)
  return lines.join('\n').trim() + '\n'
}

/** 피그마용 ② 화면에 올릴 글자만: 첫 화면 문구·대사·자막 */
export function screenTextSheet(ep: Episode, panels: Panel[]) {
  const lines: string[] = [`「${ep.title}」 화면 문구`, '']
  if (ep.hookText?.trim()) lines.push('[첫 화면 문구]', ep.hookText.trim(), '')
  panels.forEach((p, i) => {
    lines.push(`[${cutName(ep, panels.length, i)}]`)
    const d = dialogueLines(p)
    const txt = p.narration.trim()
    if (!d.length && !txt) lines.push('(글자 없음 — 그림으로만)')
    lines.push(...d)
    if (txt) lines.push(`${textLabel(ep.format)}: ${txt}`)
    lines.push('')
  })
  return lines.join('\n').trim() + '\n'
}

function memoBlock(memo: ImageMemo, s: CharacterSettings) {
  return `이번 편 이미지 제작 메모(현재 값):\n화면 비율: ${memo.ratio}\n${IMAGE_MEMO_FIELDS.map((f) => `${f.label(s)}: ${memo[f.k] || '(비어 있음)'}`).join('\n')}`
}

const PANEL_SHAPE = `{"scene":"장소와 전체 상황 한두 문장","cast":[{"position":"left|center|right","name":"인물 이름(주변 인물은 역할로 — 예: 동료 직원)","action":"차림·행동·표정·소품 (한 줄에 하나)","dialogue":"이 인물의 대사(없으면 빈 문자열)","fixed":false}],"direction":"핵심 연출 — 대비·거리감 등 이 컷에서 강조할 것","dialogue":"인물에 속하지 않는 대사·효과음(보통 빈 문자열)","narration":"속마음·내레이션","productionNotes":"제작 메모","adaptationNotes":"각색 표시"}`

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

가장 적합한 방향 1개만 제안해. 형식은 아래 중 소재에 어울리는 하나:\n${(['single', 'four', 'captions'] as Format[]).map((f) => `- ${f}: ${FORMAT_GUIDE[f]}`).join('\n')}\n 첫 장면과 마지막 한 줄이 연결되게. 억지 반전 대신 실제 상황의 모순을 살려. 한컷이면 development는 빈 문자열이어도 된다. reason은 한 문장.${JSON_ONLY}
{"summary":"","opening":"","development":"","humor":"","ending":"","recommendedFormat":"single|four|captions","reason":""}`
}

export function panelsPrompt(ep: Episode, st: StoryVersion | undefined, format: Format, s: CharacterSettings, locked: Panel[], memo: ImageMemo, fixedLines: string[] = []) {
  const [a, b] = countRange(format)
  const n = a === b ? `${a}개` : `${a}~${b}개(이야기에 맞게, 보통 3장)`
  return `${buildSystem(s)}

[작업: ${FORMAT_LABEL[format]} 콘티]
형식: ${FORMAT_GUIDE[format]}
${sourceBlock(ep)}

${storyBlock(st)}

${memoBlock(memo, s)}

컷 ${n}를 만들어. 컷마다 핵심 행동 하나. 그림으로 읽히는 상황은 대사를 줄이고, 마지막 컷은 표정·행동·소품으로 끝내도 된다.
- 컷에 나오는 인물마다 cast 항목을 하나씩 만들고, 화면 위치(left/center/right)와 차림·행동·표정·소품을 한 줄에 하나씩 적어.
- 대사는 그 인물의 dialogue에. 인물당 짧은 한 문장, 빈 대사도 가능.
- direction에는 웃음이 전달되는 핵심 연출(대비, 거리감, 소품)을 짧게.
- ${format === 'captions' ? 'narration에는 그 장에 올릴 자막 한 줄.' : 'narration은 속마음·내레이션이 꼭 필요할 때만.'}
- 원문에 없는 대사나 시각적 장치는 adaptationNotes에 "각색 제안"이라고 적어.
- hook은 첫 화면(첫 장)에 올릴 짧은 문구.${format === 'single' ? ' 한컷이면 그림 안 자막으로 쓰인다.' : ''}
- title은 짧은 상단 제목 제안. imageMemo는 이번 편에 맞게 채우되, 비어 있지 않은 현재 값은 그대로 두고 화면 비율은 넣지 마.${
    locked.length ? `\n다음 컷은 잠겨 있어 바뀌지 않으니 흐름만 맞춰:\n${locked.map(panelLine).join('\n')}` : ''
  }${fixedLines.length ? `\n다음 대사는 고정이야. 글자 그대로 넣고 그 cast의 fixed를 true로:\n${fixedLines.join('\n')}` : ''}${JSON_ONLY}
{"title":"상단 제목","hook":"첫 화면 문구","panels":[${PANEL_SHAPE}],"imageMemo":{${MEMO_FIELDS_SHAPE}}}`
}

/** 다른 곳(ChatGPT 등)에서 만든 콘티 글을 앱 형식으로 옮긴다. 내용은 바꾸지 않는다. */
export function importKontiPrompt(text: string, s: CharacterSettings) {
  return `${buildSystem(s)}

[작업: 콘티 옮겨 적기]
아래 <콘티> 안의 글은 작업자가 다른 곳에서 이미 확정한 콘티다. 내용을 고치거나 다듬지 말고, 적힌 그대로 JSON 칸에 나눠 담아.
- 컷 수는 글에 적힌 대로(한컷이면 1개, 4컷이면 4개, 장마다 자막이 붙는 형식이면 그 장 수). format은 single(한컷)/four(4컷)/captions(2~4장 컷자막형) 중 글에 맞는 것.
- 첫 화면 문구가 있으면 hook에. 장별 자막은 narration에.
- 인물별 블록(예: "왼쪽 — 동료 직원")은 cast 항목 하나로. 위치는 left/center/right, 없으면 빈 문자열. 블록 안의 줄은 action에 한 줄씩, "대사:" 줄은 dialogue로.
- 글에 없는 칸은 빈 문자열. 새 대사·연출을 지어내지 마. adaptationNotes도 글에 없으면 빈 문자열.
- "최종 확정 대사"가 따로 있으면 그 대사를 해당 인물의 dialogue로 쓴다.
- 이미지 제작 메모 표가 있으면 imageMemo에, 화면 비율은 ratio에 "1:1" 또는 "4:5"로.

<콘티>
${text.trim()}
</콘티>${JSON_ONLY}
{"title":"상단 제목","format":"single|four|captions","hook":"첫 화면 문구","panels":[${PANEL_SHAPE}],"imageMemo":{"ratio":"1:1|4:5",${MEMO_FIELDS_SHAPE}}}`
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
  if (f !== 'single' && f !== 'four' && f !== 'captions') errs.push('recommendedFormat: single, four, captions 중 하나여야 해요.')
  const out = {
    summary: str(raw, 'summary', errs, true),
    opening: str(raw, 'opening', errs),
    development: str(raw, 'development', errs),
    humor: str(raw, 'humor', errs),
    ending: str(raw, 'ending', errs, true),
    recommendedFormat: (f === 'single' || f === 'captions' ? f : 'four') as Format,
    reason: str(raw, 'reason', errs),
  }
  if (errs.length) throw new ParseError(errs)
  return out
}

export function parsePanels(raw: unknown, expect?: { ids?: string[]; range?: [number, number] }): PanelDraftItem[] {
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
  const r = expect?.range
  if (r && !expect.ids && (items.length < r[0] || items.length > r[1]))
    errs.push(`panels: ${r[0] === r[1] ? `${r[0]}컷` : `${r[0]}~${r[1]}컷`}이어야 해요 (현재 ${items.length}컷). 그래도 적용하려면 형식을 바꿔 주세요.`)
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
      ...(c.fixed === true ? { fixed: true } : {}),
    }
    return [item]
  })
}

export interface PanelsDoc {
  title: string
  hook: string
  format?: Format
  imageMemo: Partial<ImageMemo>
  items: PanelDraftItem[]
}

/** 콘티 전체 초안: 제목·컷·이미지 제작 메모 */
export function parsePanelsDoc(raw: unknown, expect?: { range?: [number, number] }): PanelsDoc {
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
  const hook = typeof o.hook === 'string' ? o.hook.trim() : ''
  const format = o.format === 'single' || o.format === 'four' || o.format === 'captions' ? o.format : undefined
  if (errs.length) throw new ParseError(errs)
  return { title, hook, format, imageMemo, items }
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

/* ───────── 빠른 시안: 메모 하나로 콘티 + 캡션까지 한 번에 ───────── */

export type QuickFormat = Format | 'auto'

export function quickPrompt(ep: Episode, s: CharacterSettings, format: QuickFormat, memo: ImageMemo, reels: boolean, pick?: ClassCandidate, series?: Classification['series']) {
  const formatLine =
    format === 'auto'
      ? `형식은 소재에 가장 어울리는 하나를 골라 format에 적어:\n${(['single', 'four', 'captions'] as Format[]).map((f) => `- ${f}: ${FORMAT_GUIDE[f]}`).join('\n')}`
      : `형식: ${FORMAT_GUIDE[format]} (format에는 "${format}")`
  const [a, b] = format === 'auto' ? [1, 4] : countRange(format)
  const n = a === b ? `${a}개` : `${a}~${b}개`
  return `${buildSystem(s)}

[작업: 빠른 시안 — 메모 하나로 콘티와 게시 문구까지]
${sourceBlock(ep)}

${formatLine}
${pick ? `\n작가가 고른 분류: ${CATEGORY[pick.category].label} — ${pick.reason}\n후킹 제목 후보: ${pick.hook} (hook과 title에 살려서 쓰기)` : ''}${
    pick?.category === 'series' && series
      ? `\n연재 「${series.name}」 ${series.episodes.length}편 중 1편: ${series.episodes[0]?.title ?? ''} — ${series.episodes[0]?.summary ?? ''}\n이 편만 봐도 웃기게 끝내고, 마지막 컷 narration에 다음 편이 궁금해지는 한 줄을 넣어.`
      : ''
  }

${memoBlock(memo, s)}

컷 ${n}를 만들어. 컷마다 핵심 행동 하나, 대사는 짧게. 그림으로 읽히는 건 대사로 설명하지 마.
- 컷에 나오는 인물마다 cast 항목을 하나씩(위치·차림·행동·표정·소품은 한 줄에 하나, 대사는 dialogue).
- direction에는 웃음이 전달되는 핵심 연출을 짧게. 원문에 없는 대사·장치는 adaptationNotes에 "각색 제안".
- hook은 첫 화면에 올릴 짧은 문구(처음 보는 사람이 2초 안에 이해할 것). title은 짧은 상단 제목.${
    reels ? '\n- 릴스로도 만든다. 컷 하나가 1.5~3초 동안 보이니 대사·자막은 한 줄로 읽히게.' : ''
  }
- caption: 인스타 캡션. 첫 줄은 피드에서 잘리지 않게 짧게, 마지막 결말은 캡션에서 미리 말하지 마. 행동 유도(댓글이나 공유)는 하나만. 해시태그는 넣지 마.
- hashtags: 검색될 만한 해시태그 정확히 5개(# 없이). 아무도 검색하지 않는 계정 이름 태그는 빼.
- imageMemo는 비어 있지 않은 현재 값은 그대로 두고, 화면 비율은 넣지 마.${JSON_ONLY}
{"format":"single|four|captions","title":"상단 제목","hook":"첫 화면 문구","panels":[${PANEL_SHAPE}],"imageMemo":{${MEMO_FIELDS_SHAPE}},"caption":"","hashtags":[""]}`
}

export interface QuickOut extends PanelsDoc {
  format: Format
  caption: string
  hashtags: string[]
}

export function parseQuick(raw: unknown, format: QuickFormat): QuickOut {
  if (!isObj(raw)) throw new ParseError(['최상위가 객체({})여야 해요.'])
  const errs: string[] = []
  const picked = raw.format === 'single' || raw.format === 'four' || raw.format === 'captions' ? raw.format : undefined
  const fmt: Format | undefined = format === 'auto' ? picked : format
  if (!fmt) errs.push('format: single/four/captions 중 하나여야 해요.')
  let doc: PanelsDoc | undefined
  try {
    doc = parsePanelsDoc(raw, fmt ? { range: countRange(fmt) } : undefined)
  } catch (e) {
    if (e instanceof ParseError) errs.push(...e.errors)
    else throw e
  }
  const caption = str(raw, 'caption', errs)
  const hashtags = strArr(raw, 'hashtags', errs).map((t) => t.replace(/^#/, ''))
  if (errs.length || !doc || !fmt) throw new ParseError(errs)
  return { ...doc, format: fmt, caption, hashtags }
}

/* ───────── AI 콘텐츠 분류 ───────── */

export function classifyPrompt(ep: Episode, s: CharacterSettings) {
  return `${buildSystem(s)}

[작업: 콘텐츠 분류 — 이 소재를 어떤 방식으로 만들지]
${sourceBlock(ep)}

분류 기준:
${s.classifyRules}

분류 코드: ${CATEGORIES.map((c) => `${c}=${CATEGORY[c].label}`).join(', ')}
- candidates에 가장 어울리는 분류 1순위와 2순위를 넣어(정말 하나뿐이면 1개). 결정은 작가가 한다.
- reason: 왜 이 분류인지 원문의 어떤 점 때문인지 한 문장.
- hook: 처음 보는 사람이 2초 안에 멈출 후킹 제목. 원문에 없는 사건을 지어내지 마.
- outputs: 성과 메모를 참고해 "reels", "carousel" 중 추천(둘 다 가능).
- 웃음 포인트나 핵심이 불명확하면 1순위를 hold로 하고, questions에 작가에게 물을 짧은 질문 2개(예: 가장 웃겼던 순간은? 그다음에 어떻게 됐어?). 아니면 questions는 빈 배열.
- series가 후보에 있으면 series에 시리즈 이름과 편 구성(2~7편, 편마다 제목과 한 줄 요약). 아니면 series는 null.${JSON_ONLY}
{"candidates":[{"category":"gag|real4|mood|series|hold","reason":"","hook":"","outputs":["reels","carousel"]}],"questions":[],"series":null}`
}

const isCategory = (v: unknown): v is Category => typeof v === 'string' && (CATEGORIES as string[]).includes(v)

export function parseClassify(raw: unknown): Omit<Classification, 'at' | 'chosen'> {
  const errs: string[] = []
  if (!isObj(raw)) throw new ParseError(['최상위가 객체({})여야 해요.'])
  if (!Array.isArray(raw.candidates) || raw.candidates.length === 0) throw new ParseError(['candidates: 분류 후보가 하나 이상 있어야 해요.'])
  const candidates: ClassCandidate[] = []
  raw.candidates.slice(0, 2).forEach((c, i) => {
    const P = `candidates[${i}]`
    if (!isObj(c)) return errs.push(`${P}: 객체여야 해요.`)
    if (!isCategory(c.category)) return errs.push(`${P}.category: ${CATEGORIES.join('/')} 중 하나여야 해요.`)
    const outs = Array.isArray(c.outputs) ? (c.outputs.filter((o) => o === 'reels' || o === 'carousel') as Output[]) : []
    candidates.push({
      category: c.category,
      reason: str(c, 'reason', errs, false, `${P}.reason`).trim(),
      hook: str(c, 'hook', errs, false, `${P}.hook`).trim(),
      outputs: outs.length ? [...new Set(outs)] : ['carousel'],
    })
  })
  const questions = strArr(raw, 'questions', errs).slice(0, 3)
  let series: Classification['series']
  if (isObj(raw.series)) {
    const name = str(raw.series, 'name', errs, false, 'series.name').trim()
    const eps = Array.isArray(raw.series.episodes) ? raw.series.episodes : []
    const episodes = eps
      .filter(isObj)
      .map((e) => ({ title: typeof e.title === 'string' ? e.title.trim() : '', summary: typeof e.summary === 'string' ? e.summary.trim() : '' }))
      .filter((e) => e.title || e.summary)
      .slice(0, 7)
    if (episodes.length) series = { name: name || '새 연재', episodes }
  }
  if (errs.length) throw new ParseError(errs)
  return { candidates, questions, series }
}
