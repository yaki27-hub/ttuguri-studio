/**
 * 캡션 간단 검사 (.claude/skills/ig-caption/caption.py 의 한국어 규칙을 옮김).
 * 결과는 참고용이에요. 막지 않고 알려주기만 한다.
 */

/** 피드에서 ‘… 더 보기’ 전에 보이는 대략의 글자 수 */
export const FEED_CUT = 125
/** 2025년 12월부터 게시물당 해시태그 최대 5개 */
export const HASHTAG_LIMIT = 5

const TAG_RE = /(?:^|\s)#([\p{L}\p{N}_]+)/gu

const ASKS: [RegExp, string][] = [
  [/댓글(?:로|에|을|를)?\s?(?:남겨|달아|알려|적어|써)/, '댓글'],
  [/(?:DM|디엠|메시지)(?:으로|로)?\s?(?:보내|주세요|줘)/i, 'DM'],
  [/저장(?:해|하고|해두)/, '저장'],
  [/공유(?:해|하고)|보내\s?주세요|보내\s?줘|(?:친구|동료)(?:한테|에게)?\s?(?:보내|태그)/, '공유'],
  [/팔로우(?:하고|해)/, '팔로우'],
  [/프로필\s?링크/, '프로필 링크'],
]

export interface CaptionCheck {
  /** 피드에 먼저 보이는 부분 */
  visible: string
  truncated: boolean
  length: number
  tags: string[]
  asks: string[]
  notes: { kind: 'ok' | 'warn'; text: string }[]
}

export function checkCaption(full: string): CaptionCheck {
  const text = full.trim()
  const visible = text.slice(0, FEED_CUT)
  const tags = [...text.matchAll(TAG_RE)].map((m) => m[1])
  const asks = ASKS.filter(([re]) => re.test(text)).map(([, label]) => label)
  const firstLine = text.split('\n')[0] ?? ''
  const notes: CaptionCheck['notes'] = []

  if (!text) return { visible, truncated: false, length: 0, tags, asks, notes: [{ kind: 'warn', text: '캡션이 비어 있어요.' }] }

  if (firstLine.length > FEED_CUT) notes.push({ kind: 'warn', text: `첫 줄이 ${firstLine.length}자라 피드에서 중간에 잘려요. 첫 줄을 짧게 끊어 주세요.` })
  else notes.push({ kind: 'ok', text: `첫 줄 ${firstLine.length}자 — 피드에서 잘리지 않아요.` })

  if (tags.length > HASHTAG_LIMIT) notes.push({ kind: 'warn', text: `해시태그 ${tags.length}개 — 인스타는 5개까지만 반영해요.` })
  else if (tags.length) notes.push({ kind: 'ok', text: `해시태그 ${tags.length}개` })

  if (asks.length === 0) notes.push({ kind: 'warn', text: '댓글·공유 같은 행동 유도가 없어요.' })
  else if (asks.length > 1) notes.push({ kind: 'warn', text: `행동 유도가 ${asks.length}개(${asks.join('·')})예요. 하나만 남기면 더 잘 따라와요.` })
  else notes.push({ kind: 'ok', text: `행동 유도 1개 (${asks[0]})` })

  return { visible, truncated: text.length > FEED_CUT, length: text.length, tags, asks, notes }
}
