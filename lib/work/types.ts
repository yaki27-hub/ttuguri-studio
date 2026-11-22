export type ISO = string

export interface Base {
  id: string
  createdAt: ISO
  updatedAt: ISO
}

export type FactStatus = 'confirmed' | 'proposed' | 'unknown'
export interface Fact {
  id: string
  text: string
  status: FactStatus
  /** 근거가 된 기사 원문 문장 (카드뉴스 기사 정리) */
  quote?: string
}

/** 카드뉴스 메모 단계에서 읽어 온 기사 본문 */
export interface Article {
  id: string
  url: string
  title: string
  site: string
  published?: string
  text: string
  /** fetch = 링크에서 가져옴, paste = 붙여넣음, instagram = 해외 인스타 게시물 번역 */
  from: 'fetch' | 'paste' | 'instagram'
  addedAt: string
}

export type Purpose = 'discovery' | 'exploration' | 'relationship'
/** single: 한 컷 밈, four: 4컷 스토리, captions: 2~4장 컷자막형 */
export type Format = 'single' | 'four' | 'captions' | 'info'
/** instatoon: 인스타툰, cardnews: 카드뉴스 */
export type ContentType = 'instatoon' | 'cardnews'
export type Stage = 'source' | 'story' | 'panels' | 'images' | 'publish'
export type Status =
  | 'idea'
  | 'story'
  | 'confirmed_panels'
  | 'illustrating'
  | 'ready'
  | 'published'
  | 'on_hold'

export interface RefLink {
  id: string
  url: string
  note: string
}

export interface Episode extends Base {
  title: string
  titleIsAuto: boolean
  originalMemo: string
  notes: string
  situation: string
  facts: Fact[]
  emotions: string[]
  humorPoint: string
  unknowns: string[]
  tags: string[]
  purpose?: Purpose
  format: Format
  stage: Stage
  status: Status
  previousStatus?: Status
  storyRevision: number
  /** 컷 묶음이 바뀔 때마다 증가 */
  panelsRevision: number
  /** 현재 콘티를 만들 때 기준이 된 이야기 revision */
  panelsBaseStoryRevision?: number
  confirmedPanelRevision?: number
  needsReview: boolean
  reviewReason?: string
  scheduledAt?: ISO
  publishedAt?: ISO
  revision: number
  links: RefLink[]
  sourceAssetIds: string[]
  /** 콘티에서 빠진 컷의 이미지 (자동 삭제하지 않고 보관) */
  looseAssetIds: string[]
  isSample?: boolean
  /** 노션 🎬 에피소드 DB 페이지와 연결 */
  notionPageId?: string
  /** 이번 편 이미지 제작 메모. 없으면 설정의 기본값을 쓴다 */
  imageMemo?: ImageMemo
  /** 첫 화면 문구 (한 컷 밈이면 그림 안 자막) */
  hookText?: string
  /** 없으면 인스타툰 */
  contentType?: ContentType
  /** 레퍼런스 보드에서 연결한 레퍼런스 */
  referenceIds?: string[]
  /** 카드뉴스 목표 장 수 (3~10, 기본 5) */
  cardCount?: number
  /** 카드뉴스 글 구성: story = 읽는 이슈형(기본), brief = 짧은 정리형 */
  cardStyle?: 'story' | 'brief'
  /** 후킹 라이브러리 번호 (H01~H26). 성과 비교용 */
  hookId?: string
  /** 카드뉴스: 읽어 온 기사 본문 */
  articles?: Article[]
  /** 카드뉴스: 기사 한 줄 요약 (번역·정리 결과) */
  articleSummary?: string
}

export type Ratio = '4:5' | '1:1'

export interface ImageMemo {
  ratio: Ratio
  composition: string
  placement: string
  characterLook: string
  extras: string
  background: string
  direction: string
  text: string
}

export type CastPosition = 'left' | 'center' | 'right' | ''

/** 컷 안의 인물 한 명: 위치·차림·행동·소품과 대사 */
export interface CastItem {
  id: string
  position: CastPosition
  name: string
  action: string
  dialogue: string
  /** “이 대사 그대로” — 초안을 다시 받아도 바뀌지 않는다 */
  fixed?: boolean
}

export interface StoryVersion extends Base {
  episodeId: string
  summary: string
  opening: string
  development: string
  humor: string
  ending: string
  format: Format
  reason: string
  baseRevision: number
  settingRevision: number
  source: 'manual' | 'import' | 'provider'
  appliedAt?: ISO
}

export interface Panel extends Base {
  episodeId: string
  order: number
  scene: string
  action: string
  /** 인물별 위치·행동·대사 */
  cast: CastItem[]
  /** 핵심 연출 (대비·거리감 등) */
  direction: string
  /** 인물에 속하지 않는 대사·효과음 (예전 콘티의 대사도 여기에 남아 있다) */
  dialogue: string
  narration: string
  productionNotes: string
  adaptationNotes: string
  locked: boolean
  revision: number
  assetId?: string
  assetIsFinal: boolean
}

export type PanelSnapshot = Pick<
  Panel,
  'scene' | 'action' | 'cast' | 'direction' | 'dialogue' | 'narration' | 'productionNotes' | 'adaptationNotes'
>

export interface PanelVersion extends Base {
  panelId: string
  episodeId: string
  snapshot: PanelSnapshot
  operation: string
  revision: number
}

export interface Slide extends Base {
  episodeId: string
  order: number
  kind: 'cover' | 'content'
  panelIds: string[]
  assetId?: string
  altText: string
  isFinalImage: boolean
}

