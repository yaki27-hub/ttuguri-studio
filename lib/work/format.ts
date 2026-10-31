import type { Format, Purpose, Stage, Status } from './types'

const dtf = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const df = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

export const fmtDateTime = (iso?: string) => (iso ? dtf.format(new Date(iso)) : '')
export const fmtDate = (iso?: string) => (iso ? df.format(new Date(iso)) : '')

/** ISO → <input type="datetime-local"> 값 (서울 시간) */
export function toLocalInput(iso?: string) {
  if (!iso) return ''
  const d = new Date(Date.parse(iso) + 9 * 3600_000)
  return d.toISOString().slice(0, 16)
}
/** <input type="datetime-local"> 값(서울 시간) → ISO */
export function fromLocalInput(v: string) {
  if (!v) return undefined
  return new Date(Date.parse(v + ':00Z') - 9 * 3600_000).toISOString()
}

export const STATUS_LABEL: Record<Status, string> = {
  idea: '소재',
  story: '이야기 정리',
  confirmed_panels: '콘티 확정',
  illustrating: '이미지 제작',
  ready: '게시 준비',
  published: '게시 완료',
  on_hold: '보류',
}
export const STATUS_ORDER: Status[] = ['idea', 'story', 'confirmed_panels', 'illustrating', 'ready', 'published']

export const STAGE_LABEL: Record<Stage, string> = {
  source: '소재',
  story: '이야기',
  panels: '콘티',
  images: '이미지',
  publish: '게시',
}
export const STAGES: Stage[] = ['source', 'story', 'panels', 'images', 'publish']

export const FORMAT_LABEL: Record<Format, string> = { single: '한컷', four: '4컷' }
export const PURPOSE_LABEL: Record<Purpose, string> = {
  discovery: '발견 — 처음 봐도 웃긴가',
  exploration: '탐색 — 다른 편이 궁금한가',
  relationship: '관계 — 뚜구리가 궁금한가',
}

export function splitList(v: string) {
  return v
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function normalizeTag(t: string) {
  return t.replace(/^#/, '').trim()
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const extOf = (mime: string) => (mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg')
