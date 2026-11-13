'use client'

import { useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  applyPanelDraft, createEpisode, deleteAssetIfUnused, imageMemoOf, newPublication, patchEpisode, patchPanelMeta, putAsset, savePublication,
} from '@/lib/work/repo'
import { CATEGORY, FORMATS, FORMAT_LABEL, OUTPUT_LABEL, outputsOf } from '@/lib/work/format'
import { classifyPrompt, cutName, dialogueLines, parseClassify, parseQuick, quickPrompt, textLabel, type QuickFormat, type QuickOut } from '@/lib/work/prompts'
import { finalCaption } from '@/lib/work/zip'
import { checkCaption } from '@/lib/work/caption'
import { saver } from '@/lib/work/saver'
import type { ClassCandidate, Classification, Episode, ImageMemo, Output, Panel, Publication } from '@/lib/work/types'
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
  const cls = ep.classification
  const [fmt, setFmt] = useState<QuickFormat>(() =>
    !panels.length && (sp.get('fmt') === 'auto' || (cls && !cls.chosen)) ? 'auto' : cls?.chosen && CATEGORY[cls.chosen].format && !panels.length ? CATEGORY[cls.chosen].format! : ep.format,
  )
  /** 분류에서 하나를 고르면 바로 시안을 만든다 */
  const [go, setGo] = useState(false)
  const [reclass, setReclass] = useState(0)
  const autoRun = (sp.get('auto') === '1' || go) && panels.length === 0
  const needsClassify = !panels.length && fmt === 'auto'
  const pick = cls?.chosen ? cls.candidates.find((c) => c.category === cls.chosen) : undefined

  function choose(c: ClassCandidate) {
    const f = CATEGORY[c.category].format
    if (!f || !cls) return
    setFmt(f)
    ws.editEp({ outputs: c.outputs, hookText: c.hook || ep.hookText, classification: { ...cls, chosen: c.category } })
    setGo(true)
  }
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
          options={[...(panels.length ? [] : [['auto', 'AI가 분류'] as [QuickFormat, string]]), ...FORMATS.map((f) => [f, FORMAT_LABEL[f]] as [QuickFormat, string])]}
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
        {needsClassify && (
          <>
            {cls && <ClassifyResult cls={cls} onChoose={choose} onAnswered={() => setReclass((n) => n + 1)} />}
            <GenBox<Omit<Classification, 'at' | 'chosen'>>
              key={`classify-${reclass}-${cls ? 'again' : 'first'}`}
              title={cls ? '다시 분류하기' : '어떤 방식으로 만들까?'}
              runLabel={cls ? 'AI로 다시 분류' : 'AI로 분류하기'}
              target="source"
              targetIds={[ep.id]}
              operation="콘텐츠 분류"
              compact={!!cls && reclass === 0}
              autoRun={reclass > 0 || (!cls && sp.get('auto') === '1')}
              autoApply
              getBase={() => ep.revision}
              buildPrompt={() => classifyPrompt(ep, ws.settings)}
              parse={parseClassify}
              preview={() => null}
              apply={async (o) => ws.editEp({ classification: { ...o, at: new Date().toISOString() } })}
            />
          </>
        )}
        {!needsClassify && (
        <GenBox<QuickOut>
          key={panels.length ? 'again' : `first-${cls?.chosen ?? fmt}`}
          title={panels.length ? '시안 다시 만들기' : '시안 만들기'}
          runLabel={panels.length ? 'AI로 다시 만들기' : 'AI로 시안 만들기'}
          target="panels"
          targetIds={panels.map((p) => p.id)}
          operation="빠른 시안"
          compact={panels.length > 0}
          autoRun={autoRun}
          autoApply={panels.length === 0}
          getBase={() => ep.panelsRevision}
          buildPrompt={() => quickPrompt(ep, ws.settings, fmt, memo, outputs.includes('reels'), pick, cls?.series)}
          parse={(raw) => parseQuick(raw, fmt)}
          preview={(o) => <QuickDraft out={o} />}
          applyLabel="이 시안으로 바꾸기"
          apply={apply}
        />
        )}
        {pick && (
          <p className="hint">
            분류: {CATEGORY[pick.category].label} (직접 고름)
          </p>
        )}
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

