import { ParseError } from './prompts'
import { uid } from './db'
import { REF_FORMAT_LABEL, REF_POST_TYPE_LABEL, fmtCount } from './refs'
import type { CharacterSettings, Episode, RefBreakdown, RefVariant, Reference } from './types'
import { cardSystem } from './cards'

/*
 * 레퍼런스 연구실
 * - 뜯어보기: 잘된 게시물을 후킹·컷 흐름·반응 이유·빌릴 틀로 분해한다.
 * - 변주: 틀만 빌리고 주제를 뚜구리 소재로 바꾼 안을 여러 개 뽑는다.
 *   변주마다 "실제로 이런 일이 있었나요?" 질문을 붙여 내 이야기를 섞게 한다.
 */

const JSON_ONLY = '\n\n출력은 아래 형식의 JSON 하나만. 설명 문장, 마크다운 없이.'

function refFacts(r: Reference) {
  const metrics = [r.likes !== undefined && `좋아요 ${fmtCount(r.likes)}`, r.comments !== undefined && `댓글 ${fmtCount(r.comments)}`, r.views !== undefined && `조회 ${fmtCount(r.views)}`]
    .filter(Boolean)
    .join(' · ')
  return [
    `계정: @${r.account}`,
    r.format && `형식: ${REF_FORMAT_LABEL[r.format]}${r.postType ? ` (${REF_POST_TYPE_LABEL[r.postType]})` : ''}`,
    metrics && `지표: ${metrics}`,
    r.tags.length ? `태그: ${r.tags.join(', ')}` : '',
    r.note && `작가 메모:\n${r.note}`,
    r.caption && `원본 캡션:\n"""${r.caption.slice(0, 2000)}"""`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** seen: 작가가 게시물을 보고 컷별로 적은 내용 (AI는 이미지를 못 보므로) */
export function breakdownPrompt(r: Reference, seen: string) {
  return (
    [
      '너는 인스타툰·카드뉴스 기획 분석가다. 아래 게시물이 왜 반응을 얻었는지 분해한다.',
      '목표는 베끼기가 아니라 "주제를 바꿔도 통하는 틀"을 찾는 것이다.',
      refFacts(r),
      seen.trim() && `작가가 본 컷별 내용:\n"""${seen.trim()}"""`,
      '규칙:',
      '- 주어진 내용에 없는 대사·장면을 지어내지 않는다. 모르면 "확인 필요"라고 쓴다.',
      '- hook: 첫 컷(첫 장)에서 스크롤을 멈추게 한 장치. 문구가 있으면 그 역할을 설명.',
      '- flow: 컷(장)마다 한 줄. "1컷: 역할 — 내용" 형태.',
      '- why: 사람들이 공감·저장·공유한 이유 1~3가지.',
      '- reactions: 댓글에서 보일 법한 반응 유형 (캡션·메모에 근거가 없으면 "추정"이라고 표시).',
      '- formula: 주제·고유명사를 모두 뺀 틀 한 줄. 예) "기대한 장면 → 현실의 배신 → 체념한 한마디"',
    ]
      .filter(Boolean)
      .join('\n') +
    JSON_ONLY +
    '\n{"hook":"","flow":["1컷: ..."],"why":"","reactions":"","formula":""}'
  )
}

export function variantsPrompt(r: Reference, s: CharacterSettings, recent: Episode[], count = 5, channel: 'toon' | 'card' = 'toon') {
  if (channel === 'card') return cardVariantsPrompt(r, s, recent, count)
  const b = r.breakdown
  const mine = recent
    .filter((e) => !e.isSample)
    .slice(0, 12)
    .map((e) => `- ${e.title}`)
    .join('\n')
  return (
    [
      `너는 인스타툰 「${s.seriesName}」의 기획 보조다. 주인공: ${s.characterName}.`,
      s.introduction && `작품 소개: ${s.introduction}`,
      s.voiceRules && `말투·연출: ${s.voiceRules}`,
      s.prohibitions && `금지사항:\n${s.prohibitions}`,
      '아래 레퍼런스에서 "틀"만 빌려, 주제를 바꾼 변주안을 만든다.',
      refFacts(r),
      b && `뜯어본 결과:\n후킹: ${b.hook}\n흐름:\n${b.flow.join('\n')}\n반응 이유: ${b.why}\n틀: ${b.formula}`,
      r.take && `작가가 생각한 뚜구리 버전: ${r.take}`,
      mine && `작가가 최근 다룬 소재 (겹치지 않게, 결은 참고):\n${mine}`,
      '규칙:',
      `- ${count}개. 서로 다른 상황으로. 틀(흐름·반전 위치·후킹 방식)은 유지하고 주제만 바꾼다.`,
      '- 원본의 대사·농담·고유 설정을 그대로 가져오지 않는다.',
      `- ${s.characterName}의 회사생활·일상에서 실제로 있을 법한 상황으로.`,
      '- premise: 상황 한두 문장. 사실처럼 단정하지 말고 "~하는 상황"처럼 쓴다.',
      '- hook: 첫 컷에 넣을 짧은 문구 (20자 안팎).',
      '- question: 작가에게 묻는 질문 하나. 비슷한 일을 실제로 겪었는지, 그때 무슨 말을 들었는지처럼 구체적으로.',
    ]
      .filter(Boolean)
      .join('\n') +
    JSON_ONLY +
    '\n{"variants":[{"title":"","premise":"","hook":"","question":""}]}'
  )
}

/** 카드뉴스 채널: 틀만 빌려 다른 AI 활용·소식 주제로 */
function cardVariantsPrompt(r: Reference, s: CharacterSettings, recent: Episode[], count: number) {
  const b = r.breakdown
  const mine = recent.filter((e) => e.contentType === 'cardnews').slice(0, 12).map((e) => `- ${e.title}`).join('\n')
  return (
    [
      cardSystem(s),
      '아래 카드뉴스 레퍼런스에서 "틀"만 빌려, 주제를 바꾼 카드뉴스 기획안을 만든다.',
      refFacts(r),
      b && `뜯어본 결과:\n후킹: ${b.hook}\n흐름:\n${b.flow.join('\n')}\n반응 이유: ${b.why}\n틀: ${b.formula}`,
      r.take && `작가가 생각한 내 버전: ${r.take}`,
      mine && `최근 만든 카드뉴스 (겹치지 않게):\n${mine}`,
      '규칙:',
      `- ${count}개. 서로 다른 주제로. 틀(장 흐름·후킹 방식·마무리 방식)은 유지하고 주제만 바꾼다.`,
      '- 원본의 문장·예시를 그대로 가져오지 않는다. 특정 캐릭터를 넣지 않는다.',
      '- 직장인이 AI를 실제로 쓰는 상황이나 새 기능·소식 중심으로.',
      '- premise: 이 카드뉴스가 알려 줄 내용 한두 문장. 확인되지 않은 수치·사실을 단정하지 않는다.',
      '- hook: 표지 후킹 제목 (22자 안팎).',
      '- question: 작가에게 묻는 질문 하나. 직접 써 봤는지, 확인한 출처가 있는지처럼 구체적으로.',
    ]
      .filter(Boolean)
      .join('\n') +
    JSON_ONLY +
    '\n{"variants":[{"title":"","premise":"","hook":"","question":""}]}'
  )
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function parseBreakdown(raw: unknown): Omit<RefBreakdown, 'updatedAt'> {
  if (!isObj(raw)) throw new ParseError(['JSON 객체가 아니에요.'])
  const flow = Array.isArray(raw.flow) ? raw.flow.map(s).filter(Boolean) : typeof raw.flow === 'string' ? splitLines(raw.flow) : []
  const out = { hook: s(raw.hook), flow, why: s(raw.why), reactions: s(raw.reactions), formula: s(raw.formula) }
  if (!out.hook && !out.formula && !flow.length) throw new ParseError(['hook·flow·formula 중 하나는 있어야 해요.'])
  return out
}

export function parseVariants(raw: unknown): RefVariant[] {
  const arr = isObj(raw) && Array.isArray(raw.variants) ? raw.variants : Array.isArray(raw) ? raw : null
  if (!arr) throw new ParseError(['variants 배열이 없어요.'])
  const out = arr.filter(isObj).map((v) => ({ id: uid(), title: s(v.title), premise: s(v.premise), hook: s(v.hook), question: s(v.question) }))
  const ok = out.filter((v) => v.premise)
  if (!ok.length) throw new ParseError(['premise가 있는 변주안이 하나도 없어요.'])
  return ok.map((v) => ({ ...v, title: v.title || v.premise.slice(0, 24) }))
}

export const splitLines = (t: string) =>
  t
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)

/** 변주안 → 새 에피소드 원문 메모. 내 경험 답이 있으면 앞에 둔다 (원문은 사실 우선). */
export function variantMemo(v: RefVariant) {
  const a = v.answer?.trim()
  return a ? `${a}\n\n(변주 아이디어: ${v.premise})` : v.premise
}

export function variantNotes(r: Reference, v: RefVariant) {
  return [
    `레퍼런스 @${r.account} 의 틀을 빌린 변주안.`,
    r.breakdown?.formula && `빌린 틀: ${r.breakdown.formula}`,
    v.hook && `첫 컷 문구 후보: ${v.hook}`,
    !v.answer?.trim() && '아직 실제 경험을 적지 않았어요. 있었던 일이 아니라면 각색으로 다뤄 주세요.',
  ]
    .filter(Boolean)
    .join('\n')
}

/* ───────── 검증 기준 ───────── */

export interface ProvenRule {
  likes?: number
  comments?: number
  views?: number
}
export const DEFAULT_PROVEN: ProvenRule = { likes: 3000, comments: 100, views: 100000 }
const KEY = 'ref-proven-rule'

export function loadProvenRule(): ProvenRule {
  try {
    const v = localStorage.getItem(KEY)
    return v ? { ...JSON.parse(v) } : DEFAULT_PROVEN
  } catch {
    return DEFAULT_PROVEN
  }
}
export function saveProvenRule(r: ProvenRule) {
  try {
    localStorage.setItem(KEY, JSON.stringify(r))
  } catch {}
}

/** 기준 중 하나라도 넘으면 검증된 레퍼런스 */
export function isProven(r: Reference, rule: ProvenRule) {
  // 내 계정에서 터진 편은 숫자 기준과 상관없이 검증된 것으로 본다
  if (r.tags.includes('터진 편')) return true
  return (['likes', 'comments', 'views'] as const).some((k) => rule[k] !== undefined && r[k] !== undefined && r[k]! >= rule[k]!)
}

/* ───────── 레퍼런스 : 내 이야기 비율 ───────── */

export function originMix(eps: Episode[], days = 30) {
  const since = Date.now() - days * 864e5
  const recent = eps.filter((e) => !e.isSample && Date.parse(e.createdAt) >= since)
  const fromRef = recent.filter((e) => (e.referenceIds?.length ?? 0) > 0).length
  const reach = recent.filter((e) => e.role === 'reach').length
  const convert = recent.filter((e) => e.role === 'convert').length
  return { total: recent.length, fromRef, own: recent.length - fromRef, reach, convert, noRole: recent.length - reach - convert }
}
