'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { onBroadcast } from '@/lib/work/db'
import { getBundle, getSettings, patchEpisode, saveStoryEdit, savePanel, snapshotOf, type Bundle } from '@/lib/work/repo'
import { saver, useSaveState } from '@/lib/work/saver'
import { STAGES, STAGE_LABEL, STATUS_LABEL, fmtDateTime } from '@/lib/work/format'
import type { CharacterSettings, Episode, Panel, Stage, StoryVersion } from '@/lib/work/types'
import { CopyButton, Field, Notice } from './ui'
import { SaveIndicator } from './Backup'
import SourceStage from './SourceStage'
import StoryStage from './StoryStage'
import PanelsStage from './PanelsStage'
import ImagesStage from './ImagesStage'
import PublishStage from './PublishStage'
import QuickStage from './QuickStage'
import Preview from './Preview'

type Flash = { msg: string; kind: 'info' | 'ok' | 'warn' | 'error' }

export interface WS {
  b: Bundle
  ep: Episode
  story?: StoryVersion
  settings: CharacterSettings
  aiReady: boolean
  editEp: (patch: Partial<Episode>) => void
  editStory: (patch: Partial<StoryVersion>) => void
  editPanel: (id: string, patch: Partial<Panel>) => void
  /** 화면 상태만 갱신 (저장은 호출한 쪽이 따로 예약) */
  setLocal: (fn: (b: Bundle) => Bundle) => void
  /** 대기 중 저장을 끝낸 뒤 실행하고 다시 불러온다 */
  act: <T>(fn: () => Promise<T>, ok?: string) => Promise<T | undefined>
  reload: () => Promise<void>
  flash: (msg: string, kind?: Flash['kind']) => void
  goStage: (s: Stage) => void
}

const Ctx = createContext<WS | null>(null)
export const useWS = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('작업실 컨텍스트 없음')
  return v
}

/** 서버가 관리하는 필드만 반영 (사용자가 입력 중인 텍스트는 그대로) */
function syncServer(local: Episode, server: Episode): Episode {
  return {
    ...local,
    revision: server.revision,
    updatedAt: server.updatedAt,
    storyRevision: server.storyRevision,
    panelsRevision: server.panelsRevision,
    panelsBaseStoryRevision: server.panelsBaseStoryRevision,
    confirmedPanelRevision: server.confirmedPanelRevision,
    needsReview: server.needsReview,
    reviewReason: server.reviewReason,
    status: server.status,
    previousStatus: server.previousStatus,
    looseAssetIds: server.looseAssetIds,
  }
}

const EP_EDITABLE: (keyof Episode)[] = [
  'title', 'titleIsAuto', 'notes', 'situation', 'facts', 'emotions', 'humorPoint', 'unknowns', 'tags', 'purpose', 'format', 'stage', 'scheduledAt', 'links', 'sourceAssetIds', 'hookText', 'imageMemo', 'outputs',
]

