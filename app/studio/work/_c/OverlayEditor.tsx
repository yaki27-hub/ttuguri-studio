'use client'

import { useEffect, useRef, useState } from 'react'
import { deleteAssetIfUnused, getAsset, imageMemoOf, putAsset, saveSlides } from '@/lib/work/repo'
import { bitmapOf, canvasToFile, defaultOverlay, loadOverlayFonts, prepareGlyphs, renderOverlay, sourceOf } from '@/lib/work/overlay'
import type { CharacterSettings, Episode, Overlay, Panel, Ratio, Slide } from '@/lib/work/types'
import { Chips, Field, Modal } from './ui'
import { useWS } from './Workspace'

interface BakeInput {
  ep: Episode
  slide: Slide
  index: number
  panels: Panel[]
  settings: CharacterSettings
  ratio: Ratio
  overlay?: Overlay
  canvas?: HTMLCanvasElement
}

/** 원본 그림에 글자를 얹어 새 이미지로 저장하고, 바뀐 슬라이드를 돌려준다 (원본 그림은 그대로 둔다) */
export async function bakeSlide({ ep, slide, index, panels, settings, ratio, overlay, canvas }: BakeInput): Promise<Slide> {
  await loadOverlayFonts()
  const src = sourceOf(slide, panels)
  const image = await bitmapOf(src ? (await getAsset(src))?.blob : undefined)
  const o = overlay ?? slide.overlay ?? defaultOverlay(ep, slide, panels, index)
  await prepareGlyphs(o, settings.handle ?? '')
  const cv = canvas ?? document.createElement('canvas')
  renderOverlay(cv, { image, overlay: o, ratio, handle: settings.handle ?? '', number: index + 1 })
  image?.close()
  const file = await canvasToFile(cv, `slide-${String(index + 1).padStart(2, '0')}.png`)
  const a = await putAsset(file, 'slide')
  return { ...slide, assetId: a.id, isFinalImage: true, sourceAssetId: src, overlay: o }
}

/** 바꾼 슬라이드를 저장하고, 더는 쓰지 않는 이전 완성 이미지만 지운다 */
export async function saveBaked(episodeId: string, all: Slide[], changed: Slide[]) {
  const byId = new Map(changed.map((s) => [s.id, s]))
  const olds = all.filter((s) => byId.has(s.id)).map((s) => s.assetId).filter((x): x is string => !!x)
  await saveSlides(episodeId, all.map((s) => byId.get(s.id) ?? s))
  for (const id of olds) await deleteAssetIfUnused(id)
}

export default function OverlayEditor({ slide, index, onClose }: { slide: Slide; index: number; onClose: () => void }) {
  const ws = useWS()
  const { ep, b, settings } = ws
  const ratio = imageMemoOf(ep, settings).ratio
  const [o, setO] = useState<Overlay>(() => slide.overlay ?? defaultOverlay(ep, slide, b.panels, index))
  const [bubblesText, setBubblesText] = useState(o.bubbles.join('\n'))
  const [img, setImg] = useState<ImageBitmap | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const src = sourceOf(slide, b.panels)
  const alreadyText = !slide.sourceAssetId && src === slide.assetId && slide.isFinalImage

  useEffect(() => {
    let bmp: ImageBitmap | undefined
    let alive = true
    ;(async () => {
      await loadOverlayFonts()
      bmp = await bitmapOf(src ? (await getAsset(src))?.blob : undefined)
      if (alive) setImg(bmp ?? null)
    })()
    return () => {
      alive = false
      bmp?.close()
    }
  }, [src])

  useEffect(() => {
    if (img === undefined || !canvas.current) return
    const cv = canvas.current
    const handle = settings.handle ?? ''
    const draw = () => renderOverlay(cv, { image: img ?? undefined, overlay: o, ratio, handle, number: index + 1 })
    let alive = true
    draw()
    // 새로 입력한 글자의 글꼴 조각이 도착하면 다시 그린다
    prepareGlyphs(o, handle).then(() => alive && draw())
    return () => {
      alive = false
    }
  }, [img, o, ratio, settings.handle, index])

  const set = (patch: Partial<Overlay>) => setO((x) => ({ ...x, ...patch }))

  async function save() {
    setBusy(true)
    setErr('')
    try {
      const next = await bakeSlide({ ep, slide, index, panels: b.panels, settings, ratio, overlay: o })
      await ws.act(() => saveBaked(ep.id, b.slides, [next]), `${index + 1}번에 글자를 얹었어요. 원본 그림은 따로 보관돼요.`)
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`${index + 1}번 글자 얹기`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn primary" disabled={busy || img === undefined} onClick={save}>
            {busy ? '저장 중…' : '이 장에 저장'}
          </button>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              const d = defaultOverlay(ep, slide, b.panels, index)
              setO(d)
              setBubblesText(d.bubbles.join('\n'))
            }}
          >
            콘티 내용으로 되돌리기
          </button>
        </>
      }
    >
      <div className="overlay-edit">
        <div className="overlay-canvas">
          {img === undefined && <p className="muted small">그림 불러오는 중…</p>}
          <canvas ref={canvas} aria-label="완성 이미지 미리보기" />
          {img === null && <p className="hint">그림이 없어 종이색 배경에 글자만 얹어요.</p>}
          {alreadyText && <p className="hint">이 장은 이미 글자가 들어간 이미지일 수 있어요. 그 위에 또 얹게 돼요.</p>}
        </div>
        <div className="overlay-fields">
          <label className="check">
            <input type="checkbox" checked={o.showHeader} onChange={(e) => set({ showHeader: e.target.checked })} /> 계정 아이디·번호 표시{' '}
            <span className="muted small">({settings.handle || '설정에서 입력'})</span>
          </label>
          <Field label="제목" single value={o.title} onChange={(v) => set({ title: v })} hint="비우면 제목 없이 말풍선만" />
          <Field
            label="말풍선"
            value={bubblesText}
            rows={3}
            onChange={(v) => {
              setBubblesText(v)
              set({ bubbles: v.split('\n') })
            }}
            hint="한 줄에 말풍선 하나"
          />
          <Field label="자막 (아래 띠)" value={o.caption} rows={2} onChange={(v) => set({ caption: v })} />
          <Chips
            legend="말풍선 위치"
            value={o.bubbleAt}
            options={[
              ['top', '위'],
              ['bottom', '아래'],
            ]}
            onChange={(v) => set({ bubbleAt: v })}
          />
          <Chips
            legend="말풍선 정렬"
            value={o.align}
            options={[
              ['left', '왼쪽'],
              ['center', '가운데'],
            ]}
            onChange={(v) => set({ align: v })}
          />
          {err && <p className="flash bad">{err}</p>}
        </div>
      </div>
    </Modal>
  )
}
