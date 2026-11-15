import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  Activity,
  Asset,
  CharacterSettings,
  Episode,
  GenerationDraft,
  Metric,
  Panel,
  PanelVersion,
  Publication,
  Reference,
  Slide,
  StoryVersion,
} from './types'

export const SCHEMA_VERSION = 2

interface ByEpisode<T> {
  key: string
  value: T
  indexes: { episodeId: string }
}

interface DDDB extends DBSchema {
  episodes: { key: string; value: Episode }
  storyVersions: ByEpisode<StoryVersion>
  panels: ByEpisode<Panel>
  panelVersions: ByEpisode<PanelVersion>
  slides: ByEpisode<Slide>
  publications: ByEpisode<Publication>
  drafts: ByEpisode<GenerationDraft>
  activities: ByEpisode<Activity>
  metrics: ByEpisode<Metric>
  assets: { key: string; value: Asset }
  settings: { key: string; value: CharacterSettings }
  references: { key: string; value: Reference; indexes: { url: string } }
}

export const EPISODE_STORES = [
  'storyVersions',
  'panels',
  'panelVersions',
  'slides',
  'publications',
  'drafts',
  'activities',
  'metrics',
] as const
export type EpisodeStore = (typeof EPISODE_STORES)[number]
export const ALL_STORES = ['episodes', ...EPISODE_STORES, 'assets', 'settings', 'references'] as const
export type StoreName = (typeof ALL_STORES)[number]

let dbp: Promise<IDBPDatabase<DDDB>> | null = null

export function db() {
  if (!dbp) {
    dbp = openDB<DDDB>('dduguri-studio', 2, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore('episodes', { keyPath: 'id' })
          for (const s of EPISODE_STORES) {
            const store = d.createObjectStore(s, { keyPath: 'id' })
            store.createIndex('episodeId', 'episodeId')
          }
          d.createObjectStore('assets', { keyPath: 'id' })
          d.createObjectStore('settings', { keyPath: 'id' })
        }
        if (oldVersion < 2) {
          d.createObjectStore('references', { keyPath: 'id' }).createIndex('url', 'url')
        }
      },
      // 다른 탭이 옛 버전으로 열고 있으면 새로고침 전까지 기다린다
      blocked() {
        console.warn('다른 탭을 닫거나 새로고침해 주세요.')
      },
    })
  }
  return dbp
}

export type DB = IDBPDatabase<DDDB>

export const uid = () => crypto.randomUUID()
export const nowISO = () => new Date().toISOString()

export function isQuotaError(e: unknown) {
  return e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
}

export class ConflictError extends Error {
  constructor() {
    super('다른 탭이나 작업에서 먼저 변경되었습니다.')
  }
}

/** 탭 간 변경 알림 */
export const TAB_ID = uid()
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('dduguri-studio') : null
export interface ChangeMsg {
  tab: string
  episodeId?: string
  kind: string
}
export function broadcast(kind: string, episodeId?: string) {
  channel?.postMessage({ tab: TAB_ID, kind, episodeId } satisfies ChangeMsg)
}
export function onBroadcast(fn: (m: ChangeMsg) => void) {
  if (!channel) return () => {}
  const h = (e: MessageEvent<ChangeMsg>) => {
    if (e.data.tab !== TAB_ID) fn(e.data)
  }
  channel.addEventListener('message', h)
  return () => channel.removeEventListener('message', h)
}
