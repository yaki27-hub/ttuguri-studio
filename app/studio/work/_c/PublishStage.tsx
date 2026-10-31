'use client'

import { useEffect, useRef, useState } from 'react'
import {
  deleteAssetIfUnused, deleteMetric, logActivity, newMetric, newPublication, newSlide, putAsset, saveMetric, savePublication, saveSlides, setStatus,
} from '@/lib/work/repo'
import { parsePublish, publishPrompt, type PublishOut } from '@/lib/work/prompts'
import { saver } from '@/lib/work/saver'
import { downloadBlob, fmtDateTime, fromLocalInput, toLocalInput } from '@/lib/work/format'
import { buildPublishZip, buildTextDraftZip, checkSlides, finalCaption, type PackageIssue } from '@/lib/work/zip'
import { METRIC_KEYS, type Metric, type MetricKey, type Publication, type Slide } from '@/lib/work/types'
import { AssetImage, CopyButton, Field, FilePick, ListField, Modal, Notice } from './ui'
import GenBox from './GenBox'
import { hashText } from './SourceStage'
import { useWS } from './Workspace'

export const METRIC_LABEL: Record<MetricKey, string> = {
  reach: '도달',
  views: '조회',
  shares: '공유',
  saves: '저장',
  profileVisits: '프로필 방문',
  follows: '팔로우',
  likes: '좋아요',
  comments: '댓글',
}

