/*
 * 매일 소재 리포트: 조사 기준(고칠 수 있음) + 오늘 날짜·다가오는 시즌·이전 7일 추천·기존 에피소드를 붙여 프롬프트를 만든다.
 * 결과는 JSON 으로 받아 서버(Vercel Blob)에 날짜별로 쌓는다 — lib/dailyReports.js
 */
import { PATTERNS, SEASONS, daysUntil, type Pattern } from './patterns'

export const DEFAULT_BRIEF = `매일 한국어로 '뚜구리툰' 직장인 공감 1~4컷 인스타툰 소재 리포트를 작성해.

[조사 범위]
Instagram 직장인 인스타툰, Threads 직장인 경험담, 한국 직장인 커뮤니티, 밈, 필요시 YouTube Shorts·TikTok에서 만화로 옮길 수 있는 사례를 조사해. 실사 묘생이 고양이 숏폼과 20초 영상 대본 조사는 하지 않아.
로그인이 필요해 수치를 볼 수 없는 곳은 "미확인"으로 적고, 대신 그 계정 최근 게시물 대비 반응 배수(평소 대비 몇 배인지)를 확인 가능한 범위에서 적어.
트렌드가 없는 날은 없다고 솔직히 쓰고, 변화가 없어도 반드시 보고해.

[뚜구리툰 기준]
- 캐릭터: 여러 회사를 거치는 프리랜서 디자이너 두더지 뚜구리. 승인된 외형은 바꾸지 말고 주변 인물은 익명 실루엣으로 표현해.
- 핵심 모순: 쉬고 싶지만 무언가 하고 싶다.
- 고정 성격·말버릇·세계관을 새로 만들지 마.
- 카테고리를 고르게 섞어: 회사생활(출퇴근, 사무실, 사내 인간관계, 물건, 제도), 개인 프로젝트, 휴식과 일상.
- 10개 중 최소 3개는 '프리랜서·디자이너라서 겪는 일'로 채워(다른 직장인 캐릭터가 그려도 똑같은 소재만으로 채우지 말 것).

[지금까지 성과에서 나온 공식 — 가설로 활용]
- 조회가 높았던 편은 모두 릴스였고, 기대가 한 문장 안에서 꺾이는 제목이었어(예: "빨리 끝내면 쉴 수 있을 줄 알았던 사람", "연차는 있는데 쓸 수 있는 날이 없습니다").
- 시즌 소재(첫 추위, 연차 소진)가 잘 됐어. 다가오는 2~3주 안의 시즌 소재를 최소 2개 포함해.
- 공유는 남을 부르거나 태그하기 좋은 형식에서만 나왔어(MBTI 호출, 공지문 패러디). 공유를 노린 형식을 최소 1개 포함해.
- 아는 사람만 이해하는 제목(상황만 던지는 한두 단어 제목)은 피해.

[중복 확인]
이전 7일 추천 소재와 기존 에피소드(노션 에피소드 DB, @ttuguri 게시물)를 비교해. 소품이나 대사만 바꾼 같은 농담은 제외하고, 새롭게 발견한 구체적 일상 사건을 우선해.

[출력]
1. 오늘의 관찰: 조사한 사례마다 링크, 게시일, 조회·좋아요·댓글·저장·공유, 출처와 관측 시각을 적어. 미확인 수치는 "미확인"으로 표시하고, 검증된 사례와 창작 아이디어를 분명히 구분해.
2. 신규 소재 10개: 각각 한 줄 공감 포인트, 시각적 웃음, 첫 화면 제목 후보, 한컷/4컷 추천, 공식 태그(기대→반전 / 시즌 / 공유형 / 실화 질문형 등), 제작 우선순위.
3. 오늘의 질문 1개: 앵스 님이 직접 겪은 일을 떠올리게 하는 짧은 질문(예: "이번 주 회사에서 들은 말 중 제일 어이없던 한마디는?"). 실화 소재는 앵스 님 답변으로만 채우고 임의로 지어내지 마.
4. 콘티: 가장 좋은 1~2개를 실제 제작 가능한 짧은 콘티(장면·행동·대사·배경·소품·마지막 반전)로 완성해. 억지 4컷 금지, 설명과 대사는 최소화하고 대사를 가려도 표정과 행동으로 웃긴지 확인해.`

