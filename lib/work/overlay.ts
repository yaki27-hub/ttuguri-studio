import { dialogueLines } from './prompts'
import type { Episode, Overlay, Panel, Ratio, Slide } from './types'

/**
 * 그림 위에 글자 얹기: 브라우저 캔버스로 계정·번호 머리줄, 제목, 말풍선, 자막을 그려
 * 게시용 PNG 한 장을 만든다. 원본 그림은 그대로 두고 새 파일로 저장한다.
 */

export const OUT_W = 1080
export const outHeight = (r: Ratio) => (r === '1:1' ? 1080 : 1350)

const FONT_TITLE = '"Black Han Sans", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif'
const FONT_BUBBLE = '"Gaegu", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif'
const FONT_UI = '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif'
const INK = '#2a2420'
const HEADER_INK = '#6b5e4f'
const PAPER = '#f9f3e1'

/** "이름: "대사"" → 대사 */
export const bareLine = (line: string) => line.replace(/^[^:]{1,20}:\s*"(.*)"$/, '$1')

/** 슬라이드에 처음 얹을 글자: 첫 장은 첫 화면 문구를 제목으로, 대사는 말풍선, 자막은 아래 */
export function defaultOverlay(ep: Episode, slide: Slide, panels: Panel[], index: number): Overlay {
  const ps = slide.panelIds.map((id) => panels.find((p) => p.id === id)).filter((p): p is Panel => !!p)
  return {
    showHeader: true,
    title: index === 0 ? (ep.hookText?.trim() || ep.title) : '',
    bubbles: ps.flatMap((p) => dialogueLines(p).map(bareLine)).filter(Boolean),
    caption: ps.map((p) => p.narration.trim()).filter(Boolean).join('\n'),
    bubbleAt: 'top',
    align: 'left',
  }
}

/** 글자를 얹을 원본 그림: 저장해 둔 원본 → 연결 컷의 그림(글자 없는 것) → 지금 슬라이드 이미지 */
export function sourceOf(slide: Slide, panels: Panel[]) {
  if (slide.sourceAssetId) return slide.sourceAssetId
  for (const id of slide.panelIds) {
    const p = panels.find((x) => x.id === id)
    if (p?.assetId && !p.assetIsFinal) return p.assetId
  }
  return slide.assetId
}

let fontsReady: Promise<void> | undefined
/** 웹폰트를 한 번만 불러온다. 실패하면 기본 글꼴로 그린다. */
export function loadOverlayFonts() {
  if (fontsReady) return fontsReady
  fontsReady = (async () => {
    if (typeof document === 'undefined') return
    if (!document.getElementById('overlay-fonts')) {
      const link = document.createElement('link')
      link.id = 'overlay-fonts'
      link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Gaegu:wght@700&display=swap'
      document.head.appendChild(link)
      await new Promise((r) => {
        link.onload = r
        link.onerror = r
        setTimeout(r, 3000)
      })
    }
    await Promise.race([
      Promise.all([document.fonts.load(`80px ${FONT_TITLE}`, '가'), document.fonts.load(`700 40px ${FONT_BUBBLE}`, '가')]),
      new Promise((r) => setTimeout(r, 3000)),
    ]).catch(() => undefined)
  })()
  return fontsReady
}

/**
 * 한글 웹폰트는 글자 묶음별로 나눠 받아진다. 캔버스는 아직 안 받은 글자를 기본 글꼴로 그리므로,
 * 그릴 글자를 미리 지정해 받아 둔다.
 */
export async function prepareGlyphs(o: Overlay, handle: string) {
  await loadOverlayFonts()
  if (typeof document === 'undefined') return
  const jobs = [
    o.title.trim() && document.fonts.load(`104px ${FONT_TITLE}`, o.title),
    o.bubbles.join('').trim() && document.fonts.load(`700 50px ${FONT_BUBBLE}`, o.bubbles.join('')),
    (handle + o.caption).trim() && document.fonts.load(`700 42px ${FONT_UI}`, handle + o.caption + '0123456789'),
  ].filter(Boolean) as Promise<unknown>[]
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 4000))]).catch(() => undefined)
}

/** 공백 기준으로 줄바꿈, 긴 단어는 글자 단위로 자른다. 직접 넣은 줄바꿈은 지킨다. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue
      const next = line + word
      if (ctx.measureText(next).width <= maxW) {
        line = next
        continue
      }
      if (line.trim()) out.push(line.trim())
      line = word.trimStart()
      while (ctx.measureText(line).width > maxW && line.length > 1) {
        let k = line.length - 1
        while (k > 1 && ctx.measureText(line.slice(0, k)).width > maxW) k--
        out.push(line.slice(0, k))
        line = line.slice(k)
      }
    }
    if (line.trim()) out.push(line.trim())
  }
  return out
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

export interface RenderInput {
  image?: ImageBitmap
  overlay: Overlay
  ratio: Ratio
  handle: string
  /** 머리줄 오른쪽 번호 */
  number: number
}