export default function PublishStage() {
  const ws = useWS()
  const { ep, b } = ws
  const slides = b.slides
  const pub = b.publication ?? newPublication(ep.id, ep.panelsRevision)
  const [issues, setIssues] = useState<PackageIssue[]>()
  const [busy, setBusy] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)
  const slidesRef = useRef(slides)
  const pubRef = useRef(pub)
  slidesRef.current = slides
  pubRef.current = pub

  useEffect(() => {
    checkSlides(slides).then(setIssues)
  }, [slides])

  const editSlides = (next: Slide[], structural = false) => {
    slidesRef.current = next
    ws.setLocal((x) => ({ ...x, slides: next }))
    if (structural) ws.act(() => saveSlides(ep.id, next))
    else saver.schedule(`slides:${ep.id}`, () => saveSlides(ep.id, slidesRef.current))
  }
  const editPub = (patch: Partial<Publication>) => {
    const next = { ...pubRef.current, ...patch }
    pubRef.current = next
    ws.setLocal((x) => ({ ...x, publication: next }))
    saver.schedule(`pub:${ep.id}`, async () => {
      await savePublication(pubRef.current)
    })
  }

  const fromPanels = () => {
    const made = b.panels.map((p, i) => newSlide(ep.id, i + 1, 'content', [p.id], p.assetIsFinal ? p.assetId : undefined))
    const cover = slides.find((s) => s.kind === 'cover')
    editSlides(cover ? [cover, ...made] : made, true)
  }

  const moveSlide = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= slides.length) return
    const next = [...slides]
    ;[next[i], next[j]] = [next[j], next[i]]
    editSlides(next, true)
    editPub({ orderConfirmed: false })
  }

  const panelNo = (id: string) => b.panels.findIndex((p) => p.id === id) + 1
  const caption = finalCaption(pub)
  const imagesOk = issues !== undefined && issues.length === 0
  const panelsOk = ep.confirmedPanelRevision !== undefined && !ep.needsReview
  const canReady = imagesOk && panelsOk && pub.orderConfirmed
  const published = ep.status === 'published'

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>슬라이드 (게시 이미지)</h2>
          <span className="muted small">
            {slides.length}장 · 컷 {b.panels.length}개
          </span>
        </div>
        <p className="muted small">컷과 게시 이미지는 따로예요. 기본은 컷 1개 = 1장, 표지는 선택. 여러 컷을 합친 최종 이미지를 한 장으로 올려도 돼요.</p>
        <div className="row-inline wraps">
          <button
            type="button"
            className="btn small"
            disabled={!b.panels.length}
            onClick={() => {
              if (slides.some((s) => s.kind === 'content') && !confirm('본문 슬라이드를 컷 기준으로 다시 구성할까요? 표지는 유지돼요.')) return
              fromPanels()
            }}
          >
            컷으로 슬라이드 구성
          </button>
          {!slides.some((s) => s.kind === 'cover') && (
            <button type="button" className="btn small" onClick={() => editSlides([newSlide(ep.id, 0, 'cover'), ...slides], true)}>
              + 표지 (선택)
            </button>
          )}
          <button type="button" className="btn small" onClick={() => editSlides([...slides, newSlide(ep.id, slides.length + 1, 'content')], true)}>
            + 빈 슬라이드
          </button>
        </div>

        <ol className="slide-list">
          {slides.map((s, i) => (
            <li key={s.id} className="slide-card">
              <div className="slide-img">
                {s.assetId ? <AssetImage id={s.assetId} alt={`슬라이드 ${i + 1}`} className="slot-img" /> : <div className="slot-empty">이미지 없음</div>}
              </div>
              <div className="slide-body">
                <div className="panel-head">
                  <span className="panel-no">
                    {i + 1}번 {s.kind === 'cover' ? '· 표지' : ''}
                  </span>
                  <span className="spacer" />
                  <button type="button" className="btn ghost small" aria-label={`슬라이드 ${i + 1} 위로`} disabled={i === 0} onClick={() => moveSlide(i, -1)}>
                    ↑
                  </button>
                  <button type="button" className="btn ghost small" aria-label={`슬라이드 ${i + 1} 아래로`} disabled={i === slides.length - 1} onClick={() => moveSlide(i, 1)}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn ghost small danger-text"
                    aria-label={`슬라이드 ${i + 1} 삭제`}
                    onClick={() => editSlides(slides.filter((x) => x.id !== s.id), true)}
                  >
                    ✕
                  </button>
                </div>
                {s.kind === 'content' && (
                  <fieldset className="inline-radio">
                    <legend className="small muted">연결 컷</legend>
                    {b.panels.map((p, k) => (
                      <label key={p.id} className="check">
                        <input
                          type="checkbox"
                          checked={s.panelIds.includes(p.id)}
                          onChange={(e) =>
                            editSlides(
                              slides.map((x) => (x.id === s.id ? { ...x, panelIds: e.target.checked ? [...x.panelIds, p.id] : x.panelIds.filter((y) => y !== p.id) } : x)),
                              true,
                            )
                          }
                        />{' '}
                        {k + 1}
                      </label>
                    ))}
                  </fieldset>
                )}
                <div className="row-inline wraps">
                  {s.panelIds
                    .map((id) => b.panels.find((p) => p.id === id))
                    .filter((p) => p?.assetId && p.assetId !== s.assetId)
                    .map((p) => (
                      <button
                        key={p!.id}
                        type="button"
                        className="btn small"
                        onClick={() => editSlides(slides.map((x) => (x.id === s.id ? { ...x, assetId: p!.assetId, isFinalImage: p!.assetIsFinal } : x)), true)}
                      >
                        컷 {panelNo(p!.id)} 이미지 사용
                      </button>
                    ))}
                  <FilePick
                    label={s.assetId ? '최종 이미지 교체' : '최종 이미지 첨부'}
                    className="small"
                    onFile={async (f) => {
                      try {
                        const a = await putAsset(f, 'slide')
                        const old = s.assetId
                        await ws.act(async () => {
                          await saveSlides(ep.id, slidesRef.current.map((x) => (x.id === s.id ? { ...x, assetId: a.id, isFinalImage: true } : x)))
                          if (old) await deleteAssetIfUnused(old)
                        })
                      } catch (e) {
                        ws.flash(`${(e as Error).message} 기존 이미지는 그대로예요.`, 'error')
                      }
                    }}
                  />
                </div>
                {s.assetId && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={s.isFinalImage}
                      onChange={(e) => editSlides(slides.map((x) => (x.id === s.id ? { ...x, isFinalImage: e.target.checked } : x)), true)}
                    />{' '}
                    대사까지 들어간 최종 이미지예요
                  </label>
                )}
                <Field
                  label="대체텍스트"
                  value={s.altText}
                  rows={2}
                  onChange={(v) => editSlides(slides.map((x) => (x.id === s.id ? { ...x, altText: v } : x)))}
                  hint="이미지 자체는 바뀌지 않아요."
                />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="card">
        <h2>게시 문구</h2>
        {slides.some((s) => s.kind === 'cover') && <Field label="표지 문구 (선택)" single value={pub.coverText} onChange={(v) => editPub({ coverText: v })} />}
        <Field label="캡션" value={pub.caption} rows={3} onChange={(v) => editPub({ caption: v })} />
        <Field label="댓글 유도 질문 (선택)" single value={pub.question ?? ''} onChange={(v) => editPub({ question: v })} />
        <label className="check">
          <input type="checkbox" checked={pub.includeQuestion} onChange={(e) => editPub({ includeQuestion: e.target.checked })} /> 질문을 캡션에 넣기
        </label>
        <ListField label="해시태그" value={pub.hashtags} onChange={(v) => editPub({ hashtags: v })} placeholder="뚜구리툰, 인스타툰, 회사생활" hint="# 없이 쉼표로 구분" />
        <label className="check">
          <input type="checkbox" checked={pub.includeHashtags} onChange={(e) => editPub({ includeHashtags: e.target.checked })} /> 해시태그를 캡션에 넣기 (캡션에 이미 있는 태그는 다시 넣지 않아요)
        </label>
        <div className="field">
          <label htmlFor="sched">게시 예정일</label>
          <input
            id="sched"
            type="datetime-local"
            value={toLocalInput(ep.scheduledAt)}
            onChange={(e) => {
              const v = fromLocalInput(e.target.value)
              ws.editEp({ scheduledAt: v })
              editPub({ scheduledAt: v })
            }}
          />
        </div>
        <GenBox<PublishOut>
          title="캡션·해시태그·대체텍스트 초안"
          target="publish"
          targetIds={slides.map((s) => s.id)}
          operation="게시 문구"
          compact
          buildPrompt={() => publishPrompt(ep, ws.story, b.panels, slides, ws.settings)}
          parse={(raw) => parsePublish(raw, slides.map((s) => s.id))}
          getBase={() => hashText(slides.map((s) => s.id).join())}
          preview={(o) => (
            <dl className="kv">
              <dt>캡션</dt>
              <dd className="pre">{o.caption}</dd>
              <dt>질문</dt>
              <dd>{o.question || '—'}</dd>
              <dt>해시태그</dt>
              <dd>{o.hashtags.map((t) => `#${t}`).join(' ')}</dd>
              <dt>대체텍스트</dt>
              <dd>
                <ol>
                  {o.slides.map((x) => (
                    <li key={x.slideId}>{x.altText}</li>
                  ))}
                </ol>
              </dd>
            </dl>
          )}
          apply={async (o) => {
            editPub({ caption: o.caption, question: o.question, includeQuestion: !!o.question && pub.includeQuestion, hashtags: o.hashtags })
            const alt = new Map(o.slides.map((x) => [x.slideId, x.altText]))
            editSlides(slidesRef.current.map((x) => (alt.has(x.id) ? { ...x, altText: alt.get(x.id)! } : x)))
            await saver.flush()
            ws.flash('게시 문구 초안을 적용했어요.', 'ok')
          }}
        />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>최종 캡션</h2>
          <CopyButton text={caption} label="캡션 복사" className="small" />
        </div>
        <pre className="body-text">{caption || '(캡션이 비어 있어요 — 비워도 게시 준비는 가능해요)'}</pre>
      </section>

      <section className="card">
        <h2>게시 전 확인</h2>
        <ul className="checklist">
          <li className={imagesOk ? 'ok' : 'bad'}>
            {imagesOk ? '✓' : '✕'} 모든 슬라이드에 읽을 수 있는 최종 이미지
            {issues && issues.length > 0 && (
              <ul className="small">
                {issues.map((x, i) => (
                  <li key={i}>{x.slide ? `${x.slide}번: ` : ''}{x.message}</li>
                ))}
              </ul>
            )}
          </li>
          <li className={panelsOk ? 'ok' : 'bad'}>{panelsOk ? '✓ 콘티 확정·재확인 완료' : '✕ 콘티 확정이 필요하거나 재확인할 내용이 있어요'}</li>
          <li>
            <label className="check">
              <input type="checkbox" checked={pub.orderConfirmed} onChange={(e) => editPub({ orderConfirmed: e.target.checked })} /> 이미지 순서를 확인했어요
            </label>
          </li>
          <li>
            <label className="check">
              <input type="checkbox" checked={pub.checkDialogue} onChange={(e) => editPub({ checkDialogue: e.target.checked })} /> 잘린 대사가 없는지 직접 봤어요
            </label>
          </li>
          <li>
            <label className="check">
              <input type="checkbox" checked={pub.checkNames} onChange={(e) => editPub({ checkNames: e.target.checked })} /> 실명·회사명 노출이 없는지 직접 봤어요
            </label>
          </li>
        </ul>
        <p className="hint">대사 잘림·실명 노출은 자동 검사하지 않아요. 직접 확인하는 체크 항목이에요.</p>

        <div className="stack">
          <button
            type="button"
            className="btn primary block"
            disabled={!imagesOk || !!busy}
            onClick={async () => {
              setBusy('zip')
              try {
                await saver.flush()
                downloadBlob(await buildPublishZip({ ...b, slides: slidesRef.current }, pubRef.current), `${ep.title.slice(0, 30)}-게시패키지.zip`)
                await logActivity(ep.id, '게시 패키지 다운로드')
              } catch (e) {
                ws.flash((e as Error).message, 'error')
              } finally {
                setBusy('')
              }
            }}
          >
            {busy === 'zip' ? '만드는 중…' : '게시 패키지 다운로드 (이미지 + 캡션 + 대체텍스트 + 콘티)'}
          </button>
          {!imagesOk && <p className="hint">이미지가 준비되지 않아 게시 패키지는 아직 만들 수 없어요. 텍스트 초안은 받을 수 있어요.</p>}
          <button
            type="button"
            className="btn block"
            onClick={async () => {
              await saver.flush()
              downloadBlob(await buildTextDraftZip({ ...b, slides: slidesRef.current }, pubRef.current), `${ep.title.slice(0, 30)}-텍스트초안.zip`)
            }}
          >
            텍스트 초안만 다운로드
          </button>
          {!published && ep.status !== 'ready' && (
            <button
              type="button"
              className="btn block"
              disabled={!canReady}
              onClick={() => ws.act(() => setStatus(ep, 'ready', '게시 준비 완료'), '게시 준비 완료로 표시했어요.')}
            >
              게시 준비 완료
            </button>
          )}
          {!published && (
            <button type="button" className="btn primary block" onClick={() => setPublishOpen(true)}>
              인스타에 올렸어요 · 게시 완료 표시
            </button>
          )}
        </div>
      </section>

      {published && <PublishedInfo pub={pub} />}
      {published && <Metrics />}

      {publishOpen && <PublishDialog pub={pub} onClose={() => setPublishOpen(false)} />}
    </div>
  )
}

