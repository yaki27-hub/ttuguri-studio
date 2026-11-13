import { ConflictError, broadcast, db, nowISO, uid, EPISODE_STORES } from './db'
import type {
  Activity,
  Asset,
  CharacterSettings,
  Episode,
  Format,
  GenerationDraft,
  ImageMemo,
  Metric,
  Panel,
  PanelSnapshot,
  PanelVersion,
  Publication,
  Slide,
  Status,
  StoryVersion,
} from './types'

const SETTINGS_ID = 'character'

export function autoTitle(memo: string) {
  const line = memo.trim().split('\n')[0]
  return line.length > 28 ? line.slice(0, 28) + '…' : line
}

function base() {
  const t = nowISO()
  return { id: uid(), createdAt: t, updatedAt: t }
}

/* ───────── Episodes ───────── */

export async function createEpisode(memo: string, extra: Partial<Episode> = {}): Promise<Episode> {
  const text = memo.trim()
  if (!text) throw new Error('메모를 입력해 주세요.')
  const ep: Episode = {
    ...base(),
    title: autoTitle(text),
    titleIsAuto: true,
    originalMemo: memo,
    notes: '',
    situation: '',
    facts: [],
    emotions: [],
    humorPoint: '',
    unknowns: [],
    tags: [],
    format: 'four',
    stage: 'source',
    status: 'idea',
    storyRevision: 0,
    panelsRevision: 0,
    needsReview: false,
    revision: 1,
    links: [],
    sourceAssetIds: [],
    looseAssetIds: [],
    ...extra,
  }
  const d = await db()
  await d.put('episodes', ep)
  await logActivity(ep.id, '소재 저장', undefined, ep.revision)
  broadcast('episodes', ep.id)
  return ep
}

