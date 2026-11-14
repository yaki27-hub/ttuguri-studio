'use client'

import { addStoryVersion, emptyStory, patchEpisode, type StoryFields } from '@/lib/work/repo'
import { parseStory, storyPrompt, type StoryOut } from '@/lib/work/prompts'
import { FORMATS, FORMAT_LABEL, fmtDateTime } from '@/lib/work/format'
import type { Format, StoryVersion } from '@/lib/work/types'
import { Field } from './ui'
import GenBox from './GenBox'
import { useWS } from './Workspace'

const SOURCE_LABEL: Record<StoryVersion['source'], string> = { manual: '직접', import: '붙여넣기', provider: 'AI' }

export default function StoryStage({ embedded = false }: { embedded?: boolean }) {
  const ws = useWS()
  const { ep, story } = ws
  const box = embedded ? 'sub' : 'card'

  async function addVersion(fields: StoryFields, source: StoryVersion['source'], msg: string) {
    await ws.act(async () => {
      const r = await addStoryVersion(ep.id, fields, source, ep.storyRevision, ws.settings.revision)
      if (r.episode.status === 'idea' || r.episode.format !== fields.format) {
        await patchEpisode(ep.id, { status: r.episode.status === 'idea' ? 'story' : r.episode.status, format: fields.format })
      }
    }, msg)
  }

  return (
    <div className={embedded ? undefined : 'stack'}>
      {!story ? (
        <section className={box}>
          {!embedded && <h2>이야기</h2>}
          <p className="muted small">콘티를 뽑기 전에 흐름을 먼저 잡고 싶을 때만 쓰세요. 비워 둬도 콘티는 메모만으로 만들어져요.</p>
          <button type="button" className="btn" onClick={() => addVersion(emptyStory(ep.format), 'manual', '빈 이야기를 만들었어요.')}>
            직접 쓰기
          </button>
        </section>
      ) : (
        <section className={box}>
          <div className="card-head">
            <h2>{embedded ? '이야기 방향' : '이야기'}</h2>
            <span className="muted small">버전 {ws.b.stories.length}</span>
          </div>
          <div className="field">
            <label htmlFor="fmt">형식</label>
            <select
              id="fmt"
              value={story.format}
              onChange={(e) => {
                const f = e.target.value as Format
                ws.editStory({ format: f })
                ws.editEp({ format: f })
              }}
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </option>
              ))}
            </select>
            {story.reason && <p className="hint">추천 이유: {story.reason}</p>}
          </div>
          <Field label="한 줄 요약" value={story.summary} onChange={(v) => ws.editStory({ summary: v })} />
          <Field label="도입 — 첫 장면" value={story.opening} onChange={(v) => ws.editStory({ opening: v })} />
          {story.format !== 'single' && <Field label="전개" value={story.development} onChange={(v) => ws.editStory({ development: v })} />}
          <Field label="웃음 지점" value={story.humor} onChange={(v) => ws.editStory({ humor: v })} />
          <Field label="마무리 — 마지막 한 줄" value={story.ending} onChange={(v) => ws.editStory({ ending: v })} hint="첫 장면과 이어지는지 확인해 보세요." />
        </section>
      )}

      <section className={box}>
        <GenBox<StoryOut>
          title={story ? '다른 방향 초안 받기' : '이야기 초안 받기'}
          target="story"
          targetIds={[ep.id]}
          operation="이야기 정리"
          buildPrompt={() => storyPrompt(ep, ws.settings)}
          parse={parseStory}
          getBase={() => ep.storyRevision}
          compact={!!story}
          preview={(s) => (
            <dl className="kv">
              <dt>추천 형식</dt>
              <dd>
                {FORMAT_LABEL[s.recommendedFormat]} — {s.reason}
              </dd>
              <dt>한 줄 요약</dt>
              <dd>{s.summary}</dd>
              <dt>도입</dt>
              <dd>{s.opening}</dd>
              {s.development && (
                <>
                  <dt>전개</dt>
                  <dd>{s.development}</dd>
                </>
              )}
              <dt>웃음 지점</dt>
              <dd>{s.humor}</dd>
              <dt>마무리</dt>
              <dd>{s.ending}</dd>
            </dl>
          )}
          applyLabel={story ? '새 버전으로 적용' : '적용'}
          apply={(s) =>
            addVersion(
              { summary: s.summary, opening: s.opening, development: s.development, humor: s.humor, ending: s.ending, format: s.recommendedFormat, reason: s.reason },
              ws.aiReady ? 'provider' : 'import',
              ws.b.panels.length ? '새 이야기 버전을 적용했어요. 기존 콘티는 그대로이고 재확인 표시를 했어요.' : '이야기 초안을 적용했어요.',
            )
          }
        />
      </section>

      {ws.b.stories.length > 1 && (
        <details className={box}>
          <summary>이전 버전 {ws.b.stories.length - 1}개</summary>
          <ul className="versions">
            {ws.b.stories
              .slice(0, -1)
              .reverse()
              .map((v) => (
                <li key={v.id}>
                  <div>
                    <b>{v.summary || '(요약 없음)'}</b>
                    <p className="muted small">
                      {fmtDateTime(v.createdAt)} · {SOURCE_LABEL[v.source]} · {FORMAT_LABEL[v.format]}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => addVersion({ summary: v.summary, opening: v.opening, development: v.development, humor: v.humor, ending: v.ending, format: v.format, reason: v.reason }, 'manual', '이전 버전을 새 버전으로 되살렸어요.')}
                  >
                    이 버전으로
                  </button>
                </li>
              ))}
          </ul>
        </details>
      )}

      {story && !embedded && (
        <button type="button" className="btn primary block" onClick={() => ws.goStage('panels')}>
          이 방향으로 콘티 만들기 →
        </button>
      )}
    </div>
  )
}
