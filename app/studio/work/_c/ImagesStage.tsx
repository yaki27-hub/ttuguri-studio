'use client'

import { useState } from 'react'
import { deleteAssetIfUnused, getEpisode, patchEpisode, patchPanelMeta, putAsset, setStatus, imageMemoOf } from '@/lib/work/repo'
import { dialogueLines, sceneDescription } from '@/lib/work/prompts'
import { cardName, cardSettings } from '@/lib/work/cards'
import { coverOnlyImage } from '@/lib/work/cardDesign'
import { cardGenPrompt, cutGenPrompt, higgsfieldPrompt } from '@/lib/work/imagegen'
import { SHOTS, SHOT_HINT, SHOT_LABEL, shotPlan } from '@/lib/work/shots'
import type { Shot } from '@/lib/work/types'
import { aiImage } from '../actions'
import { referencePayload, aiImageFile } from '@/lib/work/imageRefs'
import { FIGMA_PLUGIN_VERSION, buildFigmaExport } from '@/lib/work/figmaExport'
import { figmaStyle } from '@/lib/work/artGuide'
import { applyImport, parseFinal, planImport, type FinalFile, type ImportPlan } from '@/lib/work/figmaImport'
import { downloadBlob } from '@/lib/work/format'
import JSZip from 'jszip'
import type { Panel } from '@/lib/work/types'
import { AssetImage, CopyButton, FilePick, Lightbox, Modal, Notice } from './ui'
import { useWS } from './Workspace'

