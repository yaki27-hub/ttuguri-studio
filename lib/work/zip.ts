import JSZip from 'jszip'
import { ALL_STORES, SCHEMA_VERSION, db, uid, type StoreName } from './db'
import { extOf, fmtDateTime, FORMAT_LABEL } from './format'
import { getAsset, cleanupOrphanAssets } from './repo'
import type { Bundle } from './repo'
import type { Asset, Publication, Slide } from './types'

/* ───────── 게시 패키지 ───────── */

export function finalCaption(p: Publication) {
  const parts = [p.caption.trim()]
  if (p.includeQuestion && p.question?.trim()) parts.push(p.question.trim())
  if (p.includeHashtags && p.hashtags.length) {
    const already = new Set((p.caption.match(/#[^\s#]+/g) ?? []).map((t) => t.slice(1)))
    const tags = [...new Set(p.hashtags)].filter((t) => !already.has(t))
    if (tags.length) parts.push(tags.map((t) => `#${t}`).join(' '))
  }
  return parts.filter(Boolean).join('\n\n')
}

export function storyboardMarkdown(b: Bundle) {
  const ep = b.episode
  const st = b.stories[b.stories.length - 1]
  const lines = [
    `# ${ep.title}`,
    '',
    `- 형식: ${FORMAT_LABEL[ep.format]}`,
    `- 내보낸 시각: ${fmtDateTime(new Date().toISOString())} (Asia/Seoul)`,
    ep.confirmedPanelRevision !== undefined ? `- 확정 콘티 revision: ${ep.confirmedPanelRevision}${ep.needsReview ? ' (확정 후 수정됨)' : ''}` : '- 콘티 미확정',
    '',
    '## 원문 메모',
    '',
    ep.originalMemo,
    '',
  ]
  if (st) {
    lines.push('## 이야기', '', `- 한 줄 요약: ${st.summary}`, `- 도입: ${st.opening}`)
    if (ep.format === 'four' || st.development) lines.push(`- 전개: ${st.development}`)
    lines.push(`- 웃음 지점: ${st.humor}`, `- 마무리: ${st.ending}`, '')
  }
  lines.push('## 콘티', '', '| 컷 | 화면 | 행동·표정 | 대사 | 속마음·내레이션 | 제작 메모 | 각색 |', '|---|---|---|---|---|---|---|')
  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, '<br>')
  b.panels.forEach((p, i) =>
    lines.push(`| ${i + 1} | ${cell(p.scene)} | ${cell(p.action)} | ${cell(p.dialogue)} | ${cell(p.narration)} | ${cell(p.productionNotes)} | ${cell(p.adaptationNotes)} |`),
  )
  return lines.join('\n') + '\n'
}

function altTextFile(slides: Slide[]) {
  return slides.map((s, i) => `${String(i + 1).padStart(2, '0')} ${s.kind === 'cover' ? '(표지)' : ''}\n${s.altText.trim() || '(대체텍스트 없음)'}`).join('\n\n') + '\n'
}

export interface PackageIssue {
  slide: number
  message: string
}

export async function checkSlides(slides: Slide[]): Promise<PackageIssue[]> {
  const issues: PackageIssue[] = []
  if (!slides.length) issues.push({ slide: 0, message: '슬라이드가 없어요.' })
  for (const [i, s] of slides.entries()) {
    if (!s.assetId) {
      issues.push({ slide: i + 1, message: '최종 이미지가 없어요.' })
      continue
    }
    const a = await getAsset(s.assetId)
    if (!a) {
      issues.push({ slide: i + 1, message: '연결된 파일을 찾을 수 없어요.' })
      continue
    }
    try {
      ;(await createImageBitmap(a.blob)).close()
    } catch {
      issues.push({ slide: i + 1, message: '이미지를 읽을 수 없어요.' })
    }
    if (!s.isFinalImage) issues.push({ slide: i + 1, message: '그림만 있는 이미지예요. 대사까지 넣은 최종 이미지인지 확인해 주세요.' })
  }
  return issues
}

export async function buildPublishZip(b: Bundle, pub: Publication) {
  const zip = new JSZip()
  for (const [i, s] of b.slides.entries()) {
    const a = s.assetId ? await getAsset(s.assetId) : undefined
    if (!a) throw new Error(`${i + 1}번 슬라이드 이미지가 없어요.`)
    zip.file(`${String(i + 1).padStart(2, '0')}.${extOf(a.mimeType)}`, a.blob)
  }
  zip.file('caption.txt', finalCaption(pub) + '\n')
  zip.file('alt-text.txt', altTextFile(b.slides))
  zip.file('storyboard.md', storyboardMarkdown(b))
  return zip.generateAsync({ type: 'blob' })
}

export async function buildTextDraftZip(b: Bundle, pub?: Publication) {
  const zip = new JSZip()
  zip.file('README.txt', '텍스트 초안입니다. 게시용 이미지가 포함되지 않았습니다.\n')
  zip.file('storyboard.md', storyboardMarkdown(b))
  if (pub) zip.file('caption.txt', finalCaption(pub) + '\n')
  if (b.slides.length) zip.file('alt-text.txt', altTextFile(b.slides))
  return zip.generateAsync({ type: 'blob' })
}

/* ───────── 백업·복원 ───────── */

type Row = Record<string, unknown> & { id: string; episodeId?: string }
type AssetMeta = Omit<Asset, 'blob'> & { path: string }

export async function exportBackup() {
  const d = await db()
  const zip = new JSZip()
  const data: Record<string, unknown[]> = {}
  for (const s of ALL_STORES) {
    if (s === 'assets') continue
    data[s] = await d.getAll(s)
  }
  const assets = await d.getAll('assets')
  const meta: AssetMeta[] = []
  for (const a of assets) {
    const { blob, ...rest } = a
    const path = `assets/${a.id}.${extOf(a.mimeType)}`
    zip.file(path, blob)
    meta.push({ ...rest, path })
  }
  zip.file(
    'backup.json',
    JSON.stringify({ kind: 'dduguri-studio-backup', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data, assets: meta }, null, 2),
  )
  return zip.generateAsync({ type: 'blob' })
}

export interface BackupContents {
  data: Record<StoreName, Row[]>
  assets: (AssetMeta & { blob: Blob })[]
  exportedAt: string
}

export async function readBackup(file: File): Promise<BackupContents> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error('ZIP 파일을 열 수 없어요.')
  }
  const jf = zip.file('backup.json')
  if (!jf) throw new Error(zip.file('caption.txt') ? '게시 패키지 ZIP이에요. 복원용 백업 ZIP을 선택해 주세요.' : 'backup.json이 없어요. 이 앱의 백업 파일이 아닙니다.')
  let parsed: { kind?: string; schemaVersion?: number; data?: Record<string, Row[]>; assets?: AssetMeta[]; exportedAt?: string }
  try {
    parsed = JSON.parse(await jf.async('string'))
  } catch {
    throw new Error('backup.json을 읽을 수 없어요.')
  }
  if (parsed.kind !== 'dduguri-studio-backup') throw new Error('이 앱의 백업 파일이 아니에요.')
  if (typeof parsed.schemaVersion !== 'number' || parsed.schemaVersion > SCHEMA_VERSION)
    throw new Error(`지원하지 않는 백업 버전이에요 (${parsed.schemaVersion}).`)
  const data = {} as Record<StoreName, Row[]>
  for (const s of ALL_STORES) {
    if (s === 'assets') continue
    const rows = parsed.data?.[s] ?? []
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r.id !== 'string')) throw new Error(`${s} 데이터 형식이 올바르지 않아요.`)
    data[s] = rows
  }
  const assets: BackupContents['assets'] = []
  for (const m of parsed.assets ?? []) {
    const f = zip.file(m.path)
    if (!f) throw new Error(`첨부 파일이 빠져 있어요: ${m.path}`)
    const buf = await f.async('arraybuffer')
    assets.push({ ...m, blob: new Blob([buf], { type: m.mimeType }) })
  }
  data.assets = []
  return { data, assets, exportedAt: parsed.exportedAt ?? '' }
}

