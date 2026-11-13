import type { Category, Format, Output, Purpose, Stage, Status } from './types'

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
  quick: '빠른 시안',
  source: '소재',
  story: '이야기',
  panels: '콘티',
  images: '이미지',
  publish: '게시',
}
export const STAGES: Stage[] = ['quick', 'source', 'story', 'panels', 'images', 'publish']

export const OUTPUT_LABEL: Record<Output, string> = { carousel: '캐러셀', reels: '릴스' }

export const CATEGORY: Record<Category, { label: string; format?: Format; result: string }> = {
  gag: { label: '한 컷 개그', format: 'single', result: '한 장면 + 짧은 대사' },
  real4: { label: '4컷 실화툰', format: 'four', result: '4컷 콘티' },
  mood: { label: '컷자막형 공감툰', format: 'captions', result: '2~4장, 장마다 자막 한 줄' },
  series: { label: '연재 사연툰', format: 'four', result: '여러 편 시리즈 (이번 편은 4컷)' },
  hold: { label: '보류', result: '질문에 답하고 다시 분류' },
}
export const CATEGORIES = Object.keys(CATEGORY) as Category[]
export const outputsOf = (o?: Output[]): Output[] => (o?.length ? o : ['carousel'])

export const FORMAT_LABEL: Record<Format, string> = { single: '한컷', four: '4컷', captions: '컷자막형' }
export const FORMATS: Format[] = ['single', 'four', 'captions']

/** 형식별 컷(장) 수 범위 */
export function countRange(f: Format): [number, number] {
  return f === 'single' ? [1, 1] : f === 'four' ? [4, 4] : [2, 4]
}

/** 형식을 바꿀 때 남길 컷 수 */
export function fitCount(f: Format, cur: number) {
  const [a, b] = countRange(f)
  if (f === 'captions' && cur < a) return 3
  return Math.min(b, Math.max(a, cur))
}

/** 걸린 시간 표시: 1분 미만 / 12분 / 2시간 5분 / 3일 */
export function fmtDuration(ms: number) {
  const m = Math.round(ms / 60000)
  if (m < 1) return '1분 미만'
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}시간${m % 60 ? ` ${m % 60}분` : ''}`
  return `${Math.round(h / 24)}일`
}
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
