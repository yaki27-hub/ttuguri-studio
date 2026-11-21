'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createEpisode, getSettings, listEpisodes } from '@/lib/work/repo'
import { cardSettings, cardSystem } from '@/lib/work/cards'
import { ParseError, extractJSON } from '@/lib/work/prompts'
import { cardRecommendPrompt } from '../trends/actions'
import { aiDraft } from '../work/actions'
import { CopyButton, Notice } from '../work/_c/ui'

interface News {
  i: number
  title: string
  source: string
  url: string
  at?: string
}
interface Pick {
  title: string
  hook: string
  angle: string
  format: string
  sources: number[]
  check: string
  why: string
}

function parse(raw: unknown): Pick[] {
  const o = raw as { topics?: unknown }
  if (!o || !Array.isArray(o.topics)) throw new ParseError(['topics 배열이 없어요.'])
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const out = o.topics
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t) => ({
      title: s(t.title),
      hook: s(t.hook),
      angle: s(t.angle),
      format: s(t.format),
      sources: Array.isArray(t.sources) ? t.sources.map(Number).filter((n) => Number.isFinite(n)) : [],
      check: s(t.check),
      why: s(t.why),
    }))
    .filter((t) => t.title)
  if (!out.length) throw new ParseError(['추천이 하나도 없어요.'])
  return out.slice(0, 5)
}

/** 카드뉴스 채널의 소재 추천: 오늘 AI 소식에서 정보형 주제 3개 */
export default function CardRecommend({ aiReady }: { aiReady: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [news, setNews] = useState<News[]>([])
  const [picks, setPicks] = useState<Pick[]>([])
  const [paste, setPaste] = useState('')
  const [err, setErr] = useState('')

  async function prepare() {
    const s = await getSettings()
    const recent = (await listEpisodes()).filter((e) => e.contentType === 'cardnews').map((e) => e.title)
    const r = await cardRecommendPrompt({ system: cardSystem(s), recent, topics: cardSettings(s).topics ?? [] })
    setPrompt(r.prompt)
    setNews(r.news)
    return r.prompt
  }

  async function run() {
    setBusy(true)
    setErr('')
    setPicks([])
    try {
      const p = await prepare()
      if (!aiReady) return
      const r = await aiDraft(p)
      if (r.error) throw new Error(r.error)
      setPicks(parse(r.output))
    } catch (e) {
      setErr(e instanceof ParseError ? e.errors.join(' ') : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function make(t: Pick) {
    const src = t.sources.map((n) => news.find((x) => x.i === n)).filter((x): x is News => !!x)
    const memo = [
      `[카드뉴스 소재] ${t.title}`,
      t.angle,
      t.format && `형식: ${t.format}`,
      src.length ? `근거 소식:\n${src.map((n) => `- ${n.title} (${n.source}) ${n.url}`).join('\n')}` : '',
      t.check && `만들기 전에 확인할 것: ${t.check}`,
      '',
      '기사에서 확인한 내용을 여기에 덧붙여 주세요. 장 구성은 이 메모 범위 안에서만 써요.',
    ]
      .filter((x): x is string => typeof x === 'string')
      .join('\n')
    const ep = await createEpisode(memo, {
      contentType: 'cardnews',
      title: t.title.slice(0, 40),
      titleIsAuto: false,
      hookText: t.hook || undefined,
      links: src.map((n) => ({ id: crypto.randomUUID(), url: n.url, note: `${n.source} · ${n.title}` })),
    })
    router.push(`/studio/work/${ep.id}`)
  }

  return (
    <>
      <button type="button" className="btn primary block" disabled={busy} onClick={run}>
        {busy ? '오늘 AI 소식 읽는 중… (10~30초)' : picks.length ? '다시 추천 받기' : '카드뉴스 소재 3개 추천 받기'}
      </button>
      {!aiReady && (
        <Notice>
          AI 키가 없어서 추천 프롬프트만 만들어요. 위 버튼을 누른 뒤 프롬프트를 복사해 Claude·Gemini에 붙여넣고, 받은 JSON을 아래에 붙여넣으세요.
        </Notice>
      )}
      {err && <p className="flash bad">{err}</p>}
      {prompt && (
        <div className="row-inline wraps">
          <CopyButton text={prompt} label="추천 프롬프트 복사" className="small" />
          <span className="hint">오늘 AI 소식 {news.length}개를 넣었어요</span>
        </div>
      )}
      {prompt && !aiReady && (
        <div className="paste">
          <textarea rows={4} aria-label="추천 결과 JSON" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='{"topics": [...]}' />
          <button
            type="button"
            className="btn small"
            disabled={!paste.trim()}
            onClick={() => {
              try {
                setPicks(parse(extractJSON(paste)))
                setErr('')
              } catch (e) {
                setErr(e instanceof ParseError ? e.errors.join(' ') : (e as Error).message)
              }
            }}
          >
            결과 확인
          </button>
        </div>
      )}

      <div className="topic-list" aria-busy={busy}>
        {picks.map((t, k) => {
          const src = t.sources.map((n) => news.find((x) => x.i === n)).filter((x): x is News => !!x)
          return (
            <article key={k} className="topic">
              <div className="topic-tags">{t.format && <span className="tag">{t.format}</span>}</div>
              <h3>{t.title}</h3>
              {t.hook && (
                <p>
                  <b>표지</b> {t.hook}
                </p>
              )}
              {t.angle && <p>{t.angle}</p>}
              {src.length > 0 && (
                <ul className="small src-list">
                  {src.map((n) => (
                    <li key={n.i}>
                      <a className="link" href={n.url} target="_blank" rel="noreferrer">
                        {n.title}
                      </a>{' '}
                      <span className="muted">· {n.source}</span>
                    </li>
                  ))}
                </ul>
              )}
              {t.check && <p className="small warn-text">확인할 것: {t.check}</p>}
              {t.why && <p className="reason">💡 {t.why}</p>}
              <button type="button" className="btn block" onClick={() => make(t)}>
                이 소재로 카드뉴스 만들기 →
              </button>
            </article>
          )
        })}
      </div>
    </>
  )
}