/** 분류 결과: 1·2순위 카드에서 작가가 고른다. 보류면 질문에 답하고, 연재면 다음 편을 소재함에 남긴다. */
function ClassifyResult({ cls, onChoose, onAnswered }: { cls: Classification; onChoose: (c: ClassCandidate) => void; onAnswered: () => void }) {
  const ws = useWS()
  const { ep } = ws
  const [answers, setAnswers] = useState<string[]>(() => cls.questions.map(() => ''))
  const [saved, setSaved] = useState(false)
  const holdFirst = cls.candidates[0]?.category === 'hold'

  async function saveSeries() {
    if (!cls.series) return
    const s = cls.series
    await ws.act(async () => {
      for (const [i, e] of s.episodes.entries()) {
        if (i === 0) continue
        await createEpisode(`「${s.name}」 ${i + 1}편: ${e.title}\n${e.summary}`, { tags: [s.name] })
      }
    }, `「${s.name}」 2~${s.episodes.length}편을 소재함에 메모로 남겼어요.`)
    setSaved(true)
  }

  return (
    <div className="classify">
      <ol className="class-cards">
        {cls.candidates.map((c, i) => (
          <li key={c.category} className={`class-card${cls.chosen === c.category ? ' on' : ''}`}>
            <div className="card-head">
              <b>
                {i + 1}순위 · {CATEGORY[c.category].label}
              </b>
              <span className="muted small">{CATEGORY[c.category].result}</span>
            </div>
            {c.hook && c.category !== 'hold' && <p className="class-hook">“{c.hook}”</p>}
            <p className="small">{c.reason}</p>
            {c.category !== 'hold' && (
              <div className="row-inline">
                <span className="muted small">추천: {c.outputs.map((o) => OUTPUT_LABEL[o]).join(' + ')}</span>
                <span className="spacer" />
                <button type="button" className={`btn small${i === 0 ? ' primary' : ''}`} onClick={() => onChoose(c)}>
                  이걸로 만들기
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>

      {cls.series && cls.candidates.some((c) => c.category === 'series') && (
        <div className="class-series">
          <p className="small">
            <b>연재 「{cls.series.name}」</b> {cls.series.episodes.length}편 구성
          </p>
          <ol className="small">
            {cls.series.episodes.map((e, i) => (
              <li key={i}>
                <b>{e.title}</b> {e.summary && <span className="muted">— {e.summary}</span>}
              </li>
            ))}
          </ol>
          <p className="hint">처음 보는 사람은 한 편만 보고 지나가요. 편마다 혼자 읽어도 웃기게 만들어요.</p>
          {cls.series.episodes.length > 1 && (
            <button type="button" className="btn small" disabled={saved} onClick={saveSeries}>
              {saved ? '소재함에 남겼어요' : '2편부터 소재함에 메모로 남기기'}
            </button>
          )}
        </div>
      )}

      {cls.questions.length > 0 && (
        <div className="class-questions">
          <p className="small">
            <b>{holdFirst ? '아직 방향이 애매해요.' : '더 알면 좋을 것'}</b> 답을 적으면 원문은 그대로 두고 추가 메모에 붙여서 다시 분류해요.
          </p>
          {cls.questions.map((q, i) => (
            <Field key={i} label={q} single value={answers[i] ?? ''} onChange={(v) => setAnswers((a) => a.map((x, k) => (k === i ? v : x)))} />
          ))}
          <button
            type="button"
            className="btn small primary"
            disabled={!answers.some((a) => a.trim())}
            onClick={() => {
              const qa = cls.questions.map((q, i) => (answers[i]?.trim() ? `Q. ${q}\nA. ${answers[i].trim()}` : '')).filter(Boolean).join('\n')
              ws.editEp({ notes: [ep.notes.trim(), qa].filter(Boolean).join('\n\n') })
              onAnswered()
            }}
          >
            답 저장하고 다시 분류
          </button>
        </div>
      )}
    </div>
  )
}
