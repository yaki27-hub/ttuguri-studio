/*
 * 피그마용 내보내기 (뚜구리 가져오기 플러그인이 읽는 파일)
 *
 * 한 편 = 프레임 여러 개. 프레임마다 배경 이미지 1장 + 고칠 수 있는 글자 레이어.
 * 파일 형식은 public/figma-plugin/code.js 와 맞춰야 한다 (version 을 올리면 둘 다 고칠 것).
 */
import { CARD_FIELD_LABEL, cardName, cardRole } from './cards'
import { getAsset } from './repo'
import { brandOf, designOf } from './cardDesign'
import type { CardBrand, CardDesign, CardNewsSettings } from './types'
import type { Episode, ImageMemo, Panel } from './types'

export const FIGMA_EXPORT_VERSION = 2

/**
 * field: 피그마에서 고친 글자를 다시 앱에 넣을 자리
 *   scene | narration | direction  (카드뉴스 제목·본문·강조, 인스타툰 자막·내레이션은 narration)
 *   hook                            (첫 화면 문구)
 *   cast:<castId>                   (인물 대사, "이름: \"대사\"" 형태)
 *   dialogue                        (인물에 속하지 않는 대사·효과음)
 */
export type TextField = 'scene' | 'narration' | 'direction' | 'hook' | 'dialogue' | 'action' | `cast:${string}`

export type TextRole = 'headline' | 'body' | 'highlight' | 'tag' | 'source' | 'hook' | 'dialogue' | 'narration'

export interface FigmaText {
  role: TextRole
  name: string
  text: string
  field: TextField
}

export interface FigmaFrame {
  name: string
  panelId: string
  /** 카드뉴스 역할 (cover | content | outro), 인스타툰은 cut */
  kind: 'cover' | 'content' | 'outro' | 'cut'
  image?: { mime: string; base64: string; width: number; height: number }
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

export async function buildFigmaExport(ep: Episode, panels: Panel[], memo: ImageMemo, cardnews?: Partial<CardNewsSettings>): Promise<FigmaExport> {
  const card = ep.contentType === 'cardnews'
  const width = 1080
  const height = memo.ratio === '1:1' ? 1080 : 1350
  const frames: FigmaFrame[] = []

  for (const [i, p] of panels.entries()) {
    let image: FigmaFrame['image']
    if (p.assetId) {
      const a = await getAsset(p.assetId)
      if (a) image = { mime: a.mimeType, base64: await toBase64(a.blob), width: a.width, height: a.height }
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
      if (i === 0 && ep.hookText?.trim() && ep.format !== 'single') texts.push({ role: 'hook', name: '첫 화면 문구', text: ep.hookText.trim(), field: 'hook' })
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
      frames.push({ name: panels.length === 1 ? '한컷' : ep.format === 'captions' || ep.format === 'info' ? `${i + 1}장` : `컷 ${i + 1}`, panelId: p.id, kind: 'cut', image, texts })
    }
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
    ...(card ? { design: designOf(cardnews ?? {}), brand: brandOf(cardnews ?? {}) } : {}),
    frames,
  }
}
