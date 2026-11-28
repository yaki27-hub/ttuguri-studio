/*
 * 후킹·제목 패턴 태그, 유입용/전환용, 시즌 캘린더.
 * 성과 화면의 '패턴별 성과표'와 작업 화면에서 같이 쓴다.
 */

export const PATTERNS = ['기대→반전', '공지 패러디', 'MBTI 호출', '질문형', '시즌'] as const
export type Pattern = (typeof PATTERNS)[number]

export type Role = 'reach' | 'convert'
export const ROLE_LABEL: Record<Role, string> = { reach: '유입용', convert: '전환용' }
export const ROLE_HINT: Record<Role, string> = {
  reach: '처음 보는 사람이 멈추고 공유하게 — 공감·밈',
  convert: '이미 본 사람이 팔로우하게 — 캐릭터·연재·정보',
}

/* ───────── 시즌 캘린더 ───────── */

export interface Season {
  id: string
  label: string
  /** 월-일 (MM-DD). end < start 면 해를 넘김 */
  start: string
  end: string
  /** 지난 게시물 캡션에서 찾을 말 */
  words: string[]
  idea: string
}

export const SEASONS: Season[] = [
  { id: 'newyear', label: '새해 다짐', start: '12-26', end: '01-10', words: ['새해', '다짐', '신년', '올해는'], idea: '새해 계획 vs 3일 뒤 현실' },
  { id: 'tax', label: '연말정산', start: '01-10', end: '02-28', words: ['연말정산', '13월', '환급', '토해'], idea: '13월의 월급인 줄 알았는데 토해냄' },
  { id: 'bonus', label: '성과급', start: '01-15', end: '03-10', words: ['성과급', '보너스', '인센'], idea: '성과급 발표 날 회사 공기' },
  { id: 'seol', label: '설 연휴', start: '01-20', end: '02-20', words: ['설날', '명절', '연휴', '세뱃돈', '잔소리'], idea: '명절 잔소리 방어 매뉴얼' },
  { id: 'newbie', label: '신입·이동 시즌', start: '02-20', end: '03-31', words: ['신입', '입사', '첫 출근', '인사이동', '조직개편'], idea: '신입 때 나 vs 지금 나' },
  { id: 'spring', label: '벚꽃·봄 피곤', start: '03-25', end: '04-20', words: ['벚꽃', '봄', '춘곤증', '꽃가루'], idea: '창밖은 벚꽃, 나는 모니터' },
  { id: 'may', label: '5월 연휴·가정의 달', start: '04-25', end: '05-20', words: ['어린이날', '어버이날', '연휴', '징검다리'], idea: '징검다리 연휴 연차 눈치 게임' },
  { id: 'rain', label: '장마', start: '06-20', end: '07-25', words: ['장마', '비 오는', '우산', '습도'], idea: '출근길 비 vs 퇴근길 해' },
  { id: 'vacation', label: '여름휴가', start: '07-10', end: '08-25', words: ['휴가', '여름', '바캉스', '에어컨'], idea: '휴가 전날 업무 몰아치기' },
  { id: 'chuseok', label: '추석', start: '09-01', end: '10-10', words: ['추석', '명절', '송편', '귀성'], idea: '연휴 마지막 날 일요병 x3' },
  { id: 'cold', label: '첫 추위', start: '10-25', end: '11-25', words: ['추위', '패딩', '난방', '건조', '히터'], idea: '사무실 온도 전쟁 (더워파 vs 추워파)' },
  { id: 'review', label: '인사평가', start: '11-01', end: '12-20', words: ['평가', '고과', '면담', '자기평가'], idea: '자기평가에 쓸 말이 없음' },
  { id: 'leave', label: '연차 소진', start: '11-15', end: '12-31', words: ['연차', '휴가 소진', '남은 연차'], idea: '남은 연차 7개, 남은 업무 70개' },
  { id: 'yearend', label: '송년회', start: '12-01', end: '12-31', words: ['송년회', '회식', '연말', '종무식', '크리스마스'], idea: '송년회 장기자랑 공포' },
]

const md = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 오늘 기준: 진행 중이면 0, 다가오면 남은 날 수 (없으면 null) */
export function daysUntil(s: Season, today = new Date()): number {
  const t = md(today)
  const inRange = s.start <= s.end ? t >= s.start && t <= s.end : t >= s.start || t <= s.end
  if (inRange) return 0
  const [m, d] = s.start.split('-').map(Number)
  let next = new Date(today.getFullYear(), m - 1, d)
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d)
  return Math.ceil((next.getTime() - today.getTime()) / 864e5)
}

/** 진행 중 + 앞으로 days일 안에 시작하는 시즌 (가까운 순) */
export function upcomingSeasons(days = 45, today = new Date()) {
  return SEASONS.map((s) => ({ ...s, dday: daysUntil(s, today) }))
    .filter((s) => s.dday <= days)
    .sort((a, b) => a.dday - b.dday)
}

/* ───────── 패턴 자동 추정 ───────── */

/** 제목만으로 '시즌' 태그를 달 때 쓰는 확실한 말 (신입·봄·휴가처럼 늘 쓰는 말은 뺀다) */
const SEASON_WORDS = ['연말정산', '13월', '성과급', '설날', '추석', '명절', '벚꽃', '장마', '여름휴가', '첫 추위', '패딩', '연차 소진', '남은 연차', '송년회', '종무식', '크리스마스', '새해', '신년', '인사평가', '고과', '자기평가']

/** 제목·첫 문구로 짐작한 패턴 (직접 단 태그가 없을 때만 쓴다) */
export function guessPatterns(text: string): Pattern[] {
  const t = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' ')
  const out: Pattern[] = []
  if (/줄 알았|인 줄|했는데|랬는데|했더니|기대|현실|vs|반전|(는데|더니)(\s|$)/.test(t)) out.push('기대→반전')
  if (/공지|안내|알림|필독|긴급|\[.+\]/.test(t)) out.push('공지 패러디')
  if (/MBTI|\b[EI][NS][TF][JP]\b|[TF]들|극[IETFNSJP]/i.test(t)) out.push('MBTI 호출')
  if (/\?|나요|까요|있어요\?|인가요/.test(t)) out.push('질문형')
  if (SEASON_WORDS.some((w) => t.includes(w))) out.push('시즌')
  return out
}

/* ───────── 터진 편 ───────── */

export function median(nums: number[]) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y)
  if (!a.length) return null
  const m = Math.floor(a.length / 2)
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

/** 같은 유형(릴스/피드) 중간값의 3배 이상이면 터진 편. 비교할 게시물이 5개 미만이면 판단하지 않는다. */
export const HIT_MULTIPLE = 3
export const HIT_MIN_POSTS = 5
