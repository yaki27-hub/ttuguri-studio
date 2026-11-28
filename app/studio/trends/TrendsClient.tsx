'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { getSettings, saveSettings } from '@/lib/work/repo'
import { useRouter } from 'next/navigation'
import { DuplicateRefError, createReference, fmtCount, listReferences, normalizeUrl } from '@/lib/work/refs'
import { onBroadcast, uid } from '@/lib/work/db'
import { fmtDate } from '@/lib/work/format'
import type { CharacterSettings, Topic } from '@/lib/work/types'
import { loadTrending, loadWatchlist, translatePost } from './actions'
import { episodeFromTranslation, type Translation } from '@/lib/work/translated'
import { matchTopics as matchAny } from '@/lib/topics'
import { Notice } from '../work/_c/ui'
import AiNews from './AiNews'
import HookLibrary from './HookLibrary'
import AccountAnalysis from './AccountAnalysis'
import SeasonCalendar from './SeasonCalendar'
import DailyReport from './DailyReport'

interface Trend {
  title: string
  traffic: number
  trafficText: string
  at: string
  url: string
  news: { title: string; url: string; source: string }[]
}
interface Post {
  id: string
  permalink: string
  caption: string
  timestamp: string
  type: 'reel' | 'carousel' | 'feed'
  likes: number | null
  comments: number | null
  thumb: string
}
interface Account {
  username: string
  name?: string
  followers?: number | null
  error?: string
  media: Post[]
}

const TYPE_LABEL = { reel: '릴스', carousel: '캐러셀', feed: '피드' }
const DAY = 864e5

const matchTopics = (text: string, topics: Topic[]): Topic[] => matchAny(text, topics)

export default function TrendsClient({ igReady, channel = 'toon' }: { igReady: boolean; channel?: 'toon' | 'card' }) {
  const card = channel === 'card'
  const [settings, setSettings] = useState<CharacterSettings>()
  // 새로고침: 아래 섹션을 모두 다시 그려서 급상승·워치리스트·매일 리포트를 새로 불러온다
  const [refresh, setRefresh] = useState(0)
  // 채널마다 토픽·워치리스트를 따로 둔다 (카드뉴스는 settings.cardnews 안에)
  const topics = (card ? settings?.cardnews?.topics : settings?.topics) ?? []
  const watch = (card ? settings?.cardnews?.watchlist : settings?.watchlist) ?? []

  async function patchSettings(patch: { topics?: Topic[]; watchlist?: string[] }) {
    const cur = await getSettings()
    const next = card ? { ...cur, cardnews: { ...cur.cardnews!, ...patch } } : { ...cur, ...patch }
    setSettings(await saveSettings(next))
  }

  useEffect(() => {
    const load = () => getSettings().then(setSettings)
    load()
    return onBroadcast((m) => m.kind === 'settings' && load())
  }, [])

  return (
    <>
      <header className="sub-top">
        <h1>소재 찾기</h1>
        <button type="button" className="btn small" onClick={() => setRefresh((n) => n + 1)} title="급상승·워치리스트·매일 리포트를 다시 불러와요">
          ↻ 새로고침
        </button>
      </header>
      <p className="muted small intro">
        {card ? '오늘 AI 소식, 뜨는 검색어, 지켜보는 AI 계정의 새 게시물을 한곳에서 봐요.' : '오늘 뜨는 검색어와 지켜보는 인스타툰 계정의 새 게시물을 한곳에서 봐요.'} 마음에 드는 게시물은 ⭐로 레퍼런스 보드에 담고, 거기서 뜯어보기 → 변주로 이어가세요.
      </p>
      {settings && (
        <>
        <div className="finder" key={refresh}>
          <div className="finder-trend">
            {!card && <SeasonCalendar channel={channel} />}
            <TrendingSection topics={topics} />
          </div>
          <div className="finder-watch">
            {!card && <DailyReport />}
            {card ? <AiNews topics={topics} /> : <HookLibrary />}
            <WatchSection igReady={igReady} watch={watch} topics={topics} channel={channel} onWatch={(w) => patchSettings({ watchlist: w })} />
            {card && <AccountAnalysis igReady={igReady} watch={watch} onWatch={(w) => patchSettings({ watchlist: w })} />}
          </div>
          <div className="finder-topics">
            <TopicEditor topics={topics} onSave={(t) => patchSettings({ topics: t })} />
          </div>
        </div>
        </>
      )}
    </>
  )
}

/* ───────── 오늘 급상승 ───────── */