export async function listEpisodes() {
  const d = await db()
  const all = await d.getAll('episodes')
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getEpisode(id: string) {
  return (await db()).get('episodes', id)
}

export async function findByNotion(pageId: string) {
  return (await listEpisodes()).find((e) => e.notionPageId === pageId)
}

type EpisodeEditable = Omit<Episode, 'id' | 'createdAt' | 'originalMemo' | 'revision'>

/** baseRevision이 DB와 다르면 덮어쓰지 않는다. */
export async function patchEpisode(id: string, patch: Partial<EpisodeEditable>, baseRevision?: number) {
  const d = await db()
  const tx = d.transaction('episodes', 'readwrite')
  const cur = await tx.store.get(id)
  if (!cur) throw new Error('에피소드를 찾을 수 없습니다.')
  if (baseRevision !== undefined && cur.revision !== baseRevision) {
    tx.abort()
    throw new ConflictError()
  }
  const next: Episode = { ...cur, ...patch, id, originalMemo: cur.originalMemo, revision: cur.revision + 1, updatedAt: nowISO() }
  await tx.store.put(next)
  await tx.done
  broadcast('episode', id)
  return next
}

export async function setStatus(ep: Episode, status: Status, operation: string, extra: Partial<Episode> = {}) {
  const next = await patchEpisode(ep.id, { status, ...extra })
  await logActivity(ep.id, operation, { status: ep.status }, next.revision)
  return next
}

export async function toggleHold(ep: Episode) {
  if (ep.status === 'on_hold') {
    return setStatus(ep, ep.previousStatus ?? 'idea', '보류 해제', { previousStatus: undefined })
  }
  return setStatus(ep, 'on_hold', '보류', { previousStatus: ep.status })
}

export async function deleteEpisode(id: string) {
  const d = await db()
  const tx = d.transaction(['episodes', ...EPISODE_STORES], 'readwrite')
  await tx.objectStore('episodes').delete(id)
  for (const s of EPISODE_STORES) {
    const store = tx.objectStore(s)
    const keys = await store.index('episodeId').getAllKeys(id)
    for (const k of keys) await store.delete(k)
  }
  await tx.done
  await cleanupOrphanAssets()
  broadcast('episodes', id)
}

/* ───────── Activities ───────── */

export async function logActivity(episodeId: string, operation: string, previousSnapshot?: unknown, resultingRevision?: number) {
  const a: Activity = { ...base(), episodeId, operation, timestamp: nowISO(), previousSnapshot, resultingRevision }
  await (await db()).put('activities', a)
}

/* ───────── Bundle ───────── */

export interface Bundle {
  episode: Episode
  stories: StoryVersion[]
  panels: Panel[]
  slides: Slide[]
  publication?: Publication
  drafts: GenerationDraft[]
  activities: Activity[]
  metrics: Metric[]
  panelVersions: PanelVersion[]
}

export async function getBundle(id: string): Promise<Bundle | null> {
  const d = await db()
  const episode = await d.get('episodes', id)
  if (!episode) return null
  const by = <S extends (typeof EPISODE_STORES)[number]>(s: S) => d.getAllFromIndex(s, 'episodeId', id as never)
  const [stories, panels, slides, pubs, drafts, activities, metrics, panelVersions] = await Promise.all([
    by('storyVersions'),
    by('panels'),
    by('slides'),
    by('publications'),
    by('drafts'),
    by('activities'),
    by('metrics'),
    by('panelVersions'),
  ])
  return {
    episode,
    stories: stories.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    panels: panels.map(normPanel).sort((a, b) => a.order - b.order),
    slides: slides.sort((a, b) => a.order - b.order),
    publication: pubs[0],
    drafts: drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    activities: activities.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    metrics: metrics.sort((a, b) => a.observedAt.localeCompare(b.observedAt)),
    panelVersions: panelVersions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }
}

/* ───────── Story ───────── */

export type StoryFields = Pick<StoryVersion, 'summary' | 'opening' | 'development' | 'humor' | 'ending' | 'format' | 'reason'>

export function emptyStory(format: Format): StoryFields {
  return { summary: '', opening: '', development: '', humor: '', ending: '', format, reason: '' }
}

/** 이야기를 저장하고 하위 콘티가 있으면 재확인 표시 */
async function afterStoryChange(episodeId: string) {
  const d = await db()
  const ep = await d.get('episodes', episodeId)
  if (!ep) throw new Error('에피소드 없음')
  const panelCount = await d.countFromIndex('panels', 'episodeId', episodeId)
  const patch: Partial<Episode> = { storyRevision: ep.storyRevision + 1 }
  if (panelCount > 0) {
    patch.needsReview = true
    patch.reviewReason = '이야기 수정 후 콘티 확인 필요'
  }
  return patchEpisode(episodeId, patch)
}

export async function saveStoryEdit(story: StoryVersion) {
  const d = await db()
  const next = { ...story, updatedAt: nowISO() }
  await d.put('storyVersions', next)
  const episode = await afterStoryChange(story.episodeId)
  return { story: next, episode }
}

export async function addStoryVersion(
  episodeId: string,
  fields: StoryFields,
  source: StoryVersion['source'],
  baseRevision: number,
  settingRevision: number,
) {
  const sv: StoryVersion = { ...base(), episodeId, ...fields, baseRevision, settingRevision, source, appliedAt: nowISO() }
  await (await db()).put('storyVersions', sv)
  const episode = await afterStoryChange(episodeId)
  await logActivity(episodeId, source === 'manual' ? '이야기 직접 작성' : '이야기 초안 적용', undefined, episode.revision)
  return { story: sv, episode }
}

/* ───────── Panels ───────── */

/** 예전에 저장된 컷에는 cast·direction이 없다 */
export function normPanel(p: Panel): Panel {
  return { ...p, cast: p.cast ?? [], direction: p.direction ?? '' }
}

export function snapshotOf(p: Panel): PanelSnapshot {
  return {
    scene: p.scene,
    action: p.action,
    cast: p.cast ?? [],
    direction: p.direction ?? '',
    dialogue: p.dialogue,
    narration: p.narration,
    productionNotes: p.productionNotes,
    adaptationNotes: p.adaptationNotes,
  }
}

export function newPanel(episodeId: string, order: number, s: Partial<PanelSnapshot> = {}): Panel {
  return {
    ...base(),
    episodeId,
    order,
    scene: '',
    action: '',
    cast: [],
    direction: '',
    dialogue: '',
    narration: '',
    productionNotes: '',
    adaptationNotes: '',
    ...s,
    locked: false,
    revision: 1,
    assetIsFinal: false,
  }
}

async function bumpPanels(episodeId: string, reason?: string) {
  const ep = await getEpisode(episodeId)
  if (!ep) throw new Error('에피소드 없음')
  const patch: Partial<Episode> = { panelsRevision: ep.panelsRevision + 1 }
  if (ep.confirmedPanelRevision !== undefined) {
    patch.needsReview = true
    patch.reviewReason = reason ?? '확정 이후 콘티가 수정됨 — 재확인 필요'
  }
  return patchEpisode(episodeId, patch)
}

/**
 * 컷 내용 저장. 이전 내용은 PanelVersion으로 추가 기록(덮어쓰지 않음).
 * 연속된 직접 편집은 60초 안에서 하나의 이력으로 묶는다.
 */
export async function savePanel(panel: Panel, operation: string, opts: { force?: boolean } = {}) {
  const d = await db()
  const tx = d.transaction(['panels', 'panelVersions'], 'readwrite')
  const cur = await tx.objectStore('panels').get(panel.id)
  if (!cur) {
    tx.abort()
    throw new Error('컷을 찾을 수 없습니다.')
  }
  if (cur.revision !== panel.revision) {
    tx.abort()
    throw new ConflictError()
  }
  if (cur.locked && !opts.force) {
    tx.abort()
    throw new Error('잠긴 컷은 수정할 수 없습니다. 먼저 잠금을 해제해 주세요.')
  }
  const changed = JSON.stringify(snapshotOf(cur)) !== JSON.stringify(snapshotOf(panel))
  if (changed) {
    const versions = await tx.objectStore('panelVersions').index('episodeId').getAll(panel.episodeId)
    const last = versions.filter((v) => v.panelId === panel.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const merge = operation === '직접 편집' && last?.operation === '직접 편집' && Date.now() - Date.parse(last.createdAt) < 60_000
    if (!merge) {
      const v: PanelVersion = { ...base(), panelId: cur.id, episodeId: cur.episodeId, snapshot: snapshotOf(cur), operation, revision: cur.revision }
      await tx.objectStore('panelVersions').put(v)
    }
  }
  const next: Panel = { ...cur, ...panel, revision: cur.revision + 1, updatedAt: nowISO() }
  await tx.objectStore('panels').put(next)
  await tx.done
  const episode = changed ? await bumpPanels(panel.episodeId) : undefined
  return { panel: next, episode }
}

/** 잠금/이미지 연결 같은 비내용 필드 */
export async function patchPanelMeta(id: string, patch: Partial<Pick<Panel, 'locked' | 'assetId' | 'assetIsFinal' | 'order'>>) {
  const d = await db()
  const cur = await d.get('panels', id)
  if (!cur) throw new Error('컷을 찾을 수 없습니다.')
  const next = { ...cur, ...patch, revision: cur.revision + 1, updatedAt: nowISO() }
  await d.put('panels', next)
  return next
}

export async function reorderPanels(episodeId: string, orderedIds: string[]) {
  const d = await db()
  const tx = d.transaction('panels', 'readwrite')
  const out: Panel[] = []
  for (const [i, id] of orderedIds.entries()) {
    const p = await tx.store.get(id)
    if (!p) continue
    const next = { ...p, order: i + 1, revision: p.revision + 1, updatedAt: nowISO() }
    await tx.store.put(next)
    out.push(next)
  }
  await tx.done
  const episode = await bumpPanels(episodeId, '컷 순서 변경 — 재확인 필요')
  return { panels: out, episode }
}

export async function addPanel(episodeId: string, order: number) {
  const p = newPanel(episodeId, order)
  await (await db()).put('panels', p)
  const episode = await bumpPanels(episodeId)
  return { panel: p, episode }
}

export async function removePanel(panel: Panel) {
  const d = await db()
  await d.delete('panels', panel.id)
  // 연결된 슬라이드에서는 컷 ID만 빼고 이미지는 유지
  const slides = await d.getAllFromIndex('slides', 'episodeId', panel.episodeId)
  for (const s of slides) {
    if (s.panelIds.includes(panel.id)) await d.put('slides', { ...s, panelIds: s.panelIds.filter((x) => x !== panel.id) })
  }
  await logActivity(panel.episodeId, '컷 삭제', snapshotOf(panel))
  if (panel.assetId) await keepLoose(panel.episodeId, [panel.assetId])
  return bumpPanels(panel.episodeId)
}

/** 초안을 적용할 때 기존 컷의 고정 대사(📌)를 그대로 남긴다 */
export function keepFixed(cur: Panel, snap: PanelSnapshot): PanelSnapshot {
  const fixed = (cur.cast ?? []).filter((c) => c.fixed && c.dialogue.trim())
  if (!fixed.length) return snap
  const cast = [...(snap.cast ?? [])]
  for (const f of fixed) {
    const same = cast.findIndex((c) => c.dialogue.trim() === f.dialogue.trim())
    const byName = cast.findIndex((c) => c.name.trim() && c.name.trim() === f.name.trim())
    const i = same >= 0 ? same : byName
    if (i >= 0) cast[i] = { ...cast[i], dialogue: f.dialogue, fixed: true }
    else cast.push(f)
  }
  return { ...snap, cast }
}

export interface PanelDraftItem extends PanelSnapshot {
  id?: string
}

/**
 * 콘티 변경안 적용.
 * mode=replace: 새 컷 묶음으로 교체(잠긴 컷은 유지). 기존 컷은 지우지 않고 이미지 연결도 유지하려면 같은 id를 사용.
 * mode=patch: 지정 id의 컷만 수정. 잠긴 컷은 건너뜀.
 */
export async function applyPanelDraft(
  episodeId: string,
  items: PanelDraftItem[],
  mode: 'replace' | 'patch',
  operation: string,
  storyRevision: number,
) {
  const d = await db()
  const existing = (await d.getAllFromIndex('panels', 'episodeId', episodeId)).sort((a, b) => a.order - b.order)
  const skipped: string[] = []
  const removedPanels: Panel[] = []
  const tx = d.transaction(['panels', 'panelVersions', 'slides'], 'readwrite')
  const pstore = tx.objectStore('panels')
  const vstore = tx.objectStore('panelVersions')
  const t = nowISO()
  const writeVersion = async (p: Panel) => {
    const v: PanelVersion = { id: uid(), createdAt: t, updatedAt: t, panelId: p.id, episodeId, snapshot: snapshotOf(p), operation, revision: p.revision }
    await vstore.put(v)
  }
  if (mode === 'patch') {
    for (const it of items) {
      const cur = await pstore.get(it.id ?? '')
      if (!cur) continue
      if (cur.locked) {
        skipped.push(cur.id)
        continue
      }
      await writeVersion(cur)
      const { id: _id, ...snap } = it
      await pstore.put({ ...cur, ...keepFixed(cur, snap), revision: cur.revision + 1, updatedAt: t })
    }
  } else {
    // 교체: 순서대로 기존 컷 슬롯에 대응. 잠긴 컷은 그대로 두고 그 자리를 건너뜀.
    const keep = new Set<string>()
    let order = 1
    const queue = [...items]
    for (const cur of existing) {
      if (cur.locked) {
        keep.add(cur.id)
        skipped.push(cur.id)
        await pstore.put({ ...cur, order: order++ })
        queue.shift()
        continue
      }
      const it = queue.shift()
      if (!it) continue
      keep.add(cur.id)
      await writeVersion(cur)
      const { id: _id, ...snap } = it
      await pstore.put({ ...cur, ...keepFixed(cur, snap), order: order++, revision: cur.revision + 1, updatedAt: t })
    }
    for (const it of queue) {
      const { id: _id, ...snap } = it
      const p = newPanel(episodeId, order++, snap)
      keep.add(p.id)
      await pstore.put(p)
    }
    for (const cur of existing) {
      if (!keep.has(cur.id)) {
        await writeVersion(cur)
        removedPanels.push(cur)
        await pstore.delete(cur.id)
      }
    }
    // 삭제된 컷은 슬라이드 연결에서만 빠짐. 파일은 남겨둔다.
    const slides = await tx.objectStore('slides').index('episodeId').getAll(episodeId)
    for (const s of slides) {
      const ids = s.panelIds.filter((x) => keep.has(x))
      if (ids.length !== s.panelIds.length) await tx.objectStore('slides').put({ ...s, panelIds: ids })
    }
  }
  await tx.done
  const loose = removedPanels.map((p) => p.assetId).filter((x): x is string => !!x)
  if (loose.length) await keepLoose(episodeId, loose)
  const ep = await getEpisode(episodeId)
  const patch: Partial<Episode> = { panelsRevision: (ep?.panelsRevision ?? 0) + 1 }
  if (mode === 'replace') {
    patch.panelsBaseStoryRevision = storyRevision
    patch.needsReview = ep?.confirmedPanelRevision !== undefined
    patch.reviewReason = patch.needsReview ? '새 콘티 적용 — 재확인 필요' : undefined
  } else if (ep?.confirmedPanelRevision !== undefined) {
    patch.needsReview = true
    patch.reviewReason = '확정 이후 콘티가 수정됨 — 재확인 필요'
  }
  const episode = await patchEpisode(episodeId, patch)
  await logActivity(episodeId, operation, removedPanels.length ? { removedPanels } : undefined, episode.revision)
  return { episode, skipped, removedPanels }
}

export async function confirmPanels(ep: Episode) {
  const next = await patchEpisode(ep.id, {
    confirmedPanelRevision: ep.panelsRevision,
    needsReview: false,
    reviewReason: undefined,
    status: ['idea', 'story'].includes(ep.status) ? 'confirmed_panels' : ep.status,
  })
  await logActivity(ep.id, `콘티 확정 (r${ep.panelsRevision})`, { status: ep.status }, next.revision)
  return next
}

/** 에피소드의 이미지 제작 메모 (없는 항목은 설정 기본값) */
export function imageMemoOf(ep: Episode, s: CharacterSettings): ImageMemo {
  return { ...s.imageDefaults, ...ep.imageMemo }
}

/* ───────── Assets ───────── */

async function keepLoose(episodeId: string, assetIds: string[]) {
  const ep = await getEpisode(episodeId)
  if (!ep) return
  await patchEpisode(episodeId, { looseAssetIds: [...new Set([...(ep.looseAssetIds ?? []), ...assetIds])] })
}

/** 다른 곳에서 쓰지 않을 때만 파일 삭제 */
export async function deleteAssetIfUnused(id: string) {
  const used = await referencedAssetIds()
  if (!used.has(id)) await (await db()).delete('assets', id)
}

export const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_BYTES = 15 * 1024 * 1024

export async function validateImage(file: File): Promise<{ width: number; height: number }> {
  if (!ALLOWED_MIME.includes(file.type)) throw new Error(`지원하지 않는 형식이에요 (${file.type || '알 수 없음'}). PNG·JPEG·WebP만 가능합니다.`)
  if (file.size > MAX_BYTES) throw new Error(`파일이 15MB를 넘어요 (${(file.size / 1024 / 1024).toFixed(1)}MB).`)
  try {
    const bmp = await createImageBitmap(file)
    const r = { width: bmp.width, height: bmp.height }
    bmp.close()
    return r
  } catch {
    throw new Error('이미지를 읽을 수 없어요. 파일이 손상됐거나 형식이 확장자와 다를 수 있습니다.')
  }
}

export async function putAsset(file: File, purpose: Asset['purpose']): Promise<Asset> {
  const { width, height } = await validateImage(file)
  const a: Asset = { ...base(), blob: file, fileName: file.name, mimeType: file.type, byteSize: file.size, width, height, purpose }
  await (await db()).put('assets', a)
  return a
}

export async function getAsset(id: string) {
  return (await db()).get('assets', id)
}

export async function referencedAssetIds() {
  const d = await db()
  const ids = new Set<string>()
  for (const p of await d.getAll('panels')) if (p.assetId) ids.add(p.assetId)
  for (const s of await d.getAll('slides')) {
    if (s.assetId) ids.add(s.assetId)
    if (s.sourceAssetId) ids.add(s.sourceAssetId)
  }
  for (const e of await d.getAll('episodes')) {
    e.sourceAssetIds?.forEach((x) => ids.add(x))
    e.looseAssetIds?.forEach((x) => ids.add(x))
  }
  for (const st of await d.getAll('settings')) st.referenceAssetIds.forEach((x) => ids.add(x))
  return ids
}

/** 어디에서도 참조하지 않는 파일만 정리 */
export async function cleanupOrphanAssets() {
  const d = await db()
  const used = await referencedAssetIds()
  const keys = await d.getAllKeys('assets')
  let n = 0
  for (const k of keys) {
    if (!used.has(k)) {
      await d.delete('assets', k)
      n++
    }
  }
  return n
}

/* ───────── Slides & Publication ───────── */

export async function saveSlides(episodeId: string, slides: Slide[]) {
  const d = await db()
  const tx = d.transaction('slides', 'readwrite')
  const existing = await tx.store.index('episodeId').getAllKeys(episodeId)
  const keep = new Set(slides.map((s) => s.id))
  for (const k of existing) if (!keep.has(k)) await tx.store.delete(k)
  for (const [i, s] of slides.entries()) await tx.store.put({ ...s, order: i + 1, updatedAt: nowISO() })
  await tx.done
  broadcast('episode', episodeId)
}

export function newSlide(episodeId: string, order: number, kind: Slide['kind'], panelIds: string[] = [], assetId?: string): Slide {
  return { ...base(), episodeId, order, kind, panelIds, assetId, altText: '', isFinalImage: !!assetId }
}

export function newPublication(episodeId: string, sourceRevision: number): Publication {
  return {
    ...base(),
    episodeId,
    coverText: '',
    caption: '',
    question: '',
    includeQuestion: false,
    hashtags: [],
    includeHashtags: true,
    manuallyConfirmed: false,
    sourceRevision,
    orderConfirmed: false,
    checkDialogue: false,
    checkNames: false,
    history: [],
  }
}

export async function savePublication(p: Publication) {
  const next = { ...p, updatedAt: nowISO() }
  await (await db()).put('publications', next)
  return next
}

/* ───────── Drafts ───────── */

export async function saveDraft(dr: Omit<GenerationDraft, 'id' | 'createdAt' | 'updatedAt'>) {
  const full: GenerationDraft = { ...base(), ...dr }
  await (await db()).put('drafts', full)
  return full
}
export async function updateDraft(dr: GenerationDraft) {
  await (await db()).put('drafts', { ...dr, updatedAt: nowISO() })
}

/* ───────── Metrics ───────── */

export async function saveMetric(m: Metric) {
  await (await db()).put('metrics', { ...m, updatedAt: nowISO() })
}
export async function deleteMetric(id: string) {
  await (await db()).delete('metrics', id)
}
export function newMetric(episodeId: string, publishedAt?: string): Metric {
  const t = nowISO()
  const hrs = publishedAt ? Math.max(0, Math.round((Date.parse(t) - Date.parse(publishedAt)) / 3_600_000)) : undefined
  return { ...base(), episodeId, observedAt: t, hoursSincePost: hrs, values: {}, source: '인스타그램 인사이트(수동 확인)', note: '' }
}
export async function allMetrics() {
  return (await db()).getAll('metrics')
}
export async function allPublications() {
  return (await db()).getAll('publications')
}

/* ───────── Settings ───────── */

export function defaultSettings(): CharacterSettings {
  const t = nowISO()
  return {
    id: SETTINGS_ID,
    createdAt: t,
    updatedAt: t,
    revision: 0,
    characterName: '뚜구리',
    seriesName: '뚜구리툰',
    handle: '@ttuguri',
    introduction:
      '회사는 바뀌어도 별일은 계속된다. 여러 회사에서 직접 겪은 프리랜서 디자이너의 웃픈 실화.\n성격·고정 말투·시그니처 행동은 아직 미확정 — 임의로 만들지 않는다.',
    voiceRules:
      '한컷 또는 4컷. 한컷으로 충분한 이야기를 4컷으로 늘리지 않는다.\n짧은 대사, 건조한 유머, 작은 표정 변화, 시각적 반전. 한 컷에 대사 1~2문장.\n실제 한국 직장인이 쓰는 자연스럽고 짧은 구어체. 그림으로 보여줄 수 있는 것은 대사로 설명하지 않는다.\n4컷: 기(상황) → 승(진행) → 전(모순·반전 단서) → 결(공감·반전·허무한 결말). 각 컷에 핵심 행동 하나.',
    prohibitions:
      '실화에 없는 사건·대사를 사실처럼 쓰지 않기(각색은 표시)\n억지 교훈, 억지 감동, 과장된 악역, 설명형 마무리, 장황한 독백 금지\n결말 숨기기로 분량 늘리지 않기\n이미 만든 에피소드와 같은 농담 반복 금지\n회사·개인 식별 정보 익명화\n주변 인물은 얼굴·세부 특징을 생략한 익명 실루엣',
    styleNotes: '뚜구리는 화면 중심보다 약간 아래.\n이미지에는 글자·말풍선·제목을 넣지 않고 텍스트 여백을 확보.',
    imageDefaults: {
      ratio: '4:5',
      composition: '',
      placement: '',
      characterLook: 'Figma에서 확정한 기본 디자인 유지',
      extras: '얼굴 없는 익명 실루엣',
      background: '',
      direction: '',
      text: '이미지에는 넣지 않고 Figma에서 작업',
    },
    classifyRules: DEFAULT_CLASSIFY_RULES,
    referenceAssetIds: [],
    recurringExpressions: [],
  }
}

export const DEFAULT_CLASSIFY_RULES = `한 컷 개그: 하나의 상황만으로 웃기거나 공감 가능 → 한 장면 + 짧은 대사
4컷 실화툰: 사건의 시작·전개·반전이 있음 → 4컷 콘티
컷자막형 공감툰: 반전보다 공감·여운, 분위기 있는 이야기 → 2~4장, 장마다 자막 한 줄
연재 사연툰: 인물 관계나 갈등이 복잡하고 다음 이야기가 궁금함 → 2~7편 시리즈. 편마다 혼자 읽어도 웃겨야 함(대부분 처음 보는 사람이 한 편만 봄)
보류: 웃음 포인트나 핵심 메시지가 불명확 → 작가에게 질문 2개

성과 메모 (11/10 감사): 일상 속 몸으로 느끼는 불편함(추위·피곤·쉬고 싶음) 소재를 릴스로 올린 편이 평균 대비 7~12배 도달. 캐러셀·이미지는 1배 안팎. 공유는 친구에게 보내고 싶은 일상 소재에서만 나옴.`

export async function getSettings(): Promise<CharacterSettings> {
  const saved = await (await db()).get('settings', SETTINGS_ID)
  if (!saved) return defaultSettings()
  // 나중에 추가된 항목은 기본값으로 채운다
  const d = defaultSettings()
  return { ...d, ...saved, imageDefaults: { ...d.imageDefaults, ...saved.imageDefaults } }
}

export async function saveSettings(s: CharacterSettings) {
  const next = { ...s, id: SETTINGS_ID, revision: s.revision + 1, updatedAt: nowISO() }
  await (await db()).put('settings', next)
  broadcast('settings')
  return next
}
