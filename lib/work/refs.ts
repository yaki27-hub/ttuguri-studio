import { broadcast, db, nowISO, uid } from './db'
import { getEpisode, patchEpisode } from './repo'
import type { RefFormat, RefPlatform, RefPostType, Reference } from './types'

export const REF_FORMAT_LABEL: Record<RefFormat, string> = {
  one: '한컷',
  three: '3컷',
  four: '4컷',
  carousel: '캐러셀',
  other: '기타',
}
export const REF_POST_TYPE_LABEL: Record<RefPostType, string> = { feed: '피드', reel: '릴스', carousel: '캐러셀' }
export const REF_PLATFORM_LABEL: Record<RefPlatform, string> = { instagram: 'Instagram', youtube: 'YouTube', etc: '기타' }
/** 기본 태그. 직접 적은 태그도 그대로 저장된다. */
export const REF_TAGS = ['회사생활', '일상', '개인 프로젝트']

/** 입력이 링크 하나뿐이면 그 링크를 돌려준다 (앞뒤 공백 허용) */
export function onlyUrl(text: string): string | null {
  const t = text.trim()
  if (!/^https?:\/\/\S+$/i.test(t)) return null
  try {
    new URL(t)
    return t
  } catch {
    return null
  }
}

/** 쿼리·#·끝 / 를 떼어 같은 게시물을 같은 링크로 본다 */
export function normalizeUrl(value: string) {
  const url = new URL(value.trim())
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('http 또는 https 링크만 저장할 수 있어요.')
  url.search = ''
  url.hash = ''
  // www.·m. 이 붙고 안 붙은 링크를 같은 게시물로 본다
  url.hostname = url.hostname.toLowerCase().replace(/^(www|m)\./, '')
  return url.toString().replace(/\/$/, '')
}

export function platformOf(url: string): RefPlatform {
  const h = new URL(url).hostname
  if (/(^|\.)instagram\.com$/.test(h)) return 'instagram'
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return 'youtube'
  return 'etc'
}

/** 인스타 링크에서 알 수 있는 게시물 유형 (/reel/ → 릴스) */
export function postTypeOf(url: string): RefPostType | undefined {
  if (/instagram\.com\/(reel|reels)\//.test(url)) return 'reel'
  return undefined
}

/** "3.4천", "15만", "1,200" → 숫자. 비었거나 못 읽으면 undefined */
export function parseCount(value: string): number | undefined {
  const t = value.replaceAll(',', '').replace(/\s/g, '')
  if (!t) return undefined
  const m = t.match(/^(\d+(?:\.\d+)?)(천|만|k|K|m|M)?$/)
  if (!m) return undefined
  const mul = { 천: 1e3, k: 1e3, K: 1e3, 만: 1e4, m: 1e6, M: 1e6 }[m[2] ?? ''] ?? 1
  return Math.round(Number(m[1]) * mul)
}

export function fmtCount(n?: number) {
  if (n === undefined) return '—'
  if (n >= 1e4) return `${+(n / 1e4).toFixed(1)}만`
  if (n >= 1e3) return `${+(n / 1e3).toFixed(1)}천`
  return String(n)
}

export type RefInput = Omit<Reference, 'id' | 'createdAt' | 'updatedAt' | 'url' | 'platform'> & { url: string; platform?: RefPlatform }

export class DuplicateRefError extends Error {
  constructor(public existing: Reference) {
    super('이미 저장한 레퍼런스예요.')
  }
}

export async function listReferences() {
  const d = await db()
  const all = await d.getAll('references')
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function findReferenceByUrl(url: string) {
  const d = await db()
  return d.getFromIndex('references', 'url', normalizeUrl(url))
}

export async function createReference(input: RefInput): Promise<Reference> {
  const url = normalizeUrl(input.url)
  const account = input.account.trim().replace(/^@/, '')
  if (!account) throw new Error('계정명을 입력해 주세요.')
  if (input.take.length > 100) throw new Error('뚜구리 버전은 100자 이내로 적어 주세요.')
  const d = await db()
  const dup = await d.getFromIndex('references', 'url', url)
  if (dup) throw new DuplicateRefError(dup)
  const t = nowISO()
  const ref: Reference = { ...input, id: uid(), createdAt: t, updatedAt: t, url, account, platform: input.platform ?? platformOf(url) }
  await d.put('references', ref)
  broadcast('references')
  return ref
}

export async function updateReference(ref: Reference) {
  const d = await db()
  const next = { ...ref, account: ref.account.trim().replace(/^@/, ''), updatedAt: nowISO() }
  await d.put('references', next)
  broadcast('references')
  return next
}

/** 레퍼런스를 지우고, 연결된 에피소드에서도 뗀다 */
export async function deleteReference(id: string) {
  const d = await db()
  const eps = await d.getAll('episodes')
  for (const e of eps) {
    if (e.referenceIds?.includes(id)) await patchEpisode(e.id, { referenceIds: e.referenceIds.filter((x) => x !== id) })
  }
  await d.delete('references', id)
  broadcast('references')
}

/** 저장된 최신 에피소드를 읽어 연결한다 (편집 중인 값은 먼저 저장해 둘 것) */
export async function linkReference(episodeId: string, refId: string) {
  const ep = await getEpisode(episodeId)
  if (!ep) throw new Error('에피소드를 찾을 수 없습니다.')
  const cur = ep.referenceIds ?? []
  if (cur.includes(refId)) return
  await patchEpisode(ep.id, { referenceIds: [...cur, refId] })
}

export async function unlinkReference(episodeId: string, refId: string) {
  const ep = await getEpisode(episodeId)
  if (!ep) return
  await patchEpisode(ep.id, { referenceIds: (ep.referenceIds ?? []).filter((x) => x !== refId) })
}

export function refTitle(r: Reference) {
  return r.take || r.note.split('\n')[0] || r.caption.split('\n')[0] || '저장한 레퍼런스'
}
