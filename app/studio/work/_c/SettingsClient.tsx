'use client'

import { useEffect, useRef, useState } from 'react'
import { cleanupOrphanAssets, defaultCardNews, defaultSettings, deleteAssetIfUnused, getSettings, newPanel, putAsset, saveSettings } from '@/lib/work/repo'
import { cardSettings, cardSystem } from '@/lib/work/cards'
import { cardGenPrompt } from '@/lib/work/imagegen'

import { IMAGE_MEMO_FIELDS, RATIO_LABEL, buildSystem } from '@/lib/work/prompts'
import { saver } from '@/lib/work/saver'
import { fmtDateTime } from '@/lib/work/format'
import type { CardDesign, CharacterSettings, Ratio } from '@/lib/work/types'
import { CARD_DESIGN_LABEL, SEODANG_STYLE, applySeodang, brandOf, designOf } from '@/lib/work/cardDesign'
import { AssetImage, CopyButton, Field, FilePick, Lightbox, ListField, Notice } from './ui'
import { BackupButtons, SaveIndicator } from './Backup'

interface Env {
  ai: { provider: string; ready: boolean; model: string }
  notion: { ready: boolean }
  instagram: { ready: boolean; expires: string; daysLeft: number | null; since: string }
  instagramCard: { ready: boolean; expires: string; daysLeft: number | null; since: string; tokenVar: string }
  cron: boolean
  password: boolean
}

