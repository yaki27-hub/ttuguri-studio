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
}

export type Purpose = 'discovery' | 'exploration' | 'relationship'
/** single: 한 컷 밈, four: 4컷 스토리, captions: 2~4장 컷자막형 */
export type Format = 'single' | 'four' | 'captions'
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
