'use client'

import { useEffect, useState } from 'react'
import { getSettings, listEpisodes } from '@/lib/work/repo'
import { updateReference } from '@/lib/work/refs'
import { ParseError, extractJSON } from '@/lib/work/prompts'
import { breakdownPrompt, parseBreakdown, parseVariants, splitLines, variantsPrompt } from '@/lib/work/reflab'
import type { CharacterSettings, Episode, RefBreakdown, RefVariant, Reference } from '@/lib/work/types'
import { aiDraft } from '../actions'
import { CopyButton, Field, Notice } from './ui'

/** 작업실 밖에서 쓰는 AI 보조: ① AI로 받기(키가 있을 때) ② 프롬프트 복사 → 붙여넣기 */
function AiAssist<T>({ aiReady, prompt, parse, onResult, label }: { aiReady: boolean; prompt: () => string; parse: (raw: unknown) => T; onResult: (t: T) => void; label: string }) {
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [errs, setErrs] = useState<string[]>([])

  function take(raw: unknown) {
    try {
      onResult(parse(raw))
      setText('')
      setErrs([])
    } catch (e) {
      setErrs(e instanceof ParseError ? e.errors : [(e as Error).message])
    }
  }

  return (
    <div className="ai-assist">
      <div className="row-inline wraps">
        {aiReady && (
          <button
            type="button"
            className="btn primary small"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setErrs([])
              const r = await aiDraft(prompt()).catch((e: Error) => ({ error: e.message, output: undefined }))
              setBusy(false)
              if (r.error) setErrs([`AI 생성 실패: ${r.error}`, '프롬프트를 복사해 다른 곳에서 받아 붙여넣을 수 있어요.'])
              else take(r.output)
            }}
          >
            {busy ? 'AI 작성 중…' : label}
          </button>
        )}
        <CopyButton text={prompt} label="프롬프트 복사" className="small" />
      </div>
      <details className="paste">
        <summary className="small">결과 붙여넣기</summary>
        <textarea rows={4} aria-label="생성 결과 JSON" value={text} onChange={(e) => setText(e.target.value)} placeholder='{"...": "..."} 형태의 JSON' />
        <button
          type="button"
          className="btn small"
          disabled={!text.trim()}
          onClick={() => {
            try {
              take(extractJSON(text))
            } catch (e) {
              setErrs(e instanceof ParseError ? e.errors : [(e as Error).message])
            }
          }}
        >
          결과 확인
        </button>
      </details>
      {errs.length > 0 && (
        <Notice kind="error">
          <ul className="errs">
            {errs.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  )
}

const emptyBreakdown = (): RefBreakdown => ({ hook: '', flow: [], why: '', reactions: '', formula: '', updatedAt: '' })

/** 레퍼런스 상세 아래: 뜯어보기 → 변주 만들기 */
export default function RefLab({ r, aiReady, onCreate, busy, onSaved }: { r: Reference; aiReady: boolean; onCreate: (v: RefVariant) => Promise<void>; busy?: boolean; onSaved?: () => void }) {
  const [tab, setTab] = useState<'breakdown' | 'variants'>(r.breakdown ? 'variants' : 'breakdown')
  const [ref, setRef] = useState(r)
  const [b, setB] = useState<RefBreakdown>(r.breakdown ?? emptyBreakdown())
  const [flowText, setFlowText] = useState((r.breakdown?.flow ?? []).join('\n'))
  const [seen, setSeen] = useState('')
  const [msg, setMsg] = useState('')
  const [ctx, setCtx] = useState<{ s: CharacterSettings; eps: Episode[] }>()
  useEffect(() => setRef(r), [r])
  useEffect(() => {
    Promise.all([getSettings(), listEpisodes()]).then(([s, eps]) => setCtx({ s, eps }))
  }, [])

  const dirty = JSON.stringify({ ...b, flow: splitLines(flowText), updatedAt: '' }) !== JSON.stringify({ ...(ref.breakdown ?? emptyBreakdown()), updatedAt: '' })

  async function persist(next: Partial<Reference>, note: string) {
    const saved = await updateReference({ ...ref, ...next })
    setRef(saved)
    setMsg(note)
    onSaved?.()
  }

  async function saveBreakdown(src = { ...b, flow: splitLines(flowText) }) {
    await persist({ breakdown: { ...src, updatedAt: new Date().toISOString() } }, '뜯어보기를 저장했어요.')
  }

  const variants = ref.variants ?? []
  const setVariant = (id: string, patch: Partial<RefVariant>) => persist({ variants: variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) }, '')

  return (
    <section className="ref-lab">
      <div className="seg" role="tablist" aria-label="레퍼런스 연구">
        {(
          [
            ['breakdown', '① 뜯어보기'],
            ['variants', `② 변주 만들기${variants.length ? ` ${variants.length}` : ''}`],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {msg && <p className="hint">{msg}</p>}

      {tab === 'breakdown' && (
        <div className="lab-pane">
          <p className="muted small">왜 터졌는지 분해해 두면, 주제만 바꿔 같은 틀로 여러 편을 뽑을 수 있어요.</p>
          <Field label="본 대로 컷별로 적기 (AI용, 선택)" value={seen} onChange={setSeen} placeholder={'1컷: 출근길 지하철, "오늘은 칼퇴한다"\n2컷: …'} hint="AI는 그림을 못 봐요. 컷마다 장면·문구를 짧게 적어 주면 정확해져요." />
          <AiAssist
            aiReady={aiReady}
            label="AI로 뜯어보기"
            prompt={() => breakdownPrompt(ref, seen)}
            parse={parseBreakdown}
            onResult={(o) => {
              const next = { ...o, updatedAt: '' }
              setB(next)
              setFlowText(o.flow.join('\n'))
              setMsg('초안을 채웠어요. 고친 뒤 저장해 주세요.')
            }}
          />
          <Field label="후킹 — 첫 컷에서 멈추게 한 것" value={b.hook} onChange={(v) => setB({ ...b, hook: v })} />
          <Field label="컷 흐름 (한 줄에 한 컷)" value={flowText} onChange={setFlowText} placeholder={'1컷: 상황 — …\n2컷: 기대 — …'} />
          <Field label="반응 이유 — 왜 공감·저장했나" value={b.why} onChange={(v) => setB({ ...b, why: v })} />
          <Field label="댓글 반응" value={b.reactions} onChange={(v) => setB({ ...b, reactions: v })} placeholder="“완전 나잖아”, 친구 태그가 많음" />
          <Field single label="빌릴 틀 (주제를 뺀 한 줄)" value={b.formula} onChange={(v) => setB({ ...b, formula: v })} placeholder="기대한 장면 → 현실의 배신 → 체념한 한마디" />
          <div className="row-inline">
            <button type="button" className="btn primary small" disabled={!dirty} onClick={() => saveBreakdown()}>
              뜯어보기 저장
            </button>
            {ref.breakdown && (
              <button type="button" className="btn small" onClick={() => setTab('variants')}>
                이 틀로 변주 만들기 →
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'variants' && (
        <div className="lab-pane">
          {!ref.breakdown?.formula && <Notice kind="warn">먼저 ① 뜯어보기에서 ‘빌릴 틀’을 적어 두면 변주가 원본과 덜 겹치고 더 정확해요.</Notice>}
          <p className="muted small">틀은 그대로, 주제만 뚜구리 이야기로 바꾼 안을 5개 뽑아요. 질문에 내 경험을 적으면 그 답이 원문 메모가 돼요.</p>
          <AiAssist
            aiReady={aiReady}
            label={variants.length ? '변주 5개 더 받기' : '변주 5개 받기'}
            prompt={() => (ctx ? variantsPrompt(ref, ctx.s, ctx.eps) : '설정을 불러오는 중이에요. 잠시 후 다시 눌러 주세요.')}
            parse={parseVariants}
            onResult={(vs) => persist({ variants: [...vs, ...variants] }, `변주안 ${vs.length}개를 저장했어요.`)}
          />
          <ul className="variant-list">
            {variants.map((v) => (
              <li key={v.id} className={`variant ${v.episodeId ? 'used' : ''}`}>
                <b>{v.title}</b>
                <p className="small">{v.premise}</p>
                {v.hook && <p className="small muted">첫 컷: “{v.hook}”</p>}
                {v.question && (
                  <label className="small variant-q">
                    🎤 {v.question}
                    <textarea rows={2} defaultValue={v.answer ?? ''} placeholder="실제로 있었던 일·들은 말을 적어 주세요 (없으면 비워 두기)" onBlur={(e) => e.target.value !== (v.answer ?? '') && setVariant(v.id, { answer: e.target.value })} />
                  </label>
                )}
                <div className="row-inline">
                  {v.episodeId ? (
                    <a className="btn small" href={`/studio/work/${v.episodeId}`}>
                      만든 에피소드 열기
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="btn primary small"
                      disabled={busy}
                      onClick={async (e) => {
                        const ta = (e.currentTarget.closest('li') as HTMLElement).querySelector('textarea')
                        await onCreate({ ...v, answer: ta?.value ?? v.answer })
                      }}
                    >
                      에피소드로 만들기
                    </button>
                  )}
                  <button type="button" className="btn ghost small danger-text" onClick={() => persist({ variants: variants.filter((x) => x.id !== v.id) }, '변주안을 지웠어요.')}>
                    지우기
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
