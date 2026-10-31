'use client';

import { useActionState } from 'react';
import { recommendAction, pickTopic } from '../actions';
import SubmitButton from '../../SubmitButton';
import SettingsInput from '../work/_c/SettingsInput';

export default function RecommendClient() {
  const [state, run, pending] = useActionState(recommendAction, null);
  const topics = state?.topics || [];

  return (
    <>
      <form action={run}>
        <SettingsInput />
        <button type="submit" className="btn primary block" disabled={pending}>
          {pending ? '뚜구리가 소재 고르는 중… (10~20초)' : topics.length ? '다시 추천 받기' : '소재 3개 추천 받기'}
        </button>
      </form>

      {state?.error && <p className="flash bad">{state.error}</p>}

      <div className="topic-list" aria-busy={pending}>
        {topics.map((t, i) => (
          <article key={`${state.at}-${i}`} className="topic">
            <div className="topic-tags">
              {t.memoId && <span className="tag good">내 메모</span>}
              {t.category && <span className="tag">{t.category}</span>}
              {t.format && <span className="tag">{t.format}</span>}
              {t.formula && <span className="tag">{t.formula}</span>}
            </div>
            <h3>{t.title}</h3>
            {t.empathy && <p><b>공감</b> {t.empathy}</p>}
            {t.twist && <p><b>반전</b> {t.twist}</p>}
            {t.reason && <p className="reason">💡 {t.reason}</p>}
            <form action={pickTopic}>
              <input type="hidden" name="topic" value={JSON.stringify(t)} />
              <SubmitButton className="btn block" pendingText="노션에 저장 중…">이 소재로 콘티 만들기 →</SubmitButton>
            </form>
          </article>
        ))}
      </div>
    </>
  );
}
