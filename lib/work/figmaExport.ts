/*
 * 피그마용 내보내기 (뚜구리 가져오기 플러그인이 읽는 파일)
 *
 * 한 편 = 프레임 여러 개. 프레임마다 배경 이미지 1장 + 고칠 수 있는 글자 레이어.
 * 파일 형식은 public/figma-plugin/code.js 와 맞춰야 한다 (version 을 올리면 둘 다 고칠 것).
 */
import { CARD_FIELD_LABEL, cardName, cardRole } from './cards'
import { dialogueLines } from './prompts'
import { getAsset } from './repo'
import type { Episode, ImageMemo, Panel } from './types'

export const FIGMA_EXPORT_VERSION = 1

export type TextRole = 'headline' | 'body' | 'highlight' | 'hook' | 'dialogue' | 'narration'

export interface FigmaText {
  role: TextRole
  name: string
  text: string
}

export interface FigmaFrame {
  name: string
  /** 카드뉴스 역할 (cover | content | outro), 인스타툰은 cut */
  kind: 'cover' | 'content' | 'outro' | 'cut'
  image?: { mime: string; base64: string; width: number; height: number }
  texts: FigmaText[]
}

export interface FigmaExport {
  app: 'ttuguri-studio'
  version: number
  title: string
  contentType: 'cardnews' | 'instatoon'
  width: number
  height: number
  exportedAt: string
  frames: FigmaFrame[]
}

async function toBase64(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

export async function buildFigmaExport(ep: Episode, panels: Panel[], memo: ImageMemo): Promise<FigmaExport> {
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
      if (p.scene.trim()) texts.push({ role: 'headline', name: F.headline, text: p.scene.trim() })
      if (p.narration.trim()) texts.push({ role: 'body', name: F.body, text: p.narration.trim() })
      if (p.direction.trim()) texts.push({ role: 'highlight', name: '강조', text: p.direction.trim() })
      frames.push({ name: cardName(i, panels.length), kind: role, image, texts })
    } else {
      if (i === 0 && ep.hookText?.trim() && ep.format !== 'single') texts.push({ role: 'hook', name: '첫 화면 문구', text: ep.hookText.trim() })
      dialogueLines(p).forEach((d, k) => texts.push({ role: 'dialogue', name: `대사 ${k + 1}`, text: d }))
      const narr = p.narration.trim() || (ep.format === 'single' && i === 0 ? ep.hookText?.trim() ?? '' : '')
      if (narr) texts.push({ role: 'narration', name: ep.format === 'captions' ? '자막' : '내레이션', text: narr })
      frames.push({ name: panels.length === 1 ? '한컷' : ep.format === 'captions' ? `${i + 1}장` : `컷 ${i + 1}`, kind: 'cut', image, texts })
    }
  }

  return {
    app: 'ttuguri-studio',
    version: FIGMA_EXPORT_VERSION,
    title: ep.title,
    contentType: card ? 'cardnews' : 'instatoon',
    width,
    height,
    exportedAt: new Date().toISOString(),
    frames,
  }
}
