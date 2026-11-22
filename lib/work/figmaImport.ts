/*
 * 피그마 완성본 가져오기 (뚜구리 가져오기 플러그인 ② 가 만든 *-final.json)
 *
 * 프레임마다 장 id 로 맞춰서
 *  - 프레임 PNG → 그 장(컷)의 '글자 포함 최종 이미지'
 *  - 피그마에서 고친 글자 → 그 장의 제목·본문·대사 등 (이전 버전은 이력에 남김)
 *  - 게시 슬라이드 → 장 하나짜리 슬라이드는 새 이미지로, 슬라이드가 없으면 장마다 하나씩 만든다
 */
import { getEpisode, newSlide, patchEpisode, patchPanelMeta, putAsset, saveSlides, savePanel } from './repo'
import { db } from './db'
import type { Episode, Panel, Slide } from './types'

export interface FinalFrame {
  panelId: string
  name: string
  image?: { mime: string; base64: string }
  texts: { field: string; text: string }[]
}
export interface FinalFile {
  app: 'ttuguri-studio'
  kind: 'final'
  version: number
  episodeId: string
  title: string
  frames: FinalFrame[]
}

export function parseFinal(raw: unknown): FinalFile {
  const o = raw as Partial<FinalFile>
  if (!o || o.app !== 'ttuguri-studio') throw new Error('뚜구리 스튜디오 플러그인에서 만든 파일이 아니에요.')
  if (o.kind !== 'final') throw new Error('피그마 플러그인의 ‘② 완성본을 사이트로 보내기’로 만든 파일을 넣어 주세요. (이 파일은 피그마로 보내는 파일이에요.)')
  if (!Array.isArray(o.frames) || !o.frames.length) throw new Error('파일에 프레임이 없어요.')
  return o as FinalFile
}

export interface Change {
  label: string
  from: string
  to: string
}
export interface FramePlan {
  frame: FinalFrame
  panel: Panel
  index: number
  /** 글자 변경을 반영할 때 저장할 내용 */
  patch: Partial<Panel>
  changes: Change[]
}
export interface ImportPlan {
  frames: FramePlan[]
  hook?: Change
  /** 이 편에 없는 장 id 의 프레임 (지운 장 등) */
  unmatched: FinalFrame[]
}

/** "이름: "대사"" → 대사. 형식이 깨졌으면 글 전체 */
function dialogueOf(text: string) {
  const m = text.trim().match(/^[^:："“]{1,30}[:：]\s*["“](.*)["”]\s*$/s)
  return (m ? m[1] : text).trim()
}

export function planImport(ep: Episode, panels: Panel[], file: FinalFile): ImportPlan {
  const plan: ImportPlan = { frames: [], unmatched: [] }
  const card = ep.contentType === 'cardnews'
  for (const frame of file.frames) {
    const index = panels.findIndex((p) => p.id === frame.panelId)
    if (index < 0) {
      plan.unmatched.push(frame)
      continue
    }
    const p = panels[index]
    const patch: Partial<Panel> = {}
    const changes: Change[] = []
    let cast = p.cast
    for (const t of frame.texts) {
      const to = t.text.trim()
      if (t.field === 'hook') {
        if (to !== (ep.hookText ?? '').trim()) plan.hook = { label: '첫 화면 문구', from: ep.hookText ?? '', to }
      } else if (t.field === 'scene' || t.field === 'narration' || t.field === 'direction' || t.field === 'dialogue' || t.field === 'action') {
        const from = p[t.field].trim()
        if (to !== from) {
          patch[t.field] = to
          const label = card
            ? { scene: '제목', narration: '본문', direction: '강조', dialogue: '태그', action: '출처' }[t.field]
            : { scene: '장면', narration: ep.format === 'captions' ? '자막' : ep.format === 'info' ? '자막·팁 정리' : '내레이션', direction: '연출', dialogue: '기타 대사', action: '행동·표정' }[t.field]
          changes.push({ label, from, to })
        }
      } else if (t.field.startsWith('cast:')) {
        const id = t.field.slice(5)
        const c = cast.find((x) => x.id === id)
        if (!c) continue
        const line = dialogueOf(to)
        if (line !== c.dialogue.trim()) {
          cast = cast.map((x) => (x.id === id ? { ...x, dialogue: line } : x))
          changes.push({ label: `대사 · ${c.name || '인물'}`, from: c.dialogue, to: line })
        }
      }
    }
    if (cast !== p.cast) patch.cast = cast
    plan.frames.push({ frame, panel: p, index, patch, changes })
  }
  plan.frames.sort((a, b) => a.index - b.index)
  return plan
}

function fileOf(img: NonNullable<FinalFrame['image']>, name: string) {
  const bytes = Uint8Array.from(atob(img.base64), (c) => c.charCodeAt(0))
  return new File([bytes], `${name.replace(/[\\/:*?"<>|]/g, '')}.png`, { type: img.mime || 'image/png' })
}

/** 적용. withText=false 면 이미지만 붙인다. 돌려주는 값: 붙인 이미지 수, 고친 장 수, 슬라이드 수 */
export async function applyImport(ep: Episode, plan: ImportPlan, slides: Slide[], withText: boolean) {
  const assetOf = new Map<string, string>()
  const loose: string[] = []
  let edited = 0

  for (const fp of plan.frames) {
    if (fp.frame.image?.base64) {
      const a = await putAsset(fileOf(fp.frame.image, fp.frame.name), 'panel')
      const cur = (await (await db()).get('panels', fp.panel.id)) ?? fp.panel
      if (cur.assetId && cur.assetId !== a.id) loose.push(cur.assetId)
      await patchPanelMeta(fp.panel.id, { assetId: a.id, assetIsFinal: true })
      assetOf.set(fp.panel.id, a.id)
    }
    if (withText && Object.keys(fp.patch).length) {
      const cur = await (await db()).get('panels', fp.panel.id)
      if (cur) {
        await savePanel({ ...cur, ...fp.patch }, '피그마 최종 반영', { force: true })
        edited += 1
      }
    }
  }

  // 바뀌기 전 그림은 지우지 않고 '연결 안 된 이미지'로 보관
  const cur = await getEpisode(ep.id)
  const patch: Partial<Episode> = {}
  if (loose.length && cur) patch.looseAssetIds = [...new Set([...(cur.looseAssetIds ?? []), ...loose])]
  if (withText && plan.hook) patch.hookText = plan.hook.to
  if (Object.keys(patch).length) await patchEpisode(ep.id, patch)

  // 게시 슬라이드: 장 하나짜리 슬라이드는 새 이미지로, 없으면 장 순서대로 만든다
  let nextSlides: Slide[]
  if (slides.length) {
    nextSlides = slides.map((s) => {
      const id = s.panelIds.length === 1 ? assetOf.get(s.panelIds[0]) : undefined
      return id ? { ...s, assetId: id, isFinalImage: true } : s
    })
  } else {
    const d = await db()
    const panels = (await d.getAllFromIndex('panels', 'episodeId', ep.id)).sort((a, b) => a.order - b.order)
    nextSlides = panels.map((p, i) => newSlide(ep.id, i + 1, 'content', [p.id], p.assetIsFinal ? p.assetId : undefined))
  }
  await saveSlides(ep.id, nextSlides)
  return { images: assetOf.size, edited, slides: nextSlides.length }
}
