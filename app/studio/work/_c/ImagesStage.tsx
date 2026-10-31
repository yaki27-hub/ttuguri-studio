'use client'

import { useState } from 'react'
import { deleteAssetIfUnused, patchEpisode, patchPanelMeta, putAsset, setStatus } from '@/lib/work/repo'
import { sceneDescription } from '@/lib/work/prompts'
import type { Panel } from '@/lib/work/types'
import { AssetImage, CopyButton, FilePick, Lightbox, Notice } from './ui'
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
          컷마다 장면 설명을 복사해 그림을 그리거나 생성한 뒤, 완성 파일을 첨부하세요. 이 앱은 이미지를 자동 생성하거나 말풍선을 합성하지 않아요.
        </p>
        {!ws.settings.referenceAssetIds.length && <Notice kind="warn">캐릭터 레퍼런스가 아직 등록 전이에요. 설정에서 등록하면 장면 설명에 함께 표시돼요.</Notice>}
        {!confirmed && <Notice>콘티 확정 전이에요. 첨부는 가능하지만 확정 후 작업을 권해요.</Notice>}
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
            <ImageCard p={p} i={i} onBig={(id) => setBig({ id, alt: `컷 ${i + 1} 이미지` })} />
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
        <p className="panel-no">컷 {i + 1}</p>
        <p className="small clamp">{p.scene || '(화면 미정)'}</p>
        <p className="small muted clamp">대사: {p.dialogue || '없음'}</p>
        <div className="row-inline wraps">
          <CopyButton text={() => sceneDescription(p, i, ws.settings)} label="장면 설명 복사" className="small" />
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
              <input type="radio" checked={p.assetIsFinal} onChange={() => ws.act(() => patchPanelMeta(p.id, { assetIsFinal: true }))} /> 대사 포함 최종 이미지
            </label>
          </fieldset>
        )}
        {err && <p className="error">{err}</p>}
      </div>
    </div>
  )
}