export default function Workspace({ id, aiReady }: { id: string; aiReady: boolean }) {
  const router = useRouter()
  const sp = useSearchParams()
  const stage = (STAGES.includes(sp.get('stage') as Stage) ? sp.get('stage') : null) as Stage | null
  const [b, setB] = useState<Bundle | null | 'missing'>(null)
  const [settings, setSettings] = useState<CharacterSettings>()
  const [flash, setFlash] = useState<Flash>()
  const [otherTab, setOtherTab] = useState(false)
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit')
  const [loadErr, setLoadErr] = useState('')
  const ref = useRef<Bundle | null>(null)
  const saveState = useSaveState()

  const commit = useCallback((fn: (x: Bundle) => Bundle) => {
    if (!ref.current) return
    ref.current = fn(ref.current)
    setB(ref.current)
  }, [])

  const reload = useCallback(async () => {
    try {
      const [nb, st] = await Promise.all([getBundle(id), getSettings()])
      ref.current = nb
      setB(nb ?? 'missing')
      setSettings(st)
      setOtherTab(false)
    } catch (e) {
      setLoadErr((e as Error).message)
    }
  }, [id])

  useEffect(() => {
    reload()
    const f = sessionStorage.getItem('work-flash')
    if (f) {
      sessionStorage.removeItem('work-flash')
      setFlash({ msg: f, kind: 'warn' })
    }
    return onBroadcast((m) => {
      if (m.episodeId === id || m.kind === 'settings') setOtherTab(true)
    })
  }, [id, reload])

  const ws: WS | null =
    b && b !== 'missing' && settings
      ? {
          b,
          ep: b.episode,
          story: b.stories[b.stories.length - 1],
          settings,
          aiReady,
          editEp(patch) {
            commit((x) => ({ ...x, episode: { ...x.episode, ...patch } }))
            saver.schedule(`ep:${id}`, async () => {
              const cur = ref.current!.episode
              const fields = Object.fromEntries(EP_EDITABLE.map((k) => [k, cur[k]])) as Partial<Episode>
              const next = await patchEpisode(id, fields, cur.revision)
              commit((x) => ({ ...x, episode: syncServer(x.episode, next) }))
            })
          },
          editStory(patch) {
            const st = ref.current!.stories[ref.current!.stories.length - 1]
            if (!st) return
            commit((x) => ({ ...x, stories: x.stories.map((s) => (s.id === st.id ? { ...s, ...patch } : s)) }))
            saver.schedule(`story:${st.id}`, async () => {
              const cur = ref.current!.stories.find((s) => s.id === st.id)!
              const r = await saveStoryEdit(cur)
              commit((x) => ({ ...x, episode: syncServer(x.episode, r.episode) }))
            })
          },
          editPanel(pid, patch) {
            commit((x) => ({ ...x, panels: x.panels.map((p) => (p.id === pid ? { ...p, ...patch } : p)) }))
            saver.schedule(`panel:${pid}`, async () => {
              const cur = ref.current!.panels.find((p) => p.id === pid)
              if (!cur) return
              const r = await savePanel(cur, '직접 편집')
              commit((x) => ({
                ...x,
                panels: x.panels.map((p) => (p.id === pid ? { ...p, revision: r.panel.revision, updatedAt: r.panel.updatedAt } : p)),
                episode: r.episode ? syncServer(x.episode, r.episode) : x.episode,
              }))
            })
          },
          setLocal: commit,
          async act(fn, ok) {
            try {
              await saver.flush()
              const r = await saver.now(fn)
              await reload()
              if (ok) setFlash({ msg: ok, kind: 'ok' })
              return r
            } catch (e) {
              setFlash({ msg: (e as Error).message, kind: 'error' })
              await reload()
              return undefined
            }
          },
          reload,
          flash: (msg, kind = 'info') => setFlash({ msg, kind }),
          goStage(s) {
            saver.flush().finally(() => {
              router.replace(`/studio/work/${id}?stage=${s}`, { scroll: false })
              ws?.editEp({ stage: s })
              setFlash(undefined)
            })
          },
        }
      : null

  if (loadErr) return <Notice kind="error">불러오지 못했어요: {loadErr}</Notice>
  if (b === 'missing')
    return (
      <main className="wrap narrow">
        <section className="card empty-box">
          <h2>이 에피소드를 찾을 수 없어요</h2>
          <p className="muted small">삭제됐거나 다른 브라우저·기기에서 만든 에피소드일 수 있어요. 작업실 데이터는 이 브라우저에만 저장됩니다.</p>
          <Link href="/studio/work" className="btn primary">
            소재함으로
          </Link>
        </section>
      </main>
    )
  if (!ws) return <p className="muted small loading-line">불러오는 중…</p>

  const ep = ws.ep
  const cur = stage ?? ep.stage
  const unsaved = () =>
    JSON.stringify(
      { 제목: ep.title, 추가메모: ep.notes, 한줄상황: ep.situation, 이야기: ws.story, 컷: ws.b.panels.map((p, i) => ({ 컷: i + 1, ...snapshotOf(p) })) },
      null,
      2,
    )

  return (
    <Ctx.Provider value={ws}>
      <div className="ws">
        <header className="ws-top">
          <Link href="/studio/work" className="back" aria-label="소재함으로">
            ←
          </Link>
          <div className="ws-title">
            <label className="sr-only" htmlFor="ep-title">
              제목
            </label>
            <input
              id="ep-title"
              value={ep.title}
              onChange={(e) => ws.editEp({ title: e.target.value, titleIsAuto: false })}
              onBlur={() => saver.flush()}
            />
            <div className="ep-meta">
              <span className={`status s-${ep.status}`}>{STATUS_LABEL[ep.status]}</span>
              {ep.isSample && <span className="tag warn">샘플</span>}
              {ep.notionPageId && <span className="tag good">노션 연결</span>}
            </div>
          </div>
          <SaveIndicator />
        </header>

        <nav className="stage-tabs" aria-label="제작 단계">
          {STAGES.map((s, i) => (
            <button key={s} type="button" className={s === cur ? 'on' : ''} aria-current={s === cur ? 'step' : undefined} onClick={() => ws.goStage(s)}>
              <small>{i + 1}</small> {STAGE_LABEL[s]}
            </button>
          ))}
        </nav>

        {saveState === 'conflict' && (
          <Notice kind="error">
            다른 탭(또는 다른 작업)에서 이 에피소드가 먼저 바뀌어서 덮어쓰지 않았어요.
            <div className="row-inline">
              <CopyButton text={unsaved} label="내 입력 복사" className="small" />
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  saver.discardFailed()
                  reload()
                }}
              >
                최신 내용 다시 불러오기
              </button>
            </div>
          </Notice>
        )}
        {saveState === 'error' && <Notice kind="error">저장에 실패했어요: {saver.error} 입력한 내용은 화면에 남아 있어요. 위의 ‘다시 저장’을 눌러 주세요.</Notice>}
        {otherTab && saveState !== 'conflict' && (
          <Notice kind="warn">
            다른 탭에서 이 에피소드나 설정이 바뀌었어요.
            <div className="row-inline">
              <CopyButton text={unsaved} label="내 입력 복사" className="small" />
              <button type="button" className="btn small" onClick={() => saver.flush().then(reload)}>
                다시 불러오기
              </button>
            </div>
          </Notice>
        )}
        {ep.needsReview && (
          <Notice kind="warn">
            {ep.reviewReason || '콘티 재확인 필요'} {cur !== 'panels' && <button type="button" className="linklike" onClick={() => ws.goStage('panels')}>콘티로 이동</button>}
          </Notice>
        )}
        {ep.status === 'published' && <Notice>게시 완료된 편이에요. 여기서 고쳐도 실제 인스타 게시물에는 반영되지 않아요.</Notice>}
        {flash && (
          <div className="flash-wrap">
            <Notice kind={flash.kind}>{flash.msg}</Notice>
            <button type="button" className="btn ghost small" aria-label="알림 닫기" onClick={() => setFlash(undefined)}>
              ✕
            </button>
          </div>
        )}

        <div className="mobile-tabs" role="tablist" aria-label="보기 전환">
          <button type="button" role="tab" aria-selected={mobileTab === 'edit'} className={mobileTab === 'edit' ? 'on' : ''} onClick={() => setMobileTab('edit')}>
            편집
          </button>
          <button type="button" role="tab" aria-selected={mobileTab === 'preview'} className={mobileTab === 'preview' ? 'on' : ''} onClick={() => setMobileTab('preview')}>
            미리보기
          </button>
        </div>

        <div className={`ws-grid show-${mobileTab}`}>
          <aside className="ws-source" aria-label="원문">
            <Original />
          </aside>
          <section className="ws-main" aria-label={`${STAGE_LABEL[cur]} 편집`}>
            <StageView stage={cur} />
          </section>
          <aside className="ws-preview" aria-label="미리보기">
            <Preview stage={cur} />
          </aside>
        </div>
      </div>
    </Ctx.Provider>
  )
}