export interface Observation {
  title: string
  url: string
  source: string
  postedAt: string
  views: string
  likes: string
  comments: string
  saves: string
  shares: string
  /** 평소 대비 반응 배수 */
  multiple: string
  observedAt: string
  /** 조사 쪽에서 링크가 실제 검색 결과와 맞는지 확인했는가 (AI 조사일 때만 채움) */
  linkOk?: boolean
}

export interface Idea {
  title: string
  point: string
  visual: string
  cuts: string
  category: string
  freelance: boolean
  tags: string[]
  priority: number
}

export interface ContiPanel {
  scene: string
  action: string
  line: string
  background: string
  props: string
}

export interface Conti {
  idea: string
  panels: ContiPanel[]
  twist: string
  silentCheck: string
}

export interface DailyReport {
  observations: Observation[]
  noTrend: string
  ideas: Idea[]
  question: string
  conti: Conti[]
}

export interface SavedReport {
  date: string
  savedAt: string
  via: 'ai' | 'paste' | 'auto'
  report: DailyReport
  answer?: string
}

const s = (v: unknown, max = 400) => (v == null ? '' : String(v)).trim().slice(0, max)

export function parseDailyReport(raw: unknown): DailyReport {
  const o = raw as Record<string, unknown>
  if (!o || typeof o !== 'object') throw new Error('JSON 객체가 필요해요.')
  if (!Array.isArray(o.ideas) || !o.ideas.length) throw new Error('ideas(신규 소재) 배열이 비어 있어요.')
  const arr = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[]
  const num = (v: unknown) => (v == null || v === '' ? '미확인' : s(v, 40))
  return {
    observations: arr(o.observations).slice(0, 20).map((x) => ({
      title: s(x.title, 200),
      url: /^https?:\/\//.test(s(x.url, 600)) ? s(x.url, 600) : '',
      source: s(x.source, 80),
      postedAt: s(x.postedAt, 40),
      views: num(x.views),
      likes: num(x.likes),
      comments: num(x.comments),
      saves: num(x.saves),
      shares: num(x.shares),
      multiple: s(x.multiple, 40) || '미확인',
      observedAt: s(x.observedAt, 40),
      linkOk: typeof x.linkOk === 'boolean' ? x.linkOk : undefined,
    })),
    noTrend: s(o.noTrend, 400),
    ideas: arr(o.ideas).slice(0, 12).map((x, i) => ({
      title: s(x.title, 120),
      point: s(x.point, 300),
      visual: s(x.visual, 300),
      cuts: /한|1|single/i.test(s(x.cuts)) ? '한컷' : '4컷',
      category: s(x.category, 30),
      freelance: x.freelance === true,
      tags: (Array.isArray(x.tags) ? x.tags : []).map((t) => s(t, 20)).filter(Boolean).slice(0, 5),
      priority: Number(x.priority) || i + 1,
    })).filter((x) => x.title),
    question: s(o.question, 200),
    conti: arr(o.conti).slice(0, 2).map((c) => ({
      idea: s(c.idea, 120),
      panels: arr(c.panels).slice(0, 6).map((p) => ({ scene: s(p.scene), action: s(p.action), line: s(p.line, 200), background: s(p.background, 200), props: s(p.props, 200) })),
      twist: s(c.twist, 300),
      silentCheck: s(c.silentCheck, 300),
    })),
  }
}