function PublishDialog({ pub, onClose }: { pub: Publication; onClose: () => void }) {
  const ws = useWS()
  const [url, setUrl] = useState(pub.url ?? '')
  const [at, setAt] = useState(toLocalInput(new Date().toISOString()))
  const [ok, setOk] = useState(false)
  return (
    <Modal
      title="게시 완료 표시"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn primary"
          disabled={!ok || !at}
          onClick={async () => {
            const publishedAt = fromLocalInput(at)!
            await ws.act(async () => {
              await savePublication({ ...pub, url: url.trim() || undefined, publishedAt, manuallyConfirmed: true, sourceRevision: ws.ep.panelsRevision })
              await setStatus(ws.ep, 'published', '게시 완료 표시', { publishedAt })
            }, '게시 완료로 기록했어요.')
            onClose()
          }}
        >
          게시 완료로 기록
        </button>
      }
    >
      <p className="muted small">이 앱은 인스타에 직접 올리지 않아요. 직접 게시한 뒤 기록만 남겨요. 다운로드만으로는 완료 처리되지 않아요.</p>
      <Field label="게시 URL (선택)" single value={url} onChange={setUrl} placeholder="https://www.instagram.com/p/…" />
      <div className="field">
        <label htmlFor="pubat">실제 게시일 (필수)</label>
        <input id="pubat" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required />
      </div>
      <label className="check">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> 인스타그램에 직접 게시한 것을 확인했어요
      </label>
    </Modal>
  )
}

