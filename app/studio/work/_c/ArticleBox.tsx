'use client'

import { useState } from 'react'
import { uid } from '@/lib/work/db'
import { patchEpisode } from '@/lib/work/repo'
import { articleFactsPrompt, parseArticleFacts, type ArticleFactsOut } from '@/lib/work/cards'
import type { Article } from '@/lib/work/types'
import { readArticle } from '../actions'
import GenBox from './GenBox'
import { Notice } from './ui'
import { useWS } from './Workspace'

const hashText = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)
const isGoogleNews = (u: string) => /^https?:\/\/news\.google\.com\//.test(u)

/**
 * 카드뉴스 ① 기사 읽기: 링크에서 본문을 가져오거나 붙여넣고,
 * ② AI가 번역·사실 정리 → 장 구성은 그 사실만 쓴다.
 */
export default function ArticleBox() {
  const ws = useWS()
  const ep = ws.ep
  const arts = ep.articles ?? []
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState<Record<string, string>>({})
  const [paste, setPaste] = useState('')
  const [pasteUrl, setPasteUrl] = useState('')
  const [open, setOpen] = useState<string>()

  const links = ep.links.filter((l) => /^https?:\/\//.test(l.url.trim()))
  const has = (url: string) => arts.some((a) => a.url === url || a.id === url)
  const save = (next: Article[]) => ws.editEp({ articles: next })

  async function fetchOne(key: string, url: string) {
    setBusy(key)
    setErr((e) => ({ ...e, [key]: '' }))
    try {
      const r = await readArticle(url)
      if (r.error || !r.article) throw new Error(r.error || '본문을 가져오지 못했어요.')
      const a = r.article
      save([...arts.filter((x) => x.url !== a.url), { id: uid(), url: a.url, title: a.title, site: a.site, published: a.published, text: a.text, from: 'fetch', addedAt: new Date().toISOString() }])
      // 실제 기사 주소가 다르면 링크에도 남긴다
      if (a.url !== url && !ep.links.some((l) => l.url === a.url)) ws.editEp({ links: [...ep.links, { id: uid(), url: a.url, note: `${a.site} · 기사 원문` }] })
    } catch (e) {
      setErr((x) => ({ ...x, [key]: (e as Error).message }))
    } finally {
      setBusy('')
    }
  }

  function addPaste() {
    const text = paste.trim()
    if (text.length < 100) return setErr((x) => ({ ...x, paste: '본문을 100자 이상 붙여넣어 주세요.' }))
    const url = pasteUrl.trim()
    save([
      ...arts,
      { id: uid(), url, title: text.split('\n')[0].slice(0, 80), site: url ? new URL(url).hostname.replace(/^www\./, '') : '붙여넣은 글', text: text.slice(0, 20000), from: 'paste', addedAt: new Date().toISOString() },
    ])
    setPaste('')
    setPasteUrl('')
    setErr((x) => ({ ...x, paste: '' }))
  }

  const factCount = ep.facts.filter((f) => f.quote).length

  return (
    <section className="card article-box">
      <div className="card-head">
        <h2>① 기사 읽기</h2>
        <span className="muted small">
          본문 {arts.length}개 · 확인한 사실 {factCount}개
        </span>
      </div>
      <p className="muted small">제목만 보고 쓰면 내용이 비어요. 기사 본문을 가져와 번역·정리한 사실로만 장을 구성해요.</p>

      {links.length > 0 && (
        <ul className="art-links">
          {links.map((l) => (
            <li key={l.id}>
              <div className="art-link-row">
                <span className="clamp small">
                  {l.note || l.url}
                  {isGoogleNews(l.url) && <span className="tag warn">구글 뉴스 경유</span>}
                </span>
                <a className="btn small ghost" href={l.url} target="_blank" rel="noreferrer">
                  링크 열기
                </a>
                <button type="button" className="btn small" disabled={!!busy || has(l.url)} onClick={() => fetchOne(l.id, l.url)}>
                  {busy === l.id ? '가져오는 중…' : has(l.url) ? '가져옴 ✓' : '본문 가져오기'}
                </button>
              </div>
              {err[l.id] && <p className="small warn-text">{err[l.id]}</p>}
            </li>
          ))}
        </ul>
      )}

      <details className="art-paste" open={!links.length || Object.values(err).some(Boolean) || undefined}>
        <summary className="small">기사 주소나 본문 직접 넣기</summary>
        <div className="row-inline">
          <input aria-label="기사 주소" value={pasteUrl} onChange={(e) => setPasteUrl(e.target.value)} placeholder="https:// 실제 기사 주소" />
          <button type="button" className="btn small" disabled={!pasteUrl.trim() || !!busy} onClick={() => fetchOne('manual', pasteUrl.trim())}>
            {busy === 'manual' ? '가져오는 중…' : '주소로 가져오기'}
          </button>
        </div>
        {err.manual && <p className="small warn-text">{err.manual}</p>}
        <textarea rows={4} aria-label="기사 본문 붙여넣기" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="구독 기사·막힌 사이트는 본문을 복사해 여기 붙여넣으세요 (영어도 돼요)" />
        <button type="button" className="btn small" disabled={!paste.trim()} onClick={addPaste}>
          붙여넣은 본문 추가
        </button>
        {err.paste && <p className="small warn-text">{err.paste}</p>}
      </details>

      {arts.length > 0 && (
        <ul className="art-list">
          {arts.map((a) => (
            <li key={a.id}>
              <button type="button" className="link-btn" onClick={() => setOpen(open === a.id ? undefined : a.id)}>
                {a.from === 'paste' ? '📋' : '📰'} {a.site} · {a.title || '(제목 없음)'} <span className="muted">({a.text.length.toLocaleString()}자)</span>
              </button>
              <button type="button" className="btn ghost small" aria-label="이 기사 빼기" onClick={() => save(arts.filter((x) => x.id !== a.id))}>
                ✕
              </button>
              {open === a.id && <pre className="body-text art-text">{a.text.slice(0, 3000)}{a.text.length > 3000 ? '\n…' : ''}</pre>}
            </li>
          ))}
        </ul>
      )}

      {arts.length > 0 ? (
        <GenBox<ArticleFactsOut>
          title="② 번역·사실 정리"
          target="source"
          targetIds={[ep.id]}
          operation="기사 사실 정리"
          buildPrompt={() => articleFactsPrompt(ep, ws.settings)}
          parse={parseArticleFacts}
          getBase={() => hashText(arts.map((a) => a.id).join())}
          preview={(r) => (
            <dl className="kv">
              <dt>요약</dt>
              <dd>{r.summary || '—'}</dd>
              <dt>출처</dt>
              <dd>{r.reliability || '—'}</dd>
              <dt>사실 {r.facts.length}개</dt>
              <dd>
                <ol className="fact-list">
                  {r.facts.map((f, i) => (
                    <li key={i}>
                      <span className={`tag f-${f.status}`}>{f.status === 'confirmed' ? '확인' : '주장·추정'}</span> {f.text}
                      {f.quote && <q className="small muted"> {f.quote}</q>}
                    </li>
                  ))}
                </ol>
              </dd>
              <dt>확인할 것</dt>
              <dd>{r.unknowns.join(' / ') || '—'}</dd>
            </dl>
          )}
          apply={async (r) => {
            await ws.act(
              () =>
                patchEpisode(ep.id, {
                  articleSummary: r.summary,
                  situation: ep.situation || r.summary,
                  facts: r.facts.map((f) => ({ id: uid(), text: f.text, status: f.status, quote: f.quote || undefined })),
                  unknowns: [...r.unknowns, ...(r.reliability ? [`출처: ${r.reliability}`] : [])],
                }),
              `사실 ${r.facts.length}개를 정리했어요. 아래 ‘소재 정리’에서 틀린 건 고치거나 지우고 장 구성으로 넘어가세요.`,
            )
          }}
          applyLabel="사실 목록에 적용"
        />
      ) : (
        <Notice kind="warn">아직 읽은 기사가 없어요. 이대로 장 구성을 뽑으면 제목만 보고 쓰게 돼요.</Notice>
      )}
    </section>
  )
}