/** 공식 태그 → 앱의 제목 패턴 */
export function patternsFromTags(tags: string[]): Pattern[] {
  const out = new Set<Pattern>()
  for (const t of tags) {
    if (/반전/.test(t)) out.add('기대→반전')
    if (/시즌/.test(t)) out.add('시즌')
    if (/MBTI/i.test(t)) out.add('MBTI 호출')
    if (/공지/.test(t)) out.add('공지 패러디')
    if (/질문/.test(t)) out.add('질문형')
  }
  return PATTERNS.filter((p) => out.has(p))
}

export const isShareIdea = (i: Idea) => i.tags.some((t) => /공유|MBTI|공지|태그/i.test(t))

export function buildDailyPrompt(o: { brief: string; today?: Date; recentIdeas: string[]; episodes: string[] }) {
  const today = o.today ?? new Date()
  const date = today.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const seasons = SEASONS.map((x) => ({ ...x, dday: daysUntil(x, today) })).filter((x) => x.dday <= 21).sort((a, b) => a.dday - b.dday)
  return `${o.brief.trim()}

[오늘 날짜] ${date} (한국 시간)

[다가오는 2~3주 안의 시즌 — 최소 2개는 이 중에서]
${seasons.map((x) => `- ${x.label} (${x.dday === 0 ? '진행 중' : `D-${x.dday}`}, ${x.start}~${x.end})`).join('\n') || '- (21일 안에 정해 둔 시즌 없음: 날씨·연말 같은 시기 소재를 직접 찾아)'}

[이전 7일 추천 소재 — 겹치지 말 것]
${o.recentIdeas.slice(0, 70).map((t) => `- ${t}`).join('\n') || '- (기록 없음)'}

[기존 에피소드 제목 — 같은 농담 반복 금지]
${o.episodes.slice(0, 80).map((t) => `- ${t}`).join('\n') || '- (없음)'}

[출력 형식]
설명 문장이나 마크다운 없이 아래 모양의 JSON 하나만 출력해.
- observations: 실제로 확인한 사례만. 링크를 지어내지 말고, 수치를 못 보면 "미확인". multiple은 평소 대비 반응 배수(예: "약 3배", 모르면 "미확인").
- noTrend: 눈에 띄는 새 트렌드가 없으면 그렇다고 한두 문장(있으면 빈 문자열).
- ideas: 10개, 창작 아이디어. title은 첫 화면 제목 후보(캐릭터 이름 없이). cuts는 "한컷" 또는 "4컷". category는 회사생활|개인 프로젝트|휴식·일상. freelance는 프리랜서·디자이너라서 겪는 일이면 true. tags는 기대→반전 / 시즌 / 공유형 / MBTI 호출 / 공지 패러디 / 실화 질문형 중에서. priority는 1이 가장 먼저.
- question: 오늘의 질문 1개.
- conti: 가장 좋은 1~2개. idea는 ideas의 title 그대로. silentCheck는 대사를 가려도 웃긴 이유 한 줄.
{"observations":[{"title":"","url":"","source":"","postedAt":"","views":"미확인","likes":"","comments":"","saves":"미확인","shares":"미확인","multiple":"","observedAt":""}],"noTrend":"","ideas":[{"title":"","point":"","visual":"","cuts":"4컷","category":"회사생활","freelance":false,"tags":["기대→반전"],"priority":1}],"question":"","conti":[{"idea":"","panels":[{"scene":"","action":"","line":"","background":"","props":""}],"twist":"","silentCheck":""}]}`
}

/* ───────── 예전 브라우저 저장분 (서버로 옮길 때만 읽는다) ───────── */

const KEY = 'ddg.dailyReports'

export function listSavedReports(): SavedReport[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function recentIdeaTitles(list: SavedReport[], today: string, days = 7) {
  const from = new Date(new Date(today).getTime() - days * 864e5).toISOString().slice(0, 10)
  return list.filter((r) => r.date >= from && r.date < today).flatMap((r) => r.report.ideas.map((i) => `${r.date} ${i.title}`))
}

export const todayKST = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