export interface ImportSummary {
  episodes: number
  panels: number
  assets: number
  conflicts: number
  hasSettings: boolean
}

export async function summarize(b: BackupContents): Promise<ImportSummary> {
  const d = await db()
  const existing = new Set(await d.getAllKeys('episodes'))
  return {
    episodes: b.data.episodes.length,
    panels: b.data.panels.length,
    assets: b.assets.length,
    conflicts: b.data.episodes.filter((e) => existing.has(e.id)).length,
    hasSettings: b.data.settings.length > 0,
  }
}

export type ImportMode = 'merge' | 'replace'
export type ConflictPolicy = 'skip' | 'copy' | 'replace'

/** 하나의 트랜잭션으로 가져온다. 실패하면 기존 DB는 그대로 남는다. */
export async function importBackup(b: BackupContents, mode: ImportMode, policy: ConflictPolicy) {
  const d = await db()
  const existingEpisodes = new Set(await d.getAllKeys('episodes'))
  const existingAssets = new Set(await d.getAllKeys('assets'))
  const stores = [...ALL_STORES]
  const tx = d.transaction(stores, 'readwrite')

  if (mode === 'replace') for (const s of stores) await tx.objectStore(s).clear()

  // 에피소드 단위 충돌 처리
  const skipEp = new Set<string>()
  const idMap = new Map<string, string>() // copy 시 old → new
  if (mode === 'merge') {
    for (const e of b.data.episodes) {
      if (!existingEpisodes.has(e.id)) continue
      if (policy === 'skip') skipEp.add(e.id)
      if (policy === 'copy') idMap.set(e.id, uid())
      if (policy === 'replace') {
        for (const s of ['storyVersions', 'panels', 'panelVersions', 'slides', 'publications', 'drafts', 'activities', 'metrics'] as const) {
          const keys = await tx.objectStore(s).index('episodeId').getAllKeys(e.id)
          for (const k of keys) await tx.objectStore(s).delete(k)
        }
      }
    }
    if (policy === 'copy') {
      // 복사본에 속한 모든 하위 엔티티 id도 새로 발급
      for (const s of stores) {
        if (s === 'episodes' || s === 'settings' || s === 'assets') continue
        for (const r of b.data[s]) if (r.episodeId && idMap.has(r.episodeId)) idMap.set(r.id, uid())
      }
    }
  }
  const remap = (v: unknown): unknown => {
    if (typeof v === 'string') return idMap.get(v) ?? v
    if (Array.isArray(v)) return v.map(remap)
    if (v && typeof v === 'object' && !(v instanceof Blob)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)]))
    return v
  }

  let written = 0
  for (const s of stores) {
    if (s === 'assets') continue
    const store = tx.objectStore(s)
    for (const r of b.data[s]) {
      const epId = s === 'episodes' ? r.id : r.episodeId
      if (epId && skipEp.has(epId)) continue
      if (s === 'settings' && mode === 'merge' && policy !== 'replace' && (await store.get(r.id))) continue
      let row = idMap.size ? (remap(r) as Row) : r
      if (s === 'episodes' && idMap.has(r.id)) row = { ...row, title: `${String(row.title)} (복사본)` }
      await store.put(row as never)
      written++
    }
  }
  for (const a of b.assets) {
    const { path: _p, ...rest } = a
    // 같은 id의 파일은 같은 원본이므로 병합 시 기존 파일을 유지
    if (mode === 'merge' && policy !== 'replace' && existingAssets.has(a.id)) continue
    await tx.objectStore('assets').put(rest as Asset)
  }
  await tx.done
  await cleanupOrphanAssets()
  return written
}
