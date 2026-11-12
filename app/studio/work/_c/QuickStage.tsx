'use client'

import { useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  applyPanelDraft, deleteAssetIfUnused, imageMemoOf, newPublication, patchEpisode, patchPanelMeta, putAsset, savePublication,
} from '@/lib/work/repo'
import { FORMATS, FORMAT_LABEL, OUTPUT_LABEL, outputsOf } from '@/lib/work/format'
import { cutName, dialogueLines, parseQuick, quickPrompt, textLabel, type QuickFormat, type QuickOut } from '@/lib/work/prompts'
import { finalCaption } from '@/lib/work/zip'
import { checkCaption } from '@/lib/work/caption'
import { saver } from '@/lib/work/saver'
import type { Episode, ImageMemo, Output, Panel, Publication } from '@/lib/work/types'
import GenBox from './GenBox'
import { AssetImage, Chips, CopyButton, Field, FilePick, ListField, Notice } from './ui'
import { useWS } from './Workspace'

type OutputPick = 'carousel' | 'reels' | 'both'
const pickOf = (o: Output[]): OutputPick => (o.includes('carousel') && o.includes('reels') ? 'both' : o[0])
const toOutputs = (o: OutputPick): Output[] => (o === 'both' ? ['carousel', 'reels'] : [o])

/**
 * 빠른 시안: 메모 → [시안 만들기] 한 번으로 컷 대사·첫 화면 문구·캡션까지.
 * 오른쪽(휴대폰은 ‘미리보기’ 탭)에 인스타에 올라간 모습이 바로 보인다.
 */
