'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { onBroadcast } from '@/lib/work/db'
import { createEpisode, deleteEpisode, getEpisode, listEpisodes, toggleHold } from '@/lib/work/repo'
import { FORMAT_LABEL, STATUS_LABEL, fmtDate, fmtDateTime } from '@/lib/work/format'
import type { ContentType, Episode, Format, Reference, Status } from '@/lib/work/types'
import { deleteReference, listReferences, onlyUrl } from '@/lib/work/refs'
import { RefCard, RefDetail, RefForm, useRefFilter } from './Refs'
import { addNotionMemo } from '../actions'
import { Modal, Notice } from './ui'
import { SaveIndicator } from './Backup'

const SAMPLE = '새 프로젝트에 들어갔는데 앞자리, 뒷자리, 옆자리 사람이 다 나가고 나 혼자 남았다.'

export default function WorkHome({ notionReady }: { notionReady: boolean }) {
  const router = useRouter()
  const [eps, setEps] = useState<Episode[] | null>(null)
  const [memo, setMemo] = useState('')
  const [toNotion, setToNotion] = useState(notionReady)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [st, setSt] = useState<Status | ''>('')
  const [fmt, setFmt] = useState<Format | ''>('')
  const [scheduled, setScheduled] = useState(false)
  const [sort, setSort] = useState<'updated' | 'scheduled'>('updated')
  const [del, setDel] = useState<Episode>()
  const [ctype, setCtype] = useState<ContentType>('instatoon')
  const [refs, setRefs] = useState<Reference[] | null>(null)
  const [openRef, setOpenRef] = useState<Reference>()
  const [delRef, setDelRef] = useState<Reference>()
  const [refMsg, setRefMsg] = useState('')
  const rf = useRefFilter(refs)
  const link = onlyUrl(memo)

  const load = () => {
    listEpisodes().then(setEps, (e) => setErr(`불러오지 못했어요: ${e.message}`))
    listReferences().then(setRefs, (e) => setErr(`레퍼런스를 불러오지 못했어요: ${e.message}`))
  }
  useEffect(() => {
    load()
    return onBroadcast(() => load())
  }, [])

  async function save(text: string, extra: Partial<Episode> = {}) {
    if (!text.trim()) return setErr('메모를 입력해 주세요.')
    setBusy(true)
    setErr('')
    try {
      let notionPageId: string | undefined
      let notionMsg = ''
      if (toNotion && !extra.isSample) {
        const r = await addNotionMemo(text)
        if (r.id) notionPageId = r.id
        else notionMsg = `노션 저장은 실패했어요 (${r.error}). 작업실에는 저장했어요.`
      }
      const ep = await createEpisode(text, { contentType: ctype, ...extra, notionPageId })
      if (notionMsg) sessionStorage.setItem('work-flash', notionMsg)
      router.push(`/studio/work/${ep.id}`)
    } catch (e) {
      setErr(`저장하지 못했어요: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  const filtered = useMemo(() => {
    if (!eps) return []
    const t = q.trim().toLowerCase()
    let list = eps.filter(
      (e) =>
        (!t || e.title.toLowerCase().includes(t) || e.originalMemo.toLowerCase().includes(t) || e.tags.some((g) => g.toLowerCase().includes(t))) &&
        (!st || e.status === st) &&
        (!fmt || e.format === fmt) &&
        (!scheduled || !!e.scheduledAt),
    )
    if (sort === 'scheduled') list = [...list].sort((a, b) => (a.scheduledAt ?? '9').localeCompare(b.scheduledAt ?? '9'))
    return list
  }, [eps, q, st, fmt, scheduled, sort])

  const filtering = q || st || fmt || scheduled

  return (
    <>
      <header className="sub-top">
        <h1>작업</h1>
        <SaveIndicator />
      </header>

      <section className="card">
        <h2>있었던 일 한두 문장, 또는 링크</h2>
        <p className="muted small">글을 쓰면 소재 메모로, 게시물 링크를 붙이면 레퍼런스로 저장해요.</p>
        <form
          className="memo-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!link) save(memo)
          }}
        >
          <label className="sr-only" htmlFor="memo">
            소재 메모
          </label>
          <textarea id="memo" rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={`예) ${SAMPLE}`} />
          {link ? (
            <RefForm
              key={link}
              url={link}
              onCancel={() => setMemo('')}
              onExisting={(r) => setOpenRef(r)}
              onSaved={(r) => {
                setMemo('')
                setRefMsg(`@${r.account} 레퍼런스를 저장했어요.`)
                load()
              }}
            />
          ) : (
            <>
          <fieldset className="seg" aria-label="콘텐츠 유형">
            {(
              [
                ['instatoon', '인스타툰'],
                ['cardnews', '카드뉴스'],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className={ctype === v ? 'on' : ''}>
                <input type="radio" name="ctype" value={v} checked={ctype === v} onChange={() => setCtype(v)} /> {l}
              </label>
            ))}
          </fieldset>
          {notionReady && (
            <label className="check">
              <input type="checkbox" checked={toNotion} onChange={(e) => setToNotion(e.target.checked)} /> 노션 에피소드 DB에도 ‘아이디어’로 남기기
            </label>
          )}
          <button type="submit" className="btn primary block" disabled={busy || !memo.trim()}>
            {busy ? '저장 중…' : '소재 저장'}
          </button>
            </>
          )}
        </form>
        {refMsg && !link && <p className="flash">{refMsg}</p>}
        <p className="muted small">
          소재가 막히면{' '}
          <Link className="link" href="/studio/recommend">
            소재 추천 받기
          </Link>
        </p>
        {err && <p className="flash bad">{err}</p>}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>소재 목록</h2>
          <span className="muted small">{eps ? `${filtered.length}/${eps.length}편` : '불러오는 중…'}</span>
        </div>
        {eps && eps.length > 0 && (
          <div className="filters">
            <input type="search" aria-label="제목·원문·태그 검색" placeholder="제목·원문·태그 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="상태" value={st} onChange={(e) => setSt(e.target.value as Status | '')}>
              <option value="">모든 상태</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select aria-label="형식" value={fmt} onChange={(e) => setFmt(e.target.value as Format | '')}>
              <option value="">모든 형식</option>
              <option value="single">한컷</option>
              <option value="four">4컷</option>
              <option value="captions">컷자막형</option>
            </select>
            <select aria-label="정렬" value={sort} onChange={(e) => setSort(e.target.value as 'updated' | 'scheduled')}>
              <option value="updated">최근 수정순</option>
              <option value="scheduled">게시 예정순</option>
            </select>
            <label className="check">
              <input type="checkbox" checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} /> 게시 예정일 있는 것만
            </label>
          </div>
        )}

        {eps && eps.length === 0 && (
          <div className="empty-box">
            <p className="muted small">아직 소재가 없어요. 위에 첫 메모를 남기거나 예시로 흐름을 체험해 보세요.</p>
            <button type="button" className="btn" disabled={busy} onClick={() => save(SAMPLE, { isSample: true, title: `[샘플] ${SAMPLE.slice(0, 22)}…`, titleIsAuto: false })}>
              예시로 체험하기
            </button>
          </div>
        )}
        {eps && eps.length > 0 && filtered.length === 0 && (
          <div className="empty-box">
            <p className="muted small">조건에 맞는 소재가 없어요.</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setQ('')
                setSt('')
                setFmt('')
                setScheduled(false)
              }}
            >
              필터 초기화
            </button>
          </div>
        )}

        <ul className="ep-list">
          {filtered.map((e) => (
            <li key={e.id} className="ep-card">
              <Link href={`/studio/work/${e.id}?stage=${e.stage}`} className="ep-item">
                <span className="ep-title">
                  {e.isSample && <span className="tag warn">샘플</span>} {e.title}
                </span>
                <span className="muted small clamp">{e.originalMemo}</span>
                <span className="ep-meta">
                  <span className={`status s-${e.status}`}>{STATUS_LABEL[e.status]}</span>
                  {e.contentType === 'cardnews' && <span className="tag good">카드뉴스</span>}
                  <span className="tag">{FORMAT_LABEL[e.format]}</span>
                  {!!e.referenceIds?.length && <span className="tag">레퍼런스 {e.referenceIds.length}</span>}
                  {e.tags.slice(0, 4).map((t) => (
                    <span key={t} className="tag">
                      #{t}
                    </span>
                  ))}
                  {e.notionPageId && <span className="tag good">노션 연결</span>}
                  {e.needsReview && <span className="tag warn">재확인 필요</span>}
                  {e.scheduledAt && <span className="tag">📅 {fmtDate(e.scheduledAt)}</span>}
                  <span className="muted small">수정 {fmtDateTime(e.updatedAt)}</span>
                </span>
              </Link>
              <div className="ep-actions">
                <Link className="btn small" href={`/studio/work/${e.id}?stage=${e.stage}`}>
                  이어서 작업
                </Link>
                <button
                  type="button"
                  className="btn small"
                  onClick={async () => {
                    const cur = await getEpisode(e.id)
                    if (cur) await toggleHold(cur)
                    load()
                  }}
                >
                  {e.status === 'on_hold' ? '보류 해제' : '보류'}
                </button>
                <button type="button" className="btn small ghost danger-text" onClick={() => setDel(e)}>
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" id="refs">
        <div className="card-head">
          <h2>레퍼런스 보드</h2>
          <span className="muted small">{refs ? `${rf.list.length}/${refs.length}개` : '불러오는 중…'}</span>
        </div>
        {refs && refs.length === 0 && <p className="muted small">참고할 게시물 링크를 위 입력칸에 붙여넣으면 여기에 모여요.</p>}
        {refs && refs.length > 0 && rf.controls}
        {refs && refs.length > 0 && rf.list.length === 0 && (
          <div className="empty-box">
            <p className="muted small">조건에 맞는 레퍼런스가 없어요.</p>
            <button type="button" className="btn" onClick={rf.reset}>
              필터 초기화
            </button>
          </div>
        )}
        <ul className="ref-grid">
          {rf.list.map((r) => (
            <RefCard key={r.id} r={r} onOpen={() => setOpenRef(r)} />
          ))}
        </ul>
      </section>

      {openRef && (
        <RefDetail
          r={openRef}
          onClose={() => setOpenRef(undefined)}
          footer={
            <>
              <button type="button" className="btn ghost danger-text" onClick={() => (setDelRef(openRef), setOpenRef(undefined))}>
                삭제
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => {
                  const r = openRef
                  const seed = r.take || r.note || `@${r.account} 게시물 참고`
                  save(seed, { referenceIds: [r.id] })
                }}
              >
                이 소재로 에피소드 만들기
              </button>
            </>
          }
        />
      )}

      {delRef && (
        <Modal
          title="레퍼런스 삭제"
          onClose={() => setDelRef(undefined)}
          footer={
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                await deleteReference(delRef.id)
                setDelRef(undefined)
                load()
              }}
            >
              삭제하기
            </button>
          }
        >
          <p>
            <b>@{delRef.account}</b> 레퍼런스를 삭제할까요? 연결된 에피소드에서도 빠지고 되돌릴 수 없어요.
          </p>
        </Modal>
      )}

      {del && (
        <Modal
          title="소재 삭제"
          onClose={() => setDel(undefined)}
          footer={
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                await deleteEpisode(del.id)
                setDel(undefined)
                load()
              }}
            >
              삭제하기
            </button>
          }
        >
          <p>
            <b>“{del.title}”</b>을(를) 삭제할까요? 원문·콘티·첨부 이미지·반응 기록이 이 브라우저에서 모두 지워지고 되돌릴 수 없어요.
          </p>
          {del.notionPageId && <Notice>노션 에피소드 행은 지우지 않아요.</Notice>}
        </Modal>
      )}
    </>
  )
}
