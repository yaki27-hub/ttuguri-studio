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
  Slide,
  StoryVersion,
} from './types'

export const SCHEMA_VERSION = 1

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
export const ALL_STORES = ['episodes', ...EPISODE_STORES, 'assets', 'settings'] as const
export type StoreName = (typeof ALL_STORES)[number]

let dbp: Promise<IDBPDatabase<DDDB>> | null = null

export function db() {
  if (!dbp) {
    dbp = openDB<DDDB>('dduguri-studio', 1, {
      upgrade(d) {
        d.createObjectStore('episodes', { keyPath: 'id' })
        for (const s of EPISODE_STORES) {
          const store = d.createObjectStore(s, { keyPath: 'id' })
          store.createIndex('episodeId', 'episodeId')
        }
        d.createObjectStore('assets', { keyPath: 'id' })
        d.createObjectStore('settings', { keyPath: 'id' })
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