export default function QuickStage() {
  const ws = useWS()
  const { ep, b } = ws
  const sp = useSearchParams()
  const panels = b.panels
  const outputs = outputsOf(ep.outputs)
  const [fmt, setFmt] = useState<QuickFormat>(() => (sp.get('fmt') === 'auto' && !panels.length ? 'auto' : ep.format))
  const autoRun = sp.get('auto') === '1' && panels.length === 0
  const memo = imageMemoOf(ep, ws.settings)

  const pub = b.publication ?? newPublication(ep.id, ep.panelsRevision)
  const pubRef = useRef(pub)
  pubRef.current = pub
  const editPub = (patch: Partial<Publication>) => {
    const next = { ...pubRef.current, ...patch }
    pubRef.current = next
    ws.setLocal((x) => ({ ...x, publication: next }))
    saver.schedule(`pub:${ep.id}`, async () => {
      await savePublication(pubRef.current)
    })
  }

  async function apply(out: QuickOut) {
    const r = await ws.act(async () => {
      const res = await applyPanelDraft(ep.id, out.items, 'replace', '빠른 시안', ep.storyRevision)
      const cur = res.episode
      const patch: Partial<Episode> = { format: out.format }
      if (out.title && cur.titleIsAuto) patch.title = out.title
      if (out.hook) patch.hookText = out.hook
      const now = imageMemoOf(cur, ws.settings)
      const next: ImageMemo = { ...now }
      for (const [k, v] of Object.entries(out.imageMemo) as [keyof ImageMemo, string][]) if (!now[k].trim()) (next as unknown as Record<string, string>)[k] = v
      if (JSON.stringify(next) !== JSON.stringify(now)) patch.imageMemo = next
      await patchEpisode(ep.id, patch)
      const base = b.publication ?? newPublication(ep.id, cur.panelsRevision)
      // 직접 고친 캡션이 있으면 덮어쓰지 않는다
      if (!base.caption.trim() || !panels.length) await savePublication({ ...base, caption: out.caption, hashtags: out.hashtags, includeHashtags: true })
      return res
    }, '시안을 만들었어요. 오른쪽 미리보기에서 인스타에 올라간 모습을 확인해 보세요.')
    if (r) {
      setFmt(out.format)
      // 새로고침해도 다시 자동 생성되지 않게
      const u = new URL(window.location.href)
      u.searchParams.delete('auto')
      u.searchParams.delete('fmt')
      window.history.replaceState(null, '', u)
    }
  }

  const full = finalCaption(pub)
  const check = checkCaption(full)

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>빠른 시안</h2>
        </div>
        <p className="muted small">메모 하나로 컷 대사와 캡션까지 만들어요. 그림·말투 규칙은 설정 화면 기준을 따라요.</p>
        <Chips
          legend="형식"
          value={fmt}
          options={[...(panels.length ? [] : [['auto', 'AI 추천'] as [QuickFormat, string]]), ...FORMATS.map((f) => [f, FORMAT_LABEL[f]] as [QuickFormat, string])]}
          onChange={setFmt}
        />
        <Chips
          legend="내보내기"
          value={pickOf(outputs)}
          options={[
            ['carousel', OUTPUT_LABEL.carousel],
            ['reels', OUTPUT_LABEL.reels],
            ['both', '둘 다'],
          ]}
          onChange={(v) => ws.editEp({ outputs: toOutputs(v) })}
        />
        <GenBox<QuickOut>
          key={panels.length ? 'again' : 'first'}
          title={panels.length ? '시안 다시 만들기' : '시안 만들기'}
          runLabel={panels.length ? 'AI로 다시 만들기' : 'AI로 시안 만들기'}
          target="panels"
          targetIds={panels.map((p) => p.id)}
          operation="빠른 시안"
          compact={panels.length > 0}
          autoRun={autoRun}
          autoApply={panels.length === 0}
          getBase={() => ep.panelsRevision}
          buildPrompt={() => quickPrompt(ep, ws.settings, fmt, memo, outputs.includes('reels'))}
          parse={(raw) => parseQuick(raw, fmt)}
          preview={(o) => <QuickDraft out={o} />}
          applyLabel="이 시안으로 바꾸기"
          apply={apply}
        />
        {panels.length > 0 && <p className="hint">다시 만들면 잠그지 않은 컷이 바뀌어요. 직접 고친 캡션은 그대로 둬요.</p>}
      </section>

      {panels.length > 0 && (
        <>
          <section className="card">
            <div className="card-head">
              <h2>컷 대사</h2>
              <button type="button" className="btn ghost small" onClick={() => ws.goStage('panels')}>
                자세히 고치기
              </button>
            </div>
            <Field label="첫 화면 문구" single value={ep.hookText ?? ''} onChange={(v) => ws.editEp({ hookText: v })} hint="처음 보는 사람이 2초 안에 이해할 한 줄" />
            <ol className="quick-cuts">
              {panels.map((p, i) => (
                <QuickCut key={p.id} p={p} i={i} />
              ))}
            </ol>
          </section>

          <section className="card">
            <h2>캡션</h2>
            <Field label="캡션" value={pub.caption} rows={5} onChange={(v) => editPub({ caption: v })} />
            <ListField label="해시태그" value={pub.hashtags} onChange={(v) => editPub({ hashtags: v })} placeholder="직장인공감, 인스타툰" hint="# 없이 쉼표로 구분 · 5개까지" />
            <ul className="cap-check">
              {check.notes.map((n, k) => (
                <li key={k} className={n.kind}>
                  {n.kind === 'ok' ? '✓' : '!'} {n.text}
                </li>
              ))}
            </ul>
            <CopyButton text={() => finalCaption(pubRef.current)} label="캡션 복사" className="primary block" />
          </section>

          <section className="card">
            <h2>다음 단계</h2>
            <div className="row-inline">
              <button type="button" className="btn" onClick={() => ws.goStage('images')}>
                그림 넣기·관리
              </button>
              <button type="button" className="btn" onClick={() => ws.goStage('publish')}>
                게시 패키지(ZIP)
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

/** 컷 하나: 대사만 바로 고치고, 그림은 여기서 바로 넣는다 */
function QuickCut({ p, i }: { p: Panel; i: number }) {
  const ws = useWS()
  const { ep, b } = ws
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const name = cutName(ep, b.panels.length, i)

  async function attach(f: File) {
    setErr('')
    setBusy(true)
    try {
      const a = await putAsset(f, 'panel')
      const old = p.assetId
      await ws.act(async () => {
        await patchPanelMeta(p.id, { assetId: a.id })
        if (old) await deleteAssetIfUnused(old)
      }, `${name} 그림을 ${old ? '바꿨어요' : '넣었어요'}.`)
    } catch (e) {
      setErr(`${(e as Error).message} 기존 그림은 그대로예요.`)
    } finally {
      setBusy(false)
    }
  }

  const speakers = (p.cast ?? []).map((c, k) => ({ c, k })).filter(({ c }) => c.dialogue.trim() || c.name)
  return (
    <li className="quick-cut">
      <div className="quick-thumb">{p.assetId ? <AssetImage id={p.assetId} alt={`${name} 그림`} className="slot-img" /> : <span className="muted small">그림 없음</span>}</div>
      <div className="quick-body">
        <div className="card-head">
          <b>{name}</b>
          <FilePick label={busy ? '넣는 중…' : p.assetId ? '그림 바꾸기' : '그림 넣기'} onFile={attach} className="small" disabled={busy} />
        </div>
        <p className="muted small">{p.scene || '(장면 미정)'}</p>
        {speakers.map(({ c, k }) => (
          <Field
            key={c.id}
            label={`${c.name || '인물'} 대사`}
            single
            value={c.dialogue}
            onChange={(v) => ws.editPanel(p.id, { cast: p.cast.map((x, j) => (j === k ? { ...x, dialogue: v } : x)) })}
          />
        ))}
        {(ep.format === 'captions' || p.narration.trim()) && (
          <Field label={textLabel(ep.format)} single value={p.narration} onChange={(v) => ws.editPanel(p.id, { narration: v })} />
        )}
        {err && <Notice kind="error">{err}</Notice>}
      </div>
    </li>
  )
}

function QuickDraft({ out }: { out: QuickOut }) {
  return (
    <div className="quick-draft">
      <p className="small">
        <b>{FORMAT_LABEL[out.format]}</b> · 「{out.title || '제목 없음'}」
      </p>
      {out.hook && (
        <p className="small">
          <b>첫 화면</b> {out.hook}
        </p>
      )}
      <ol className="small">
        {out.items.map((it, i) => (
          <li key={i}>
            {it.scene}
            {dialogueLines(it).map((d, k) => (
              <div key={k} className="muted">
                {d}
              </div>
            ))}
          </li>
        ))}
      </ol>
      {out.caption && <p className="small pre">{out.caption}</p>}
      {out.hashtags.length > 0 && <p className="small muted">{out.hashtags.map((t) => `#${t}`).join(' ')}</p>}
    </div>
  )
}