function PublishedInfo({ pub }: { pub: Publication }) {
  const ws = useWS()
  return (
    <section className="card">
      <h2>게시 기록</h2>
      <p>
        <b>게시일</b> {fmtDateTime(pub.publishedAt ?? ws.ep.publishedAt)}
      </p>
      {pub.url && (
        <p>
          <b>URL</b>{' '}
          <a className="link" href={pub.url} target="_blank" rel="noreferrer">
            {pub.url}
          </a>
        </p>
      )}
      {pub.history.length > 0 && <p className="muted small">이전 게시 기록 {pub.history.length}건이 이력에 있어요.</p>}
      <button
        type="button"
        className="btn small"
        onClick={() => {
          if (!confirm('게시 완료 표시를 취소할까요? 지금 기록은 이력에 남아요.')) return
          ws.act(async () => {
            await savePublication({
              ...pub,
              history: [...pub.history, { publishedAt: pub.publishedAt, url: pub.url, revokedAt: new Date().toISOString() }],
              publishedAt: undefined,
              manuallyConfirmed: false,
            })
            await setStatus(ws.ep, 'ready', '게시 완료 취소', { publishedAt: undefined })
          }, '게시 완료 표시를 취소했어요.')
        }}
      >
        게시 완료 취소
      </button>
    </section>
  )
}