export default function SettingsClient({ env, channel = 'toon' }: { env: Env; channel?: 'toon' | 'card' }) {
  const card = channel === 'card'
  const [s, setS] = useState<CharacterSettings>()
  const ref = useRef<CharacterSettings>(undefined)
  const [big, setBig] = useState<string>()
  const [usage, setUsage] = useState('')
  const [msg, setMsg] = useState('')

  const load = () =>
    getSettings().then((x) => {
      ref.current = x
      setS(x)
    })
  useEffect(() => {
    load()
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined && e.quota) setUsage(`${(e.usage / 1024 / 1024).toFixed(1)}MB 사용 / 약 ${(e.quota / 1024 / 1024 / 1024).toFixed(1)}GB 가능`)
    })
  }, [])

  if (!s) return <p className="muted small">불러오는 중…</p>

  const edit = (patch: Partial<CharacterSettings>, immediate = false) => {
    const next = { ...ref.current!, ...patch }
    ref.current = next
    setS(next)
    saver.schedule(
      'settings',
      async () => {
        const saved = await saveSettings(ref.current!)
        ref.current = { ...ref.current!, revision: saved.revision, updatedAt: saved.updatedAt }
        setS(ref.current)
      },
      immediate ? 0 : 700,
    )
  }

  const days = env.instagram.daysLeft

  return (
    <div className="stack">
      <header className="sub-top">
        <h1>설정</h1>
        <SaveIndicator />
      </header>

      {!card && (
        <>
      <section className="card">
        <div className="card-head">
          <h2>인스타툰 캐릭터 · 작품</h2>
          <span className="muted small">{s.revision ? `r${s.revision} · ${fmtDateTime(s.updatedAt)}` : '기본값 (아직 저장 전)'}</span>
        </div>
        <p className="muted small">여기 적은 내용이 인스타툰 AI 요청과 복사용 프롬프트의 지시문이 돼요 — 소재 추천·콘티·이미지. 카드뉴스는 아래 ‘카드뉴스’ 설정을 따로 써요. 이미 확정한 에피소드에는 소급 적용하지 않아요.</p>
        <Notice kind="warn">
          예전 AI 지시문에는 “회사 일과 개인 프로젝트를 병행하는 직장인 두더지 (회사 9to6, 내 일 6to12)”라고 되어 있었고, 새 브리프에는 “여러 회사에서 일한 프리랜서 디자이너의 실화”로 되어 있어요. 아래 소개를 맞는 쪽으로 고쳐 주세요.
        </Notice>
        <div className="grid2">
          <Field label="캐릭터 이름" single value={s.characterName} onChange={(v) => edit({ characterName: v })} />
          <Field label="툰 이름" single value={s.seriesName} onChange={(v) => edit({ seriesName: v })} />
        </div>
        <Field label="소개 · 캐릭터 설정" value={s.introduction} rows={3} onChange={(v) => edit({ introduction: v })} />
        <Field label="말투 · 연출 규칙" value={s.voiceRules} rows={4} onChange={(v) => edit({ voiceRules: v })} />
        <Field label="금지사항 (한 줄에 하나)" value={s.prohibitions} rows={5} onChange={(v) => edit({ prohibitions: v })} />
        <Field
          label="그림체 · 이미지 제작 메모"
          value={s.styleNotes}
          rows={3}
          onChange={(v) => edit({ styleNotes: v })}
          hint={/4:5[^\n]*고정/.test(s.styleNotes) ? '‘4:5 고정’ 문구가 있어요. 화면 비율은 이제 아래 ‘이미지 제작 기본값’과 편마다의 콘티에서 정하니 이 문구는 지우는 걸 권해요.' : undefined}
        />
        <ListField label="반복 표현" value={s.recurringExpressions} onChange={(v) => edit({ recurringExpressions: v })} placeholder="쉼표로 구분" />
        <button
          type="button"
          className="btn small ghost"
          onClick={() => {
            if (!confirm('캐릭터 설정을 기본값으로 되돌릴까요? 레퍼런스 이미지는 유지돼요.')) return
            const d = defaultSettings()
            edit({ ...d, revision: s.revision, referenceAssetIds: s.referenceAssetIds, createdAt: s.createdAt, cardnews: s.cardnews, topics: s.topics, watchlist: s.watchlist }, true)
          }}
        >
          기본값으로 되돌리기
        </button>
      </section>

      <section className="card">
        <h2>이미지 제작 기본값</h2>
        <p className="muted small">새 콘티의 ‘이미지 제작 메모’ 처음 값이에요. 편마다 콘티 단계에서 따로 바꿀 수 있고, 콘티 문서 복사·장면 설명에 표로 들어가요.</p>
        <div className="memo-grid">
          <div className="field">
            <label htmlFor="def-ratio">화면 비율</label>
            <select id="def-ratio" value={s.imageDefaults.ratio} onChange={(e) => edit({ imageDefaults: { ...s.imageDefaults, ratio: e.target.value as Ratio } })}>
              {Object.entries(RATIO_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {IMAGE_MEMO_FIELDS.map((f) => (
            <Field key={f.k} label={f.label(s)} single value={s.imageDefaults[f.k]} placeholder={f.placeholder} onChange={(v) => edit({ imageDefaults: { ...s.imageDefaults, [f.k]: v } })} />
          ))}
        </div>
      </section>

      <section className="card">
        <h2>캐릭터 레퍼런스</h2>
        {s.referenceAssetIds.length === 0 ? (
          <p className="muted small">등록 전이에요. 등록 전에는 AI가 외형을 새로 정하지 않도록 지시해요.</p>
        ) : (
          <p className="muted small">{s.referenceAssetIds.length}장 등록 · 장면 설명과 프롬프트에 “레퍼런스 기준”으로 표시돼요. 이미지 생성 도구에는 직접 첨부해 주세요.</p>
        )}
        <div className="thumbs">
          {s.referenceAssetIds.map((a) => (
            <div key={a} className="thumb-item">
              <AssetImage id={a} alt="캐릭터 레퍼런스" className="thumb-img" onClick={() => setBig(a)} />
              <button
                type="button"
                className="btn ghost small danger-text"
                onClick={async () => {
                  edit({ referenceAssetIds: s.referenceAssetIds.filter((x) => x !== a) }, true)
                  await saver.flush()
                  await deleteAssetIfUnused(a)
                }}
              >
                빼기
              </button>
            </div>
          ))}
        </div>
        <FilePick
          label="+ 레퍼런스 이미지"
          className="small"
          onFile={async (f) => {
            try {
              const a = await putAsset(f, 'reference')
              edit({ referenceAssetIds: [...ref.current!.referenceAssetIds, a.id] }, true)
            } catch (e) {
              setMsg((e as Error).message)
            }
          }}
        />
        {msg && <p className="error">{msg}</p>}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>AI 지시문 미리보기</h2>
          <CopyButton text={() => buildSystem(s)} label="복사" className="small" />
        </div>
        <details>
          <summary className="small">실제로 보내는 공통 지시문 보기</summary>
          <pre className="body-text">{buildSystem(s)}</pre>
        </details>
      </section>

        </>
      )}

      {card && <CardNewsSettingsBox s={s} edit={edit} onBig={setBig} setMsg={setMsg} />}

      <section className="card">
        <h2>연결 상태</h2>
        <p className="muted small">키 값은 서버(Vercel 환경변수)에만 있고 여기에는 있음/없음만 보여요. 바꾼 뒤에는 Vercel에서 Redeploy해야 적용돼요.</p>
        <ul className="checklist">
          <li className={env.ai.ready ? 'ok' : 'bad'}>
            {env.ai.ready ? '✓' : '✕'} AI ({env.ai.provider === 'claude' ? 'Claude' : 'Gemini'}
            {env.ai.model ? ` · ${env.ai.model}` : ' · 모델 자동'}) —{' '}
            {env.ai.ready ? '연결됨' : `${env.ai.provider === 'claude' ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY'} 없음. 작업실은 프롬프트 복사로 계속 쓸 수 있어요.`}
            <span className="hint"> AI_PROVIDER 환경변수로 gemini/claude 전환</span>
          </li>
          <li className={env.notion.ready ? 'ok' : 'bad'}>{env.notion.ready ? '✓ 노션 에피소드 DB 연결됨' : '✕ NOTION_TOKEN / NOTION_DATA_SOURCE_ID 없음'}</li>
          <li className={!env.instagram.ready ? 'bad' : days !== null && days <= 14 ? 'warn' : 'ok'}>
            {env.instagram.ready ? '✓' : '✕'} 인스타그램 (뚜구리툰 계정) —{' '}
            {env.instagram.ready
              ? `토큰 만료 ${env.instagram.expires || '미입력'}${days !== null ? ` (${days > 0 ? `${days}일 남음` : '만료됨'})` : ''}${env.instagram.since ? ` · ${env.instagram.since} 이후 게시물` : ''}`
              : 'IG_ACCESS_TOKEN / IG_USER_ID 없음'}
          </li>
          <li className={!env.instagramCard.ready ? 'bad' : env.instagramCard.daysLeft !== null && env.instagramCard.daysLeft <= 14 ? 'warn' : 'ok'}>
            {env.instagramCard.ready ? '✓' : '✕'} 인스타그램 (AI 카드뉴스 계정) —{' '}
            {env.instagramCard.ready
              ? `토큰 만료 ${env.instagramCard.expires || '미입력'}${env.instagramCard.daysLeft !== null ? ` (${env.instagramCard.daysLeft > 0 ? `${env.instagramCard.daysLeft}일 남음` : '만료됨'})` : ''}`
              : 'CARD_IG_ACCESS_TOKEN / CARD_IG_USER_ID 없음 (CARD_TOKEN_EXPIRES_AT, CARD_SINCE_DATE 도 함께)'}
          </li>
          <li className={env.cron ? 'ok' : 'bad'}>{env.cron ? '✓ 매일 09:00 자동 동기화 보호값 있음' : '✕ CRON_SECRET 없음'}</li>
        </ul>
        <details>
          <summary className="small">토큰 60일 갱신 방법</summary>
          <ol className="small">
            <li>Meta 액세스 토큰 디버거에 현재 토큰을 넣고 ‘액세스 토큰 확장’</li>
            <li>Vercel → Settings → Environment Variables에서 IG_ACCESS_TOKEN과 TOKEN_EXPIRES_AT 교체</li>
            <li>Deployments → 최신 배포 → Redeploy</li>
          </ol>
        </details>
      </section>

      <section className="card">
        <h2>작업실 데이터 보관</h2>
        <p className="muted small">
          작업실의 원문·콘티·이미지·설정은 지금 쓰는 <b>이 브라우저(이 기기)</b>에만 저장돼요. 다른 기기와 자동으로 맞춰지지 않고, 브라우저의 사이트 데이터를 지우면 사라져요. 정기적으로 백업 ZIP을 받아 두세요. 노션에는 메모·상태·성과만 남아요.
        </p>
        {usage && <p className="small">{usage}</p>}
        <BackupButtons onRestored={load} />
        <button
          type="button"
          className="btn small ghost"
          onClick={async () => {
            const n = await cleanupOrphanAssets()
            setMsg(n ? `어디에도 연결되지 않은 파일 ${n}개를 정리했어요.` : '정리할 파일이 없어요.')
          }}
        >
          연결 안 된 첨부 정리
        </button>
      </section>

      {big && <Lightbox id={big} alt="캐릭터 레퍼런스" onClose={() => setBig(undefined)} />}
    </div>
  )
}

/** 카드뉴스 전용: 계정 소개·이미지 그림체·규칙·그림체 참고 이미지 (뚜구리 설정과 분리) */
function CardNewsSettingsBox({ s, edit, onBig, setMsg }: { s: CharacterSettings; edit: (p: Partial<CharacterSettings>, immediate?: boolean) => void; onBig: (id: string) => void; setMsg: (m: string) => void }) {
  const c = cardSettings(s)
  const set = (patch: Partial<typeof c>, immediate = false) => edit({ cardnews: { ...c, ...patch } }, immediate)
  const sample = () => {
    const p = { ...newPanel('preview', 1), scene: '수정은 2회까지', narration: '횟수를 적지 않으면 수정이 끝없이 이어져요.', productionNotes: '수정 요청 메일이 쌓인 모니터' }
    return cardGenPrompt(p, 1, 5, s, { ...s.imageDefaults, ratio: '4:5' }, c.styleRefIds.length)
  }
  return (
    <section className="card" id="cardnews">
      <div className="card-head">
        <h2>카드뉴스</h2>
        <span className="muted small">뚜구리 설정과 따로 써요</span>
      </div>
      <p className="muted small">카드뉴스의 장 구성·게시 문구·이미지 생성은 인스타툰 캐릭터(뚜구리)와 그림체를 쓰지 않고 여기 값만 써요.</p>
      <div className="field">
        <label htmlFor="cdesign">디자인 템플릿</label>
        <select id="cdesign" value={designOf(c)} onChange={(e) => set({ design: e.target.value as CardDesign }, true)}>
          {(Object.keys(CARD_DESIGN_LABEL) as CardDesign[]).map((d) => (
            <option key={d} value={d}>
              {CARD_DESIGN_LABEL[d]}
            </option>
          ))}
        </select>
        <p className="hint">피그마로 보낼 때 이 배치로 프레임을 만들고, 이미지도 이 배치에 맞는 여백으로 그려요.</p>
      </div>
      {designOf(c) === 'seodang' && (
        <>
          <div className="row-inline wraps">
            <Field label="계정 이름 (첫 단어가 청록색)" single value={brandOf(c).name} onChange={(v) => set({ brand: { ...brandOf(c), name: v } })} />
            <Field label="@계정" single value={brandOf(c).handle} onChange={(v) => set({ brand: { ...brandOf(c), handle: v } })} />
            <Field label="표지 연재 이름" single value={brandOf(c).series} onChange={(v) => set({ brand: { ...brandOf(c), series: v } })} />
          </div>
          {c.imageStyle !== SEODANG_STYLE.imageStyle && (
            <Notice>
              그림체·규칙이 AI 서당 스타일과 달라요.{' '}
              <button type="button" className="btn small" onClick={() => set(applySeodang(c), true)}>
                AI 서당 그림체로 채우기
              </button>
            </Notice>
          )}
        </>
      )}
      <Field label="계정 소개 · 말투" value={c.intro} rows={3} onChange={(v) => set({ intro: v })} hint="장 구성·장 수정·게시 문구 AI 지시문의 첫머리에 들어가요." />
      <Field label="이미지 그림체 · 톤" value={c.imageStyle} rows={3} onChange={(v) => set({ imageStyle: v })} placeholder="예) 깔끔한 플랫 일러스트, 밝은 단색 배경, 포인트 색 1~2개" />
      <Field label="이미지 규칙 (한 줄에 하나)" value={c.imageRules} rows={3} onChange={(v) => set({ imageRules: v })} />
      <div className="field">
        <label>그림체 참고 이미지 (선택, 최대 4장 사용)</label>
        <p className="hint">잘된 카드뉴스나 핀터레스트에서 고른 그림을 넣으면 색감·선·질감만 따라 해요. 그 안의 내용·글자·구도는 따라 하지 않게 지시해요.</p>
        <div className="thumbs">
          {c.styleRefIds.map((a) => (
            <div key={a} className="thumb-item">
              <AssetImage id={a} alt="카드뉴스 그림체 참고" className="thumb-img" onClick={() => onBig(a)} />
              <button
                type="button"
                className="btn ghost small danger-text"
                onClick={async () => {
                  set({ styleRefIds: c.styleRefIds.filter((x) => x !== a) }, true)
                  await saver.flush()
                  await deleteAssetIfUnused(a)
                }}
              >
                빼기
              </button>
            </div>
          ))}
        </div>
        <FilePick
          label="+ 참고 이미지"
          className="small"
          onFile={async (f) => {
            try {
              const a = await putAsset(f, 'reference')
              set({ styleRefIds: [...c.styleRefIds, a.id] }, true)
            } catch (e) {
              setMsg((e as Error).message)
            }
          }}
        />
      </div>
      <div className="row-inline wraps">
        <CopyButton text={() => cardSystem(s)} label="글 지시문 복사" className="small" />
        <CopyButton text={sample} label="이미지 프롬프트 예시 복사" className="small" />
        <button
          type="button"
          className="btn small ghost"
          onClick={() => {
            if (confirm('카드뉴스 설정을 기본값으로 되돌릴까요? 참고 이미지는 유지돼요.')) set({ ...defaultCardNews(), styleRefIds: c.styleRefIds }, true)
          }}
        >
          기본값으로 되돌리기
        </button>
      </div>
      <details>
        <summary className="small">이미지 프롬프트 예시 보기 (2장 · 본문)</summary>
        <pre className="body-text">{sample()}</pre>
      </details>
    </section>
  )
}