function TrendingSection({ topics }: { topics: Topic[] }) {
  const [geo, setGeo] = useState<'KR' | 'US'>('KR')
  const [data, setData] = useState<{ items: Trend[]; error?: string }>()
  const [filter, setFilter] = useState<string>('mine')

  useEffect(() => {
    setData(undefined)
    loadTrending(geo).then((r) => setData(r as { items: Trend[]; error?: string }))
  }, [geo])

  const rows = useMemo(
    () =>
      (data?.items ?? []).map((t) => ({ ...t, hits: matchTopics([t.title, ...t.news.map((n) => n.title)].join(' '), topics) })),
    [data, topics],
  )
  const mineCount = rows.filter((r) => r.hits.length).length
  const shown = filter === 'all' ? rows : filter === 'mine' ? rows.filter((r) => r.hits.length) : rows.filter((r) => r.hits.some((h) => h.id === filter))

  return (
    <section className="card">
      <div className="card-head">
        <h2>🔥 오늘 급상승</h2>
        <div className="seg mini" role="group" aria-label="지역">
          {(
            [
              ['KR', '한국'],
              ['US', '글로벌'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" className={geo === v ? 'on' : ''} aria-pressed={geo === v} onClick={() => setGeo(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">Google 트렌드 실시간 검색어예요. 내 토픽 키워드에 걸린 것부터 보여줘요. 소재 추천 AI도 이 목록을 참고해요.</p>
      <div className="chips" role="group" aria-label="토픽 필터">
        {[
          ['mine', `내 토픽 ${mineCount}`],
          ['all', `전체 ${rows.length}`],
          ...topics.map((t) => [t.id, t.name]),
        ].map(([k, l]) => (
          <button key={k} type="button" className={`chip ${filter === k ? 'on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>
      {!data && <p className="muted small">불러오는 중…</p>}
      {data?.error && <Notice kind="error">급상승 검색어를 못 불러왔어요: {data.error}</Notice>}
      {data && !data.error && shown.length === 0 && (
        <div className="empty-box">
          <p className="muted small">{filter === 'mine' ? '지금은 내 토픽에 걸린 검색어가 없어요. 전체를 훑어보거나 아래에서 키워드를 늘려 보세요.' : '조건에 맞는 검색어가 없어요.'}</p>
          {filter !== 'all' && (
            <button type="button" className="btn small" onClick={() => setFilter('all')}>
              전체 보기
            </button>
          )}
        </div>
      )}
      <ul className="trend-list">
        {shown.map((t) => (
          <li key={t.title} className="trend">
            <div className="trend-head">
              <a className="trend-title" href={t.url} target="_blank" rel="noreferrer">
                {t.title}
              </a>
              <span className="muted small">{t.trafficText}</span>
            </div>
            {t.hits.length > 0 && (
              <span className="ep-meta">
                {t.hits.map((h) => (
                  <span key={h.id} className="tag good">
                    {h.name}
                  </span>
                ))}
              </span>
            )}
            {t.news[0] && (
              <a className="small muted clamp link" href={t.news[0].url} target="_blank" rel="noreferrer">
                {t.news[0].title} · {t.news[0].source} ↗
              </a>
            )}
          </li>
        ))}
      </ul>
      <p className="hint">
        이걸 소재로 바로 쓰고 싶으면{' '}
        <Link className="link" href="/studio/recommend">
          소재 추천 받기
        </Link>
        에서 오늘 검색어를 섞은 추천을 받을 수 있어요.
      </p>
    </section>
  )
}

/* ───────── 워치리스트 ───────── */

function WatchSection({ igReady, watch, topics, onWatch, channel }: { igReady: boolean; watch: string[]; topics: Topic[]; onWatch: (w: string[]) => void; channel: 'toon' | 'card' }) {
  const [data, setData] = useState<{ accounts: Account[]; error?: string; at?: number }>()
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [who, setWho] = useState('')
  const [days, setDays] = useState(30)
  const [sort, setSort] = useState<'likes' | 'comments' | 'recent'>('likes')
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState('')

  const refreshSaved = () => listReferences().then((rs) => setSaved(new Set(rs.map((r) => r.url))))
  useEffect(() => {
    refreshSaved()
    return onBroadcast((m) => m.kind === 'references' && refreshSaved())
  }, [])

  async function load(list = watch) {
    if (!igReady || !list.length) return
    setBusy(true)
    setData((await loadWatchlist(list, channel)) as typeof data)
    setBusy(false)
  }
  useEffect(() => {
    load()
    // 처음 한 번만 자동으로 불러온다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function add() {
    const names = input
      .split(/[\s,]+/)
      .map((x) => x.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').toLowerCase())
      .filter((x) => /^[a-z0-9._]{1,30}$/.test(x) && !watch.includes(x))
    if (!names.length) return setMsg('계정명을 확인해 주세요. 예) dduguri_toon')
    const next = [...watch, ...names]
    onWatch(next)
    setInput('')
    setMsg('')
    load(next)
  }

  const posts = useMemo(() => {
    const since = Date.now() - days * DAY
    const all = (data?.accounts ?? []).flatMap((a) => a.media.map((m) => ({ ...m, account: a.username })))
    const list = all.filter((p) => (!who || p.account === who) && (days === 0 || Date.parse(p.timestamp) >= since))
    if (sort === 'recent') return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    const k = sort
    return list.sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1))
  }, [data, who, days, sort])

  const failed = (data?.accounts ?? []).filter((a) => a.error)

  const router = useRouter()
  const [busyPost, setBusyPost] = useState('')

  /** 해외 게시물 → 장별 글자·캡션 번역 → 카드뉴스 작업 (번역본은 ‘기사 읽기’에 들어간다) */
  async function translate(p: Post & { account: string }) {
    setBusyPost(p.id)
    setMsg('')
    try {
      const r = await translatePost(p.account, p.id, channel)
      if (r.error || !r.post) throw new Error(r.error || '게시물을 가져오지 못했어요.')
      const ep = await episodeFromTranslation(r as Translation)
      router.push(`/studio/work/${ep.id}?stage=source`)
    } catch (e) {
      setMsg(`번역하지 못했어요: ${(e as Error).message}`)
      setBusyPost('')
    }
  }

  async function star(p: Post & { account: string }) {
    try {
      await createReference({
        url: p.permalink,
        account: p.account,
        postType: p.type,
        format: p.type === 'carousel' ? 'carousel' : undefined,
        tags: matchTopics(p.caption, topics).map((t) => t.name),
        likes: p.likes ?? undefined,
        comments: p.comments ?? undefined,
        views: undefined,
        metricsAt: new Date().toISOString(),
        metricsSource: 'Instagram API',
        take: '',
        note: '',
        caption: p.caption,
        channel,
      })
      setMsg(`@${p.account} 게시물을 레퍼런스 보드에 담았어요.`)
    } catch (e) {
      setMsg(e instanceof DuplicateRefError ? '이미 보드에 있는 게시물이에요.' : `담지 못했어요: ${(e as Error).message}`)
    }
    refreshSaved()
  }

  const isSaved = (url: string) => {
    try {
      return saved.has(normalizeUrl(url))
    } catch {
      return false
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>👀 워치리스트</h2>
        {igReady && watch.length > 0 && (
          <button type="button" className="btn small" disabled={busy} onClick={() => load()}>
            {busy ? '불러오는 중…' : '새로고침'}
          </button>
        )}
      </div>
      <p className="muted small">따라 보고 싶은 {channel === 'card' ? 'AI·카드뉴스' : '인스타툰'} 계정을 등록하면 최근 게시물이 반응 순으로 모여요. 비즈니스·크리에이터 계정만 볼 수 있어요.</p>

      <form
        className="row-inline"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input aria-label="계정 추가" placeholder="@계정명 또는 프로필 링크" value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" className="btn small primary" disabled={!input.trim()}>
          추가
        </button>
      </form>
      {watch.length > 0 && (
        <div className="chips watch-chips">
          <button type="button" className={`chip ${who === '' ? 'on' : ''}`} aria-pressed={who === ''} onClick={() => setWho('')}>
            전체
          </button>
          {watch.map((u) => (
            <span key={u} className={`chip ${who === u ? 'on' : ''}`}>
              <button type="button" className="chip-in" aria-pressed={who === u} onClick={() => setWho(who === u ? '' : u)}>
                @{u}
              </button>
              <button type="button" className="chip-x" aria-label={`@${u} 빼기`} onClick={() => (onWatch(watch.filter((x) => x !== u)), who === u && setWho(''))}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      {msg && <p className="flash">{msg}</p>}

      {!igReady && <Notice kind="warn">인스타 토큰이 연결된 배포 사이트에서만 불러올 수 있어요. 계정 목록은 지금 등록해 둘 수 있어요.</Notice>}
      {igReady && watch.length === 0 && <p className="muted small">아직 등록한 계정이 없어요.</p>}
      {data?.error && <Notice kind="error">{data.error}</Notice>}
      {failed.length > 0 && (
        <Notice kind="warn">
          {failed.map((a) => (
            <div key={a.username} className="small">
              @{a.username}: {a.error}
            </div>
          ))}
        </Notice>
      )}

      {data && !data.error && (
        <>
          <div className="filters">
            <select aria-label="기간" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>최근 7일</option>
              <option value={30}>최근 30일</option>
              <option value={0}>전체</option>
            </select>
            <select aria-label="정렬" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="likes">좋아요순</option>
              <option value="comments">댓글순</option>
              <option value="recent">최신순</option>
            </select>
          </div>
          {posts.length === 0 && <p className="muted small">이 기간에 올라온 게시물이 없어요.</p>}
          <ul className="wl-grid">
            {posts.map((p) => {
              const fresh = Date.now() - Date.parse(p.timestamp) < DAY
              const on = isSaved(p.permalink)
              return (
                <li key={p.id} className="wl-post">
                  <a href={p.permalink} target="_blank" rel="noreferrer" className="wl-thumb">
                    {p.thumb ? <img src={p.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="muted small">미리보기 없음</span>}
                    {fresh && <span className="tag hot new">NEW</span>}
                  </a>
                  <div className="wl-body">
                    <span className="ref-account">@{p.account}</span>
                    <span className="small muted">
                      {TYPE_LABEL[p.type]} · {fmtDate(p.timestamp)}
                    </span>
                    <span className="small">
                      ♥ {p.likes === null ? '숨김' : fmtCount(p.likes)} · 💬 {fmtCount(p.comments ?? undefined)}
                    </span>
                    {p.caption && <span className="small muted clamp">{p.caption}</span>}
                    <button type="button" className={`btn small ${on ? '' : 'primary'}`} disabled={on} onClick={() => star(p)}>
                      {on ? '★ 보드에 있음' : '⭐ 보드에 담기'}
                    </button>
                    {channel === 'card' && p.type !== 'reel' && (
                      <button type="button" className="btn small" disabled={!!busyPost} onClick={() => translate(p)}>
                        {busyPost === p.id ? '읽고 번역하는 중… (20~40초)' : '🌐 번역해서 카드뉴스로'}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {data.at && <p className="hint">불러온 시각 {new Date(data.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</p>}
        </>
      )}
    </section>
  )
}

/* ───────── 토픽 설정 ───────── */

function TopicEditor({ topics, onSave }: { topics: Topic[]; onSave: (t: Topic[]) => Promise<void> }) {
  const [draft, setDraft] = useState(() => topics.map((t) => ({ ...t, text: t.keywords.join(', ') })))
  const [msg, setMsg] = useState('')
  useEffect(() => setDraft(topics.map((t) => ({ ...t, text: t.keywords.join(', ') }))), [topics])

  return (
    <section className="card">
      <details>
        <summary className="card-head summary-head">
          <h2>⚙️ 내 토픽</h2>
          <span className="muted small">{topics.map((t) => t.name).join(' · ') || '없음'}</span>
        </summary>
        <p className="muted small">급상승 검색어와 워치리스트 캡션을 이 키워드로 골라 봐요. 레퍼런스로 담을 때 태그도 자동으로 붙어요.</p>
        <ul className="topic-edit">
          {draft.map((t, i) => (
            <li key={t.id}>
              <input aria-label="토픽 이름" value={t.name} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <textarea aria-label={`${t.name} 키워드`} rows={2} value={t.text} placeholder="키워드, 쉼표로 구분" onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
              <button type="button" className="btn ghost small danger-text" onClick={() => setDraft(draft.filter((_, j) => j !== i))}>
                삭제
              </button>
            </li>
          ))}
        </ul>
        <div className="row-inline">
          <button type="button" className="btn small" onClick={() => setDraft([...draft, { id: uid(), name: '새 토픽', keywords: [], text: '' }])}>
            + 토픽 추가
          </button>
          <button
            type="button"
            className="btn small primary"
            onClick={async () => {
              const next = draft
                .map(({ text, ...t }) => ({ ...t, name: t.name.trim(), keywords: [...new Set(text.split(/[,\n]/).map((k) => k.trim()).filter(Boolean))] }))
                .filter((t) => t.name)
              await onSave(next)
              setMsg('토픽을 저장했어요.')
            }}
          >
            저장
          </button>
          {msg && <span className="hint">{msg}</span>}
        </div>
      </details>
    </section>
  )
}
