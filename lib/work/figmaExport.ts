/*
 * 피그마용 내보내기 (뚜구리 가져오기 플러그인이 읽는 파일)
 *
 * 한 편 = 프레임 여러 개. 프레임마다 배경 이미지 1장 + 고칠 수 있는 글자 레이어.
 * 파일 형식은 public/figma-plugin/code.js 와 맞춰야 한다 (version 을 올리면 둘 다 고칠 것).
 */
import { CARD_FIELD_LABEL, cardName, cardRole } from './cards'
import { getAsset } from './repo'
import { brandOf, coverOnlyImage, designOf } from './cardDesign'
import type { CardBrand, CardDesign, CardNewsSettings } from './types'
import type { Episode, ImageMemo, Panel } from './types'
import type { FigmaStyle } from './artGuide'

export const FIGMA_EXPORT_VERSION = 2
/**
 * 피그마 플러그인 버전. 플러그인을 고치면 1 올리고 public/figma-plugin 의 세 곳도 같이 고칠 것:
 * code.js PLUGIN_VERSION · ui.html 제목 · manifest.json name
 */
export const FIGMA_PLUGIN_VERSION = 6
/** 인스타툰(피드·릴스)은 워터마크·글꼴 규칙이 들어간 v6 부터 읽는다. 카드뉴스는 v4 로도 된다 */
const TOON_PLUGIN = 6

/** 릴스 9:16 (그림 설정 3번): 위는 제목, 아래는 배경색 연장, 아래 20%·오른쪽 끝은 인스타 UI 자리 */
export const REELS = { width: 1080, height: 1920, imageTop: 280, uiBottom: 0.2, uiRight: 170, grid34: { top: 240, height: 1440 } } as const
/** 릴스 커버 프레임의 장 id (피그마에서 돌아오면 '연결 안 된 이미지'로 보관) */
export const REELS_COVER_ID = 'reels-cover'

/**
 * field: 피그마에서 고친 글자를 다시 앱에 넣을 자리
 *   scene | narration | direction  (카드뉴스 제목·본문·강조, 인스타툰 자막·내레이션은 narration)
 *   hook                            (첫 화면 문구)
 *   cast:<castId>                   (인물 대사, "이름: \"대사\"" 형태)
 *   dialogue                        (인물에 속하지 않는 대사·효과음)
 */
export type TextField = 'scene' | 'narration' | 'direction' | 'hook' | 'dialogue' | 'action' | `cast:${string}`

export type TextRole = 'headline' | 'body' | 'highlight' | 'tag' | 'source' | 'hook' | 'dialogue' | 'narration' | 'reelsTitle'

export interface FigmaText {
  role: TextRole
  name: string
  text: string
  field: TextField
}

export interface FigmaFrame {
  name: string
  panelId: string
  /** 카드뉴스 역할 (cover | content | outro), 인스타툰은 cut, 릴스 커버는 reelsCover */
  kind: 'cover' | 'content' | 'outro' | 'cut' | 'reelsCover'
  image?: { mime: string; base64: string; width: number; height: number }
  /** 릴스: 그림 위·아래 끝 색 (여백을 같은 색으로 이어 칠한다) */
  edge?: { top: string; bottom: string }
  texts: FigmaText[]
}

export interface FigmaExport {
  app: 'ttuguri-studio'
  version: number
  episodeId: string
  title: string
  contentType: 'cardnews' | 'instatoon'
  width: number
  height: number
  exportedAt: string
  /** 이 파일을 읽으려면 필요한 플러그인 버전 */
  plugin?: number
  /** feed = 4:5·1:1 그대로, reels = 9:16 릴스 레이아웃 (인스타툰만) */
  layout?: 'feed' | 'reels'
  /** 릴스: 9:16 안에 넣는 그림 칸 높이 (4:5면 1350) */
  cutHeight?: number
  /** 인스타툰 마감 규칙 (그림 설정 6번: 워터마크·컷 번호·제목 글꼴·대사 말풍선) */
  style?: FigmaStyle
  /** 시리즈 배지 (오른쪽 위) */
  badge?: string
  /** 카드뉴스 디자인 템플릿 (플러그인이 배치를 고른다) */
  design?: CardDesign
  brand?: CardBrand
  frames: FigmaFrame[]
}

async function toBase64(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

/** 그림 맨 위·맨 아래 몇 줄의 평균 색 (릴스 여백을 이어 칠할 색) */
async function edgeColors(blob: Blob): Promise<{ top: string; bottom: string } | undefined> {
  try {
    const bmp = await createImageBitmap(blob)
    const w = 64
    const h = Math.max(8, Math.round((bmp.height / bmp.width) * w))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(bmp, 0, 0, w, h)
    const avg = (y: number) => {
      const d = g.getImageData(0, y, w, 2).data
      let r = 0, gg = 0, b = 0
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2] }
      const n = d.length / 4
      return '#' + [r, gg, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('')
    }
    return { top: avg(0), bottom: avg(h - 2) }
  } catch {
    return undefined
  }
}