/** 캔버스에 완성 이미지를 그린다 (미리보기와 저장이 같은 함수를 쓴다) */
export function renderOverlay(canvas: HTMLCanvasElement, { image, overlay: o, ratio, handle, number }: RenderInput) {
  const W = OUT_W
  const H = outHeight(ratio)
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, H)
  if (image) {
    // 꽉 차게(넘치는 부분은 가운데 기준으로 잘림)
    const s = Math.max(W / image.width, H / image.height)
    const w = image.width * s
    const h = image.height * s
    ctx.drawImage(image, (W - w) / 2, (H - h) / 2, w, h)
  }
  ctx.textBaseline = 'top'

  let y = 60
  const title = o.title.trim()

  // 제목이 있으면 위쪽을 종이색으로 흐리게 덮어 글자가 잘 읽히게
  if (o.showHeader || title) {
    const fadeH = title ? 470 : 170
    const g = ctx.createLinearGradient(0, 0, 0, fadeH)
    g.addColorStop(0, 'rgba(249,243,225,0.96)')
    g.addColorStop(0.7, 'rgba(249,243,225,0.85)')
    g.addColorStop(1, 'rgba(249,243,225,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, fadeH)
  }

  if (o.showHeader) {
    ctx.font = `700 38px ${FONT_UI}`
    ctx.fillStyle = HEADER_INK
    ctx.textAlign = 'left'
    if (handle.trim()) ctx.fillText(handle.trim(), 80, 60)
    ctx.textAlign = 'right'
    ctx.fillText(String(number), W - 80, 60)
    y = 150
  }

  if (title) {
    ctx.font = `104px ${FONT_TITLE}`
    ctx.fillStyle = INK
    ctx.textAlign = 'center'
    const lines = wrap(ctx, title, W - 160).slice(0, 3)
    for (const l of lines) {
      ctx.fillText(l, W / 2, y)
      y += 124
    }
    y += 30
  } else if (o.showHeader) y = 170

  // 말풍선 크기 계산
  ctx.font = `700 50px ${FONT_BUBBLE}`
  const LH = 62
  const PX = 46
  const PY = 26
  const bubbles = o.bubbles
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const lines = wrap(ctx, t, W - 120 - PX * 2)
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + PX * 2
      return { lines, w, h: lines.length * LH + PY * 2 }
    })

  // 자막(아래 띠)
  const cap = o.caption.trim()
  ctx.font = `700 42px ${FONT_UI}`
  const capLines = cap ? wrap(ctx, cap, W - 200) : []
  const capH = capLines.length ? capLines.length * 56 + 48 : 0

  const GAP = 22
  const drawBubble = (b: (typeof bubbles)[number], by: number) => {
    const bx = o.align === 'center' ? (W - b.w) / 2 : 60
    roundRect(ctx, bx, by, b.w, b.h, 60)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.setLineDash([16, 11])
    ctx.lineWidth = 4
    ctx.strokeStyle = INK
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = INK
    ctx.font = `700 50px ${FONT_BUBBLE}`
    ctx.textAlign = 'center'
    b.lines.forEach((l, k) => ctx.fillText(l, bx + b.w / 2, by + PY + k * LH + 4))
  }

  if (o.bubbleAt === 'top') {
    for (const b of bubbles) {
      drawBubble(b, y)
      y += b.h + GAP
    }
  } else {
    let by = H - 60 - (capH ? capH + GAP : 0)
    for (const b of [...bubbles].reverse()) {
      by -= b.h
      drawBubble(b, by)
      by -= GAP
    }
  }

  if (capLines.length) {
    const cy = H - 60 - capH
    roundRect(ctx, 60, cy, W - 120, capH, 28)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fill()
    ctx.fillStyle = INK
    ctx.font = `700 42px ${FONT_UI}`
    ctx.textAlign = 'center'
    capLines.forEach((l, k) => ctx.fillText(l, W / 2, cy + 24 + k * 56))
  }
}

export async function bitmapOf(blob?: Blob) {
  if (!blob) return undefined
  try {
    return await createImageBitmap(blob)
  } catch {
    return undefined
  }
}

export function canvasToFile(canvas: HTMLCanvasElement, name: string) {
  return new Promise<File>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(new File([b], name, { type: 'image/png' })) : reject(new Error('이미지를 만들지 못했어요.'))), 'image/png'),
  )
}