export default function ImagesStage() {
  const ws = useWS()
  const { ep, b } = ws
  const [big, setBig] = useState<{ id: string; alt: string }>()
  const confirmed = ep.confirmedPanelRevision !== undefined
  const loose = ep.looseAssetIds ?? []

  return (
    <div className="stack">
      <section className="card">
        <h2>이미지</h2>
        <p className="muted small">
          {ep.contentType === 'cardnews'
            ? `장마다 ${ws.imageReady ? '‘Gemini로 만들기’를 누르거나 ' : ''}이미지 프롬프트를 복사해 그 장 문구에 맞는 그림을 만들어요. 그림에는 글자를 넣지 않으니, 피그마에서 글자를 올린 완성본으로 교체하면 돼요.`
            : `컷마다 ${ws.imageReady ? '‘Gemini로 만들기’를 누르거나 ' : ''}장면 설명을 복사해 그림을 그리거나 생성한 뒤, 완성 파일을 첨부하세요. 말풍선·대사는 그림에 넣지 않아요.`}
        </p>
        {ep.contentType === 'cardnews' ? (
          <p className="hint">
            카드뉴스 이미지는 뚜구리 설정을 쓰지 않고 <a className="link" href="/studio/settings#cardnews">설정 → 카드뉴스</a>의 그림체·규칙·참고 이미지로 만들어요.
          </p>
        ) : (
          !ws.settings.referenceAssetIds.length && <Notice kind="warn">캐릭터 레퍼런스가 아직 등록 전이에요. 설정에서 등록하면 Gemini가 그 얼굴·그림체를 따라 그려요(최대 4장 사용).</Notice>
        )}
        {!confirmed && <Notice>콘티 확정 전이에요. 첨부는 가능하지만 확정 후 작업을 권해요.</Notice>}
        <FigmaBox />
        {['confirmed_panels'].includes(ep.status) && (
          <button type="button" className="btn primary block" onClick={() => ws.act(() => setStatus(ep, 'illustrating', '이미지 작업 시작'), '이미지 작업을 시작했어요.')}>
            이미지 작업 시작
          </button>
        )}
      </section>

      {b.panels.length === 0 && <p className="muted small">콘티 컷이 없어요.</p>}

      <ol className="panel-list">
        {b.panels.map((p, i) => (
          <li key={p.id} className="panel-card">
            <ImageCard p={p} i={i} onBig={(id) => setBig({ id, alt: ep.contentType === 'cardnews' ? `${i + 1}장 이미지` : `컷 ${i + 1} 이미지` })} />
          </li>
        ))}
      </ol>

      {loose.length > 0 && (
        <section className="card">
          <h2>연결 안 된 이미지</h2>
          <p className="muted small">콘티에서 빠진 컷의 이미지예요. 자동으로 지우지 않았어요.</p>
          <div className="thumbs">
            {loose.map((a) => (
              <div key={a} className="thumb-item">
                <AssetImage id={a} alt="연결 안 된 이미지" className="thumb-img" onClick={() => setBig({ id: a, alt: '연결 안 된 이미지' })} />
                <select
                  aria-label="연결할 컷"
                  value=""
                  onChange={(e) => {
                    const pid = e.target.value
                    if (!pid) return
                    ws.act(async () => {
                      const old = b.panels.find((x) => x.id === pid)?.assetId
                      await patchPanelMeta(pid, { assetId: a })
                      await patchEpisode(ep.id, { looseAssetIds: loose.filter((x) => x !== a).concat(old ? [old] : []) })
                    }, '이미지를 컷에 연결했어요.')
                  }}
                >
                  <option value="">컷에 연결…</option>
                  {b.panels.map((p, i) => (
                    <option key={p.id} value={p.id}>
                      컷 {i + 1}
                      {p.assetId ? ' (기존 이미지는 보관)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn ghost small danger-text"
                  onClick={() => {
                    if (confirm('이 이미지를 삭제할까요?'))
                      ws.act(async () => {
                        await patchEpisode(ep.id, { looseAssetIds: loose.filter((x) => x !== a) })
                        await deleteAssetIfUnused(a)
                      }, '이미지를 삭제했어요.')
                  }}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <button type="button" className="btn primary block" onClick={() => ws.goStage('publish')}>
        게시 준비로 →
      </button>
      {big && <Lightbox id={big.id} alt={big.alt} onClose={() => setBig(undefined)} />}
    </div>
  )
}

function ImageCard({ p, i, onBig }: { p: Panel; i: number; onBig: (id: string) => void }) {
  const ws = useWS()
  const card = ws.ep.contentType === 'cardnews'
  const count = ws.b.panels.length
  /** '어쩌다 발견' 디자인의 본문 장: 그림 없이 글만 올라간다 */
  const noArt = card && i > 0 && coverOnlyImage(cardSettings(ws.settings))
  const [gen, setGen] = useState(false)
  // 카드뉴스는 뚜구리 캐릭터 레퍼런스 대신 카드뉴스 그림체 참고 이미지를 쓴다
  const refIds = (card ? cardSettings(ws.settings).styleRefIds : ws.settings.referenceAssetIds).slice(0, MAX_REFS)
  const refCount = refIds.length
  const plan = shotPlan(ws.b.panels)
  const shot = plan[i]?.shot ?? 'medium'
  const near = [plan[i - 1]?.shot, plan[i + 1]?.shot].filter((x): x is Shot => !!x)
  const genPrompt = () => {
    const memo = imageMemoOf(ws.ep, ws.settings)
    return card ? cardGenPrompt(p, i, count, ws.settings, memo, refCount) : cutGenPrompt(p, i, ws.settings, memo, refCount, shot, near)
  }

  /** Gemini로 생성 → 이 장(컷)에 첨부. 이전 이미지는 지우지 않고 ‘연결 안 된 이미지’로 보관 */
  async function generate() {
    setErr('')
    setGen(true)
    try {
      const refs = await referencePayload(refIds)
      const r = await aiImage(genPrompt(), refs, imageMemoOf(ws.ep, ws.settings).ratio)
      if ('error' in r && r.error) throw new Error(r.error)
      const file = aiImageFile(r as { mimeType: string; data: string }, `gemini-${i + 1}`)
      const a = await putAsset(file, 'panel')
      const old = p.assetId
      await ws.act(async () => {
        if (old) {
          const cur = await getEpisode(ws.ep.id)
          if (cur) await patchEpisode(cur.id, { looseAssetIds: [...(cur.looseAssetIds ?? []), old] })
        }
        await patchPanelMeta(p.id, { assetId: a.id, assetIsFinal: false })
      }, `${card ? `${i + 1}장` : `컷 ${i + 1}`} 이미지를 Gemini로 만들었어요.${old ? ' 이전 이미지는 아래 ‘연결 안 된 이미지’에 보관했어요.' : ''}`)
    } catch (e) {
      setErr(`이미지를 만들지 못했어요: ${(e as Error).message}`)
    } finally {
      setGen(false)
    }
  }
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function attach(f: File) {
    setErr('')
    setBusy(true)
    try {
      const a = await putAsset(f, 'panel') // 검사 실패 시 여기서 멈추고 기존 이미지는 그대로
      const old = p.assetId
      await ws.act(async () => {
        await patchPanelMeta(p.id, { assetId: a.id })
        if (old) await deleteAssetIfUnused(old)
      }, `컷 ${i + 1} 이미지를 ${old ? '교체' : '첨부'}했어요.`)
    } catch (e) {
      setErr(`${(e as Error).message} 기존 이미지는 그대로예요.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="image-card">
      <div className="image-slot">
        {p.assetId ? <AssetImage id={p.assetId} alt={`컷 ${i + 1} 이미지`} className="slot-img" onClick={() => onBig(p.assetId!)} /> : <div className="slot-empty">이미지 없음</div>}
      </div>
      <div className="image-info">
        <p className="panel-no">{card ? cardName(i, count) : `컷 ${i + 1}`}</p>
        <p className="small clamp">{p.scene || '(화면 미정)'}</p>
        {card ? (
          <p className="small muted clamp">{p.productionNotes ? `🖼 ${p.productionNotes}` : p.narration || '본문 없음'}</p>
        ) : (
          <>
            <p className="small muted clamp">대사: {dialogueLines(p).join(' / ') || '없음'}</p>
            <label className="shot-pick small">
              카메라{' '}
              <select
                value={p.shot ?? ''}
                aria-label={`컷 ${i + 1} 카메라`}
                onChange={(e) => ws.editPanel(p.id, { shot: (e.target.value || undefined) as Shot | undefined })}
              >
                <option value="">자동 · {SHOT_LABEL[shot]}</option>
                {SHOTS.map((k) => (
                  <option key={k} value={k}>
                    {SHOT_LABEL[k]}
                  </option>
                ))}
              </select>
              <span className="muted"> {SHOT_HINT[shot]}</span>
            </label>
          </>
        )}
        <div className="row-inline wraps">
          {noArt && !p.assetId && <span className="small muted">이 디자인은 표지만 그림을 써요 — 이 장은 그림이 필요 없어요.</span>}
          {ws.imageReady && !noArt && (
            <button type="button" className="btn small primary" disabled={gen || busy} onClick={generate}>
              {gen ? 'Gemini 그리는 중… (10~30초)' : p.assetId ? 'Gemini로 다시 만들기' : 'Gemini로 만들기'}
            </button>
          )}
          {noArt ? null : card ? (
            <CopyButton text={() => genPrompt()} label="이미지 프롬프트 복사" className="small" />
          ) : (
            <>
              <CopyButton text={() => higgsfieldPrompt(p, i, ws.settings, imageMemoOf(ws.ep, ws.settings), shot)} label="Higgsfield 프롬프트 복사" className="small" />
              <CopyButton text={() => sceneDescription(p, i, ws.settings, imageMemoOf(ws.ep, ws.settings), shot)} label="장면 설명 복사" className="small" />
            </>
          )}
          <FilePick label={busy ? '확인 중…' : p.assetId ? '교체' : '이미지 첨부'} className="small" disabled={busy} onFile={attach} />
          {p.assetId && (
            <button
              type="button"
              className="btn ghost small danger-text"
              onClick={() => {
                const old = p.assetId!
                ws.act(async () => {
                  await patchPanelMeta(p.id, { assetId: undefined, assetIsFinal: false })
                  await deleteAssetIfUnused(old)
                }, '이미지를 뺐어요.')
              }}
            >
              제거
            </button>
          )}
        </div>
        {p.assetId && (
          <fieldset className="inline-radio">
            <legend className="sr-only">이미지 종류</legend>
            <label className="radio">
              <input type="radio" checked={!p.assetIsFinal} onChange={() => ws.act(() => patchPanelMeta(p.id, { assetIsFinal: false }))} /> 그림만
            </label>
            <label className="radio">
              <input type="radio" checked={p.assetIsFinal} onChange={() => ws.act(() => patchPanelMeta(p.id, { assetIsFinal: true }))} /> {card ? '글자 포함 최종 이미지' : '대사 포함 최종 이미지'}
            </label>
          </fieldset>
        )}
        {err && <p className="error">{err}</p>}
      </div>
    </div>
  )
}

const MAX_REFS = 4


/** 피그마로 보내기: 내보내기 파일(.json) + 처음 한 번 받는 플러그인 */
function FigmaBox() {
  const ws = useWS()
  const { ep, b } = ws
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [incoming, setIncoming] = useState<{ file: FinalFile; plan: ImportPlan }>()
  const [withText, setWithText] = useState(true)
  const withImage = b.panels.filter((p) => p.assetId).length

  async function readFinal(f: File) {
    setMsg('')
    try {
      const file = parseFinal(JSON.parse(await f.text()))
      if (file.episodeId && file.episodeId !== ep.id) throw new Error(`다른 편(「${file.title}」)의 파일이에요. 그 편을 열고 가져와 주세요.`)
      setWithText(true)
      setIncoming({ file, plan: planImport(ep, b.panels, file) })
    } catch (e) {
      setMsg(`가져오지 못했어요: ${(e as Error).message}`)
    }
  }

  async function applyFinal() {
    if (!incoming) return
    const r = await ws.act(() => applyImport(ep, incoming.plan, b.slides, withText))
    setIncoming(undefined)
    if (r) setMsg(`최종 이미지 ${r.images}장을 붙이고${withText && r.edited ? `, 글자를 고친 ${r.edited}개 장에 반영하고` : ''}, 게시 슬라이드 ${r.slides}장을 맞췄어요.${r.cover ? ' 릴스 커버는 ‘연결 안 된 이미지’에 넣었어요.' : ''} 게시 단계에서 확인하세요.`)
  }
  const safe = (t: string) => t.replace(/[\\/:*?"<>|]/g, '').slice(0, 40) || 'ttuguri'

  async function exportJson(layout: 'feed' | 'reels' = 'feed') {
    setBusy(true)
    setMsg('')
    try {
      const data = await buildFigmaExport(ep, b.panels, imageMemoOf(ep, ws.settings), ws.settings.cardnews, { layout, style: figmaStyle(ws.settings) })
      downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${safe(ep.title)}-${layout === 'reels' ? 'reels-' : ''}figma.json`)
      setMsg(
        layout === 'reels'
          ? `릴스 9:16 프레임 ${data.frames.length}개(커버 포함)용 파일을 받았어요. 플러그인 v${FIGMA_PLUGIN_VERSION}에 넣으세요. 빨간 ‘가이드’ 영역(인스타 UI 자리)에는 대사를 두지 마세요 — 가이드는 완성본으로 보낼 때 자동으로 빠져요.`
          : `${data.frames.length}개 프레임용 파일을 받았어요. 피그마에서 ‘뚜구리 가져오기’ 플러그인에 넣으세요.`,
      )
    } catch (e) {
      setMsg(`내보내지 못했어요: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function pluginZip() {
    const zip = new JSZip()
    const dir = zip.folder('ttuguri-figma-plugin')!
    for (const f of ['manifest.json', 'code.js', 'ui.html']) {
      const r = await fetch(`/figma-plugin/${f}`, { cache: 'no-store' })
      if (!r.ok) return setMsg(`플러그인 파일을 받지 못했어요 (${f}).`)
      dir.file(f, await r.text())
    }
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `ttuguri-figma-plugin-v${FIGMA_PLUGIN_VERSION}.zip`)
  }

  return (
    <details className="figma-box">
      <summary>
        <b>피그마로 보내기</b> <span className="muted small">이미지 {withImage}/{b.panels.length}장 · 글자는 고칠 수 있는 레이어로</span>
      </summary>
      <div className="row-inline wraps">
        <button type="button" className="btn small primary" disabled={busy || !b.panels.length} onClick={() => exportJson('feed')}>
          {busy ? '만드는 중…' : ep.contentType === 'cardnews' ? '피그마용 내보내기 (.json)' : '피드 4:5 내보내기 (.json)'}
        </button>
        {ep.contentType !== 'cardnews' && (
          <button type="button" className="btn small primary" disabled={busy || !b.panels.length} onClick={() => exportJson('reels')}>
            릴스 9:16 내보내기 (.json)
          </button>
        )}
        <label className={`btn small ${busy ? 'disabled' : ''}`}>
          피그마에서 가져오기 (완성본)
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) readFinal(f)
            }}
          />
        </label>
        <button type="button" className="btn small" onClick={pluginZip}>
          플러그인 받기 (v{FIGMA_PLUGIN_VERSION})
        </button>
      </div>
      {ep.contentType !== 'cardnews' && (
        <div className="field figma-badge">
          <label htmlFor="ep-badge">시리즈 배지 (선택)</label>
          <input id="ep-badge" value={ep.badge ?? ''} placeholder="예: 바이브코딩 적자일기 01" onChange={(e) => ws.editEp({ badge: e.target.value })} />
          <p className="hint">
            피그마 프레임에 그림 설정 6번이 들어가요: 왼쪽 위 ‘{figmaStyle(ws.settings).watermark || '워터마크 끔'}’, 오른쪽 위 컷 번호{ep.badge?.trim() ? '와 시리즈 배지' : ''}, 굵은 고딕 갈색 제목, 손글씨 대사 말풍선. 설정 → 그림 설정에서 켜고 끌 수 있어요.
          </p>
        </div>
      )}
      {msg && <p className="hint">{msg}</p>}
      <ol className="small muted figma-steps">
        <li>
          지금 최신 플러그인은 <b>v{FIGMA_PLUGIN_VERSION}</b>이에요. 피그마 메뉴와 플러그인 창 제목에 ‘v{FIGMA_PLUGIN_VERSION}’이 안 보이면 예전 버전이니 다시 받아서 처음 등록한 폴더에 덮어쓰세요.
        </li>
        <li>처음 한 번: ‘플러그인 받기’ zip을 풀고, 피그마 데스크톱 앱 → 메뉴 Plugins → Development → Import plugin from manifest… → 푼 폴더의 manifest.json</li>
        <li>매번: ‘피그마용 내보내기’로 받은 .json을 피그마에서 Plugins → Development → 뚜구리 가져오기 에 넣기</li>
        <li>장(컷)마다 프레임이 나란히 생기고, 이미지 위에 제목·본문(또는 대사) 글자 레이어가 올라가요.</li>
        {ep.contentType !== 'cardnews' && (
          <li>
            릴스 9:16: 1080×1920 프레임에 위는 큰 제목, 가운데 컷 그림, 아래는 그림 끝 색을 이어 칠해요. 아래 20%·오른쪽 끝(인스타 UI 자리)은 빨간 가이드로 표시하고 대사는 그 밖에 둬요. 맨 앞 ‘릴스 커버’는 제목을 가운데에 모으고 그리드 3:4 잘림선을 보여 줘요.
          </li>
        )}
        <li>다 만들면: 플러그인의 ‘② 선택한 프레임 보내기’ → 받은 *-final.json을 여기 ‘피그마에서 가져오기’에 넣기. 장마다 최종 이미지가 붙고, 피그마에서 고친 글자도 반영되고, 게시 슬라이드까지 맞춰져요.</li>
      </ol>
      {incoming && (
        <Modal
          title="피그마 완성본 가져오기"
          onClose={() => setIncoming(undefined)}
          footer={
            <button type="button" className="btn primary" disabled={!incoming.plan.frames.length} onClick={applyFinal}>
              가져오기
            </button>
          }
        >
          <p className="small">
            <b>{incoming.plan.frames.filter((f) => f.frame.image).length}장</b>을 ‘글자 포함 최종 이미지’로 붙여요. 지금 붙어 있는 그림은 지우지 않고 ‘연결 안 된 이미지’로 보관해요.
          </p>
          {incoming.plan.unmatched.length > 0 && (
            <Notice kind="warn">
              이 편에 없는 장의 프레임 {incoming.plan.unmatched.length}개({incoming.plan.unmatched.map((f) => f.name).join(', ')})는 건너뛰어요. 사이트에서 장을 지웠거나 다른 편 프레임이에요.
            </Notice>
          )}
          {(() => {
            const changes = [...(incoming.plan.hook ? [{ where: '첫 장', c: incoming.plan.hook }] : []), ...incoming.plan.frames.flatMap((f) => f.changes.map((c) => ({ where: f.frame.name, c })))]
            if (!changes.length) return <p className="muted small">피그마에서 바뀐 글자는 없어요.</p>
            return (
              <>
                <label className="check">
                  <input type="checkbox" checked={withText} onChange={(e) => setWithText(e.target.checked)} /> 피그마에서 고친 글자 {changes.length}곳도 반영 (이전 내용은 버전 이력에 남아요)
                </label>
                <ul className="import-changes">
                  {changes.map(({ where, c }, k) => (
                    <li key={k}>
                      <span className="muted small">
                        {where} · {c.label}
                      </span>
                      <span className="old small">{c.from || '(비어 있음)'}</span>
                      <span className="new small">{c.to || '(비움)'}</span>
                    </li>
                  ))}
                </ul>
              </>
            )
          })()}
        </Modal>
      )}
    </details>
  )
}