function Metrics() {
  const ws = useWS()
  const { ep, b } = ws
  const [draft, setDraft] = useState<Metric>()
  const ratio = (m: Metric, k: MetricKey) => {
    const r = m.values.reach
    const v = m.values[k]
    return r && v !== undefined ? `${((v / r) * 100).toFixed(1)}% (${v}/${r})` : '—'
  }
  return (
    <section className="card">
      <div className="card-head">
        <h2>반응 기록</h2>
        <button type="button" className="btn small" onClick={() => setDraft(newMetric(ep.id, ep.publishedAt))}>
          + 관측 추가
        </button>
      </div>
      <p className="muted small">인사이트에서 실제로 확인한 값만 적어요. 모르는 값은 비워 두면 0이 아니라 ‘미확인’으로 남아요. 같은 경과 시간끼리 비교하세요.</p>
      {b.metrics.length === 0 && <p className="muted small">아직 기록이 없어요.</p>}
      {b.metrics.length > 0 && (
        <div className="table-wrap">
          <table className="mtable">
            <thead>
              <tr>
                <th>관측</th>
                <th>경과</th>
                {METRIC_KEYS.map((k) => (
                  <th key={k}>{METRIC_LABEL[k]}</th>
                ))}
                <th>공유/도달</th>
                <th>저장/도달</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {b.metrics.map((m) => (
                <tr key={m.id}>
                  <td>{fmtDateTime(m.observedAt)}</td>
                  <td>{m.hoursSincePost !== undefined ? `${m.hoursSincePost}h` : '—'}</td>
                  {METRIC_KEYS.map((k) => (
                    <td key={k}>{m.values[k] ?? <span className="muted">미확인</span>}</td>
                  ))}
                  <td>{ratio(m, 'shares')}</td>
                  <td>{ratio(m, 'saves')}</td>
                  <td>
                    <button type="button" className="btn ghost small" onClick={() => setDraft(m)}>
                      수정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {draft && (
        <Modal
          title="반응 기록"
          onClose={() => setDraft(undefined)}
          footer={
            <>
              {b.metrics.some((m) => m.id === draft.id) && (
                <button type="button" className="btn ghost danger-text" onClick={() => ws.act(() => deleteMetric(draft.id)).then(() => setDraft(undefined))}>
                  삭제
                </button>
              )}
              <button type="button" className="btn primary" onClick={() => ws.act(() => saveMetric(draft), '반응 기록을 저장했어요.').then(() => setDraft(undefined))}>
                저장
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="obs">관측 시각</label>
            <input
              id="obs"
              type="datetime-local"
              value={toLocalInput(draft.observedAt)}
              onChange={(e) => {
                const observedAt = fromLocalInput(e.target.value) ?? draft.observedAt
                const hrs = ep.publishedAt ? Math.max(0, Math.round((Date.parse(observedAt) - Date.parse(ep.publishedAt)) / 3_600_000)) : undefined
                setDraft({ ...draft, observedAt, hoursSincePost: hrs })
              }}
            />
            <p className="hint">게시 후 {draft.hoursSincePost ?? '?'}시간</p>
          </div>
          <div className="metric-grid">
            {METRIC_KEYS.map((k) => (
              <div key={k} className="field">
                <label htmlFor={`m-${k}`}>{METRIC_LABEL[k]}</label>
                <input
                  id={`m-${k}`}
                  inputMode="numeric"
                  value={draft.values[k] ?? ''}
                  placeholder="미확인"
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d]/g, '')
                    const values = { ...draft.values }
                    if (v === '') delete values[k]
                    else values[k] = Number(v)
                    setDraft({ ...draft, values })
                  }}
                />
              </div>
            ))}
          </div>
          <Field label="출처" single value={draft.source} onChange={(v) => setDraft({ ...draft, source: v })} />
          <Field label="메모 (댓글에서 본 공감·기대 등)" value={draft.note} onChange={(v) => setDraft({ ...draft, note: v })} hint="소수 댓글을 전체 독자 의견처럼 일반화하지 않도록 메모로만 남겨요." />
        </Modal>
      )}
    </section>
  )
}

