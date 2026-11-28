'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createEpisode, listEpisodes } from '@/lib/work/repo'
import { extractJSON } from '@/lib/work/prompts'
import {
  DEFAULT_BRIEF,
  isShareIdea,
  listSavedReports,
  parseDailyReport,
  patternsFromTags,
  todayKST,
  type Conti,
  type Idea,
  type SavedReport,
} from '@/lib/work/dailyReport'
import { dailyBriefSave, dailyReportAnswer, dailyReportPrompt, dailyReportRun, dailyReportSave, dailyReportsLoad } from './actions'

const VIA_LABEL: Record<SavedReport['via'], string> = { auto: '아침 7시 자동 조사', ai: '직접 조사', paste: '붙여넣기' }

/** 소재 찾기: 매일 소재 리포트 (매일 아침 7시 서버가 조사 → 소재 10개 → 오늘의 질문 → 콘티) */
export default function DailyReport() {
  const router = useRouter()
  const today = todayKST()
  const [saved, setSaved] = useState<SavedReport[]>([])
  const [loaded, setLoaded] = useState(false)
  const [date, setDate] = useState(today)
  const [brief, setBrief] = useState(DEFAULT_BRIEF)
  const [savedBrief, setSavedBrief] = useState(DEFAULT_BRIEF)
  const [episodes, setEpisodes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [paste, setPaste] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [making, setMaking] = useState('')
  const [answer, setAnswer] = useState('')

  const upsert = (rec: SavedReport) => setSaved((list) => [rec, ...list.filter((x) => x.date !== rec.date)].sort((a, b) => b.date.localeCompare(a.date)))

  useEffect(() => {
    listEpisodes().then((eps) => setEpisodes(eps.map((e) => [e.title, e.hookText].filter(Boolean).join(' — '))))
    ;(async () => {
      const r = (await dailyReportsLoad()) as { reports: SavedReport[]; brief: string; error?: string }
      let list = r.reports ?? []
      if (r.error) setMsg({ ok: false, text: r.error })
      // 예전에 이 브라우저에만 저장한 리포트는 서버로 옮긴다
      const local = listSavedReports().filter((x) => !list.some((y) => y.date === x.date))
      if (!r.error && local.length) {
        const moved = await Promise.all(local.map((x) => dailyReportSave(x).then((m) => (m as { saved?: SavedReport }).saved)))
        list = [...list, ...moved.filter((x): x is SavedReport => !!x)].sort((a, b) => b.date.localeCompare(a.date))
        try {
          localStorage.removeItem('ddg.dailyReports')
        } catch {}
      }
      setSaved(list)
      if (r.brief) {
        setBrief(r.brief)
        setSavedBrief(r.brief)
      }
      setAnswer(list.find((x) => x.date === today)?.answer ?? '')
      setLoaded(true)
    })()
  }, [today])

  const cur = saved.find((r) => r.date === date)

  function shown(rec: SavedReport) {
    upsert(rec)
    setDate(rec.date)
    setAnswer(rec.answer ?? '')
  }

  async function runAI() {
    setBusy(true)
    setMsg(undefined)
    try {
      const r = (await dailyReportRun(episodes)) as { saved?: SavedReport; error?: string }
      if (r.error || !r.saved) return setMsg({ ok: false, text: r.error || '저장하지 못했어요.' })
      shown(r.saved)
      setMsg({ ok: true, text: '오늘 리포트를 저장했어요.' })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    const { prompt } = (await dailyReportPrompt(episodes)) as { prompt: string }
    await navigator.clipboard.writeText(prompt)
    setShowPaste(true)
    setMsg({ ok: true, text: '프롬프트를 복사했어요. 웹 검색이 되는 Claude·ChatGPT에 붙여넣고, 받은 JSON을 아래에 붙여넣어 주세요.' })
  }

  async function applyPaste() {
    try {
      const report = parseDailyReport(extractJSON(paste))
      const r = (await dailyReportSave({ date: today, via: 'paste', report, answer: saved.find((x) => x.date === today)?.answer ?? '' })) as { saved?: SavedReport; error?: string }
      if (r.error || !r.saved) return setMsg({ ok: false, text: r.error || '저장하지 못했어요.' })
      shown(r.saved)
      setPaste('')
      setShowPaste(false)
      setMsg({ ok: true, text: '오늘 리포트를 저장했어요.' })
    } catch (e) {
      setMsg({ ok: false, text: `읽지 못했어요: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  async function saveAnswer() {
    if (!cur || (cur.answer ?? '') === answer) return
    const r = (await dailyReportAnswer(cur.date, answer)) as { saved?: SavedReport; error?: string }
    if (r.saved) upsert(r.saved)
    else setMsg({ ok: false, text: `답을 저장하지 못했어요: ${r.error}` })
  }

  async function keepBrief(text: string) {
    if (text === savedBrief) return
    const r = (await dailyBriefSave(text)) as { brief?: string; error?: string }
    if (r.brief) setSavedBrief(r.brief)
    else setMsg({ ok: false, text: `기준을 저장하지 못했어요: ${r.error}` })
  }

  async function make(key: string, memo: string, extra: Parameters<typeof createEpisode>[1]) {
    setMaking(key)
    try {
      const ep = await createEpisode(memo, extra)
      router.push(`/studio/work/${ep.id}`)
    } finally {
      setMaking('')
    }
  }

  const makeIdea = (i: Idea, conti?: Conti) =>
    make(
      conti ? `c:${i.title}` : i.title,
      [
        `[매일 소재 ${date}] ${i.title}`,
        `공감 포인트: ${i.point}`,
        `시각적 웃음: ${i.visual}`,
        conti && contiText(conti),
        '※ AI가 만든 아이디어예요. 실제 겪은 일로 바꿔 채워 주세요.',
      ]
        .filter(Boolean)
        .join('\n'),
      {
        title: i.title,
        titleIsAuto: false,
        hookText: i.title,
        format: i.cuts === '한컷' ? 'single' : 'four',
        patterns: patternsFromTags(i.tags),
        role: isShareIdea(i) ? 'reach' : undefined,
        tags: [i.category || '회사생활'].filter(Boolean),
      },
    )

  const r = cur?.report
  const ideas = r ? [...r.ideas].sort((a, b) => a.priority - b.priority) : []

  return (
    <section className="card daily" aria-labelledby="daily-title">
      <div className="card-head">
        <h2 id="daily-title">📰 매일 소재 리포트</h2>
        {saved.length > 0 && (
          <select aria-label="날짜" value={date} onChange={(e) => { setDate(e.target.value); setAnswer(saved.find((x) => x.date === e.target.value)?.answer ?? '') }}>
            {!saved.some((x) => x.date === today) && <option value={today}>{today} (아직 없음)</option>}
            {saved.map((x) => (
              <option key={x.date} value={x.date}>
                {x.date}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="muted small">직장인 인스타툰·스레드·커뮤니티를 조사해 오늘의 관찰, 새 소재 10개, 오늘의 질문, 콘티 1~2개를 받아요. 매일 아침 7시에 자동으로 조사하고, 어느 기기에서 열어도 같은 리포트가 보여요. 이전 7일 추천과 내 에피소드 {episodes.length}개를 같이 보내 겹치지 않게 해요.</p>

      <div className="row-inline wraps">
        <button type="button" className="btn primary small" disabled={busy} onClick={runAI}>
          {busy ? '조사하는 중… (1~2분)' : date === today && cur ? '오늘 다시 조사하기' : '오늘 조사하기 (구글 검색)'}
        </button>
        <button type="button" className="btn small" onClick={copy}>
          프롬프트 복사
        </button>
        <button type="button" className="btn small ghost" onClick={() => setShowPaste((v) => !v)}>
          결과 붙여넣기
        </button>
      </div>
      {msg && <p className={`flash ${msg.ok ? 'ok' : 'bad'}`}>{msg.text}</p>}
      {showPaste && (
        <div className="field">
          <label htmlFor="daily-paste">다른 AI에서 받은 JSON</label>
          <textarea id="daily-paste" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder='{"observations":[…],"ideas":[…],…}' />
          <button type="button" className="btn small primary" disabled={!paste.trim()} onClick={applyPaste}>
            결과 확인하고 저장
          </button>
        </div>
      )}

      <details className="daily-brief">
        <summary className="small">조사 기준 보기·고치기</summary>
        <textarea rows={14} value={brief} onChange={(e) => setBrief(e.target.value)} onBlur={() => keepBrief(brief)} aria-label="조사 기준" />
        <button
          type="button"
          className="btn small ghost"
          onClick={() => {
            setBrief(DEFAULT_BRIEF)
            keepBrief(DEFAULT_BRIEF)
          }}
        >
          처음 기준으로
        </button>
      </details>

      {loaded && !r && date === today && <p className="muted small">오늘 리포트가 아직 없어요. 매일 아침 7시에 자동으로 조사해요.</p>}
      {!loaded && <p className="muted small">불러오는 중…</p>}
      {cur && <p className="muted small">{VIA_LABEL[cur.via] ?? cur.via} · {new Date(cur.savedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
      {r && (
        <div className="daily-body">
          <h3>1. 오늘의 관찰 <span className="muted small">검증된 사례</span></h3>
          {r.noTrend && <p className="small">ℹ️ {r.noTrend}</p>}
          {r.observations.length === 0 && !r.noTrend && <p className="muted small">확인한 사례가 없어요.</p>}
          <ul className="daily-obs">
            {r.observations.map((o, i) => (
              <li key={i}>
                <div>
                  {o.url ? (
                    <a href={o.url} target="_blank" rel="noreferrer">
                      {o.title || o.url}
                    </a>
                  ) : (
                    <b>{o.title}</b>
                  )}
                  {o.linkOk === false && <span className="tag warn">링크 확인 안 됨</span>}
                </div>
                <p className="muted small">
                  {[o.source, o.postedAt && `게시 ${o.postedAt}`, o.observedAt && `관측 ${o.observedAt}`].filter(Boolean).join(' · ')}
                </p>
                <p className="small daily-nums">
                  조회 {o.views} · 좋아요 {o.likes} · 댓글 {o.comments} · 저장 {o.saves} · 공유 {o.shares} · 평소 대비 {o.multiple}
                </p>
              </li>
            ))}
          </ul>

          <h3>2. 신규 소재 {ideas.length}개 <span className="muted small">창작 아이디어</span></h3>
          <p className="muted small">
            프리랜서·디자이너 {ideas.filter((i) => i.freelance).length} · 시즌 {ideas.filter((i) => i.tags.some((t) => /시즌/.test(t))).length} · 공유형 {ideas.filter(isShareIdea).length}
          </p>
          <ol className="daily-ideas">
            {ideas.map((i) => (
              <li key={i.title}>
                <div className="daily-idea-head">
                  <b>{i.title}</b>
                  <span className="tag">{i.cuts}</span>
                  {i.category && <span className="tag">{i.category}</span>}
                  {i.freelance && <span className="tag">프리랜서·디자이너</span>}
                  {i.tags.map((t) => (
                    <span key={t} className="tag hot">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="small">💬 {i.point}</p>
                <p className="small">😂 {i.visual}</p>
                <button type="button" className="btn small ghost" disabled={!!making} onClick={() => makeIdea(i)}>
                  {making === i.title ? '만드는 중…' : '이 소재로 작업 만들기'}
                </button>
              </li>
            ))}
          </ol>

          {r.question && (
            <>
              <h3>3. 오늘의 질문</h3>
              <p className="daily-q">🙋 {r.question}</p>
              <div className="field">
                <label htmlFor="daily-answer">내 답 (실화 소재는 여기 답으로만)</label>
                <textarea id="daily-answer" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} onBlur={saveAnswer} />
              </div>
              <button
                type="button"
                className="btn small"
                disabled={!answer.trim() || !!making}
                onClick={() => make('answer', `[오늘의 질문 ${date}] ${r.question}\n${answer.trim()}`, { tags: ['실화'], patterns: [] })}
              >
                {making === 'answer' ? '만드는 중…' : '이 답으로 작업 만들기'}
              </button>
            </>
          )}

          {r.conti.length > 0 && (
            <>
              <h3>4. 콘티</h3>
              {r.conti.map((c) => {
                const idea = ideas.find((i) => i.title === c.idea) ?? { title: c.idea, point: '', visual: '', cuts: c.panels.length > 1 ? '4컷' : '한컷', category: '', freelance: false, tags: [], priority: 0 }
                return (
                  <div key={c.idea} className="daily-conti">
                    <b>{c.idea}</b>
                    <ol>
                      {c.panels.map((p, k) => (
                        <li key={k} className="small">
                          <span>{p.scene}</span> {p.action && <span className="muted">— {p.action}</span>}
                          {p.line && <div>“{p.line}”</div>}
                          {(p.background || p.props) && <div className="muted">{[p.background && `배경: ${p.background}`, p.props && `소품: ${p.props}`].filter(Boolean).join(' · ')}</div>}
                        </li>
                      ))}
                    </ol>
                    {c.twist && <p className="small">🔄 마지막 반전: {c.twist}</p>}
                    {c.silentCheck && <p className="small muted">🔇 대사 없이도: {c.silentCheck}</p>}
                    <button type="button" className="btn small ghost" disabled={!!making} onClick={() => makeIdea(idea, c)}>
                      {making === `c:${idea.title}` ? '만드는 중…' : '이 콘티로 작업 만들기'}
                    </button>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </section>
  )
}

function contiText(c: Conti) {
  return [
    '콘티 초안:',
    ...c.panels.map((p, i) => `${i + 1}. ${[p.scene, p.action && `행동: ${p.action}`, p.line && `대사: "${p.line}"`, p.background && `배경: ${p.background}`, p.props && `소품: ${p.props}`].filter(Boolean).join(' / ')}`),
    c.twist && `마지막 반전: ${c.twist}`,
  ]
    .filter(Boolean)
    .join('\n')
}