export interface Asset extends Base {
  blob: Blob
  fileName: string
  mimeType: string
  byteSize: number
  width: number
  height: number
  purpose: 'reference' | 'panel' | 'slide' | 'source'
}

export interface Publication extends Base {
  episodeId: string
  coverText: string
  caption: string
  question?: string
  includeQuestion: boolean
  hashtags: string[]
  includeHashtags: boolean
  scheduledAt?: ISO
  publishedAt?: ISO
  url?: string
  manuallyConfirmed: boolean
  sourceRevision: number
  orderConfirmed: boolean
  checkDialogue: boolean
  checkNames: boolean
  history: { publishedAt?: ISO; url?: string; revokedAt: ISO }[]
}

export interface CharacterSettings extends Base {
  revision: number
  characterName: string
  seriesName: string
  introduction: string
  voiceRules: string
  prohibitions: string
  styleNotes: string
  /** 새 에피소드의 이미지 제작 메모 기본값 */
  imageDefaults: ImageMemo
  referenceAssetIds: string[]
  recurringExpressions: string[]
  /** 소재 찾기: 내 주제와 키워드 */
  topics?: Topic[]
  /** 소재 찾기: 새 게시물을 지켜볼 계정 (@ 없이) */
  watchlist?: string[]
  /** 카드뉴스 전용 설정 (뚜구리 캐릭터·그림체를 쓰지 않는다) */
  cardnews?: CardNewsSettings
}

export interface CardNewsSettings {
  /** 카드뉴스 계정 소개·말투 (장 구성·게시 문구 지시문) */
  intro: string
  /** 이미지 그림체·톤 */
  imageStyle: string
  /** 이미지 추가 규칙·금지 */
  imageRules: string
  /** 그림체 참고 이미지 (캐릭터가 아니라 색감·스타일 참고) */
  styleRefIds: string[]
  /** 소재 찾기 토픽·워치리스트 (카드뉴스 채널용) */
  topics?: Topic[]
  watchlist?: string[]
  /** 디자인 템플릿 (없으면 seodang) — 피그마 프레임 배치와 이미지 여백이 달라진다 */
  design?: CardDesign
  /** 머리말·꼬리말에 들어갈 계정 정보 */
  brand?: Partial<CardBrand>
}

export type CardDesign = 'seodang' | 'plain'
export interface CardBrand {
  /** 계정 이름. 첫 단어가 강조색 (예: AI 서당) */
  name: string
  /** @계정 */
  handle: string
  /** 표지 알약에 들어갈 연재 이름 (예: 오늘의 방(榜)) */
  series: string
}

export interface Topic {
  id: string
  name: string
  keywords: string[]
}

export type DraftTarget = 'source' | 'story' | 'panels' | 'publish'
export interface GenerationDraft extends Base {
  episodeId: string
  targetType: DraftTarget
  targetIds: string[]
  operation: string
  baseRevision: number
  settingRevision: number
  inputSnapshot: string
  output: unknown
  status: 'pending' | 'applied' | 'discarded' | 'conflict'
}

export interface Activity extends Base {
  episodeId: string
  operation: string
  timestamp: ISO
  previousSnapshot?: unknown
  resultingRevision?: number
}

export const METRIC_KEYS = ['reach', 'views', 'shares', 'saves', 'profileVisits', 'follows', 'likes', 'comments'] as const
export type MetricKey = (typeof METRIC_KEYS)[number]

export interface Metric extends Base {
  episodeId: string
  observedAt: ISO
  hoursSincePost?: number
  values: Partial<Record<MetricKey, number>>
  source: string
  note: string
}

export const REF_FORMATS = ['one', 'three', 'four', 'carousel', 'other'] as const
export type RefFormat = (typeof REF_FORMATS)[number]
export const REF_POST_TYPES = ['feed', 'reel', 'carousel'] as const
export type RefPostType = (typeof REF_POST_TYPES)[number]
export type RefPlatform = 'instagram' | 'youtube' | 'etc'

/** 레퍼런스 보드: 참고할 다른 계정 게시물 */
export interface Reference extends Base {
  /** 쿼리·# 를 뗀 링크 (중복 확인 기준) */
  url: string
  platform: RefPlatform
  account: string
  postType?: RefPostType
  format?: RefFormat
  tags: string[]
  likes?: number
  comments?: number
  views?: number
  metricsAt?: ISO
  /** 직접 확인 / 추정치 등 */
  metricsSource: string
  /** 이 소재를 뚜구리 개그로 바꾼 한 줄 */
  take: string
  note: string
  caption: string
  /** 뜯어보기: 왜 잘됐는지 분해한 기록 */
  breakdown?: RefBreakdown
  /** 구조만 빌려 뚜구리 소재로 바꾼 변주안 */
  variants?: RefVariant[]
  /** 어느 채널의 레퍼런스인지 (없으면 뚜구리툰) */
  channel?: 'toon' | 'card'
}

export interface RefBreakdown {
  /** 첫 컷·첫 문구에서 손을 멈추게 한 것 */
  hook: string
  /** 컷(장)별 흐름, 한 줄에 한 컷 */
  flow: string[]
  /** 사람들이 반응한 이유 (공감·저장·공유 포인트) */
  why: string
  /** 댓글에서 보인 반응 */
  reactions: string
  /** 주제를 빼고 남긴 틀. 변주는 이것을 빌린다 */
  formula: string
  updatedAt: ISO
}

export interface RefVariant {
  id: string
  title: string
  /** 뚜구리 버전 상황 한두 문장 */
  premise: string
  /** 첫 컷 문구 */
  hook: string
  /** 작가에게 묻는 실제 경험 질문 */
  question: string
  /** 작가의 답 (내 이야기) */
  answer?: string
  episodeId?: string
}