function StageView({ stage }: { stage: Stage }): ReactNode {
  switch (stage) {
    case 'quick':
      return <QuickStage />
    case 'source':
      return <SourceStage />
    case 'story':
      return <StoryStage />
    case 'panels':
      return <PanelsStage />
    case 'images':
      return <ImagesStage />
    case 'publish':
      return <PublishStage />
  }
}

function Original() {
  const ws = useWS()
  const ep = ws.ep
  // 휴대폰에서는 접어 두고, 넓은 화면에서는 항상 펼친다
  const [open, setOpen] = useState(true)
  useEffect(() => setOpen(!window.matchMedia('(max-width: 767px)').matches), [])
  return (
    <details className="original" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>원문 메모</summary>
      <blockquote className="memo-quote">{ep.originalMemo}</blockquote>
      <p className="muted small">{fmtDateTime(ep.createdAt)} 저장 · 원문은 바뀌지 않아요</p>
      <Field
        label="추가 메모 · 정정"
        value={ep.notes}
        onChange={(v) => ws.editEp({ notes: v })}
        onBlur={() => saver.flush()}
        placeholder="나중에 떠오른 사실이나 정정할 내용"
        hint="원문을 덮어쓰지 않고 여기에 쌓여요."
      />
      {ep.notionPageId && (
        <a className="small link" href={`https://www.notion.so/${ep.notionPageId.replace(/-/g, '')}`} target="_blank" rel="noreferrer">
          노션에서 열기
        </a>
      )}
    </details>
  )
}