export async function buildFigmaExport(
  ep: Episode,
  panels: Panel[],
  memo: ImageMemo,
  cardnews?: Partial<CardNewsSettings>,
  opts: { layout?: 'feed' | 'reels'; style?: FigmaStyle } = {},
): Promise<FigmaExport> {
  const card = ep.contentType === 'cardnews'
  const reels = !card && opts.layout === 'reels'
  const width = 1080
  const cutHeight = memo.ratio === '1:1' ? 1080 : 1350
  const height = reels ? REELS.height : cutHeight
  const frames: FigmaFrame[] = []
  const reelsTitle = ep.hookText?.trim() || ep.title.trim()

  const edges = new Map<string, { top: string; bottom: string } | undefined>()
  for (const [i, p] of panels.entries()) {
    let image: FigmaFrame['image']
    // '어쩌다 발견'은 표지에만 그림을 쓴다 — 본문 장 그림은 보내지 않는다
    if (p.assetId && !(card && i > 0 && coverOnlyImage(cardnews ?? {}))) {
      const a = await getAsset(p.assetId)
      if (a) image = { mime: a.mimeType, base64: await toBase64(a.blob), width: a.width, height: a.height }
      if (a && reels) edges.set(p.id, await edgeColors(a.blob))
    }
    const texts: FigmaText[] = []
    if (card) {
      const role = cardRole(i, panels.length)
      const F = CARD_FIELD_LABEL[role]
      if (p.scene.trim()) texts.push({ role: 'headline', name: F.headline, text: p.scene.trim(), field: 'scene' })
      if (p.narration.trim()) texts.push({ role: 'body', name: F.body, text: p.narration.trim(), field: 'narration' })
      if (p.direction.trim()) texts.push({ role: 'highlight', name: '강조', text: p.direction.trim(), field: 'direction' })
      if (p.dialogue.trim()) texts.push({ role: 'tag', name: '태그', text: p.dialogue.trim(), field: 'dialogue' })
      if (p.action.trim()) texts.push({ role: 'source', name: '출처', text: p.action.trim(), field: 'action' })
      frames.push({ name: cardName(i, panels.length), panelId: p.id, kind: role, image, texts })
    } else {
      // 릴스: 모든 컷 위쪽에 제목을 크게 (첫 컷 것만 사이트로 돌아가 첫 화면 문구가 된다)
      if (reels && reelsTitle) texts.push({ role: 'reelsTitle', name: '릴스 제목', text: reelsTitle, field: i === 0 && ep.hookText?.trim() ? 'hook' : ('' as TextField) })
      else if (i === 0 && ep.hookText?.trim() && ep.format !== 'single') texts.push({ role: 'hook', name: '첫 화면 문구', text: ep.hookText.trim(), field: 'hook' })
      let k = 0
      for (const c of p.cast ?? []) {
        if (!c.dialogue.trim()) continue
        k += 1
        texts.push({ role: 'dialogue', name: `대사 ${k} · ${c.name || '인물'}`, text: `${c.name || '인물'}: "${c.dialogue.trim()}"`, field: `cast:${c.id}` })
      }
      if (p.dialogue.trim()) texts.push({ role: 'dialogue', name: '기타 대사', text: p.dialogue.trim(), field: 'dialogue' })
      // 한컷에서 자막이 비어 있으면 첫 화면 문구를 그림 안 자막으로 쓴다
      const hookAsCaption = !p.narration.trim() && ep.format === 'single' && i === 0 && !!ep.hookText?.trim()
      const narr = p.narration.trim() || (hookAsCaption ? ep.hookText!.trim() : '')
      if (narr) texts.push({ role: 'narration', name: ep.format === 'captions' ? '자막' : ep.format === 'info' ? '자막·팁 정리' : '내레이션', text: narr, field: hookAsCaption ? 'hook' : 'narration' })
      frames.push({ name: `${reels ? '릴스 · ' : ''}${panels.length === 1 ? '한컷' : ep.format === 'captions' || ep.format === 'info' ? `${i + 1}장` : `컷 ${i + 1}`}`, panelId: p.id, kind: 'cut', image, edge: edges.get(p.id), texts })
    }
  }

  // 릴스 커버: 첫 컷 그림 + 가운데 모은 제목 (그리드에서 3:4로 잘려 보인다)
  if (reels && frames.length) {
    const first = frames[0]
    frames.unshift({ name: '릴스 커버', panelId: REELS_COVER_ID, kind: 'reelsCover', image: first.image, edge: first.edge, texts: reelsTitle ? [{ role: 'reelsTitle', name: '커버 제목', text: reelsTitle, field: '' as TextField }] : [] })
  }

  return {
    app: 'ttuguri-studio',
    version: FIGMA_EXPORT_VERSION,
    episodeId: ep.id,
    title: ep.title,
    contentType: card ? 'cardnews' : 'instatoon',
    width,
    height,
    exportedAt: new Date().toISOString(),
    plugin: card ? 4 : TOON_PLUGIN,
    ...(!card ? { style: opts.style, badge: ep.badge?.trim() || undefined } : {}),
    ...(reels ? { layout: 'reels' as const, cutHeight } : {}),
    ...(card ? { design: designOf(cardnews ?? {}), brand: brandOf(cardnews ?? {}) } : {}),
    frames,
  }
}
