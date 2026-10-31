'use client';

import { useActionState, useState } from 'react';
import { kontiAction, saveKonti } from '../../actions';
import SubmitButton from '../../../SubmitButton';

export default function KontiEditor({ pageId, hasKonti }) {
  const [state, run, pending] = useActionState(kontiAction, null);
  const [copied, setCopied] = useState(false);
  const draft = state?.draft;

  async function copy(e) {
    const text = e.currentTarget.form?.elements?.text?.value || '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* 복사 실패는 무시 */ }
  }

  return (
    <section className="card">
      <h2>③ 콘티 {hasKonti ? '다시 만들기' : '만들기'}</h2>
      <form action={run} className="konti-ask">
        <input type="hidden" name="pageId" value={pageId} />
        <textarea
          name="note"
          rows={2}
          maxLength={400}
          placeholder="추가 요청 (선택) 예) 4컷으로, 마지막은 허무하게"
        />
        <button type="submit" className="btn primary block" disabled={pending}>
          {pending ? '콘티 쓰는 중… (10~30초)' : draft ? '다시 생성' : 'AI 콘티 초안 생성'}
        </button>
      </form>

      {state?.error && <p className="flash bad">{state.error}</p>}

      {draft && (
        <form action={saveKonti} className="konti-draft" key={state.at}>
          <input type="hidden" name="pageId" value={pageId} />
          <input
            type="hidden"
            name="meta"
            value={JSON.stringify({
              title: draft.title, category: draft.category, format: draft.format,
              formula: draft.formula, empathy: draft.empathy, twist: draft.twist,
            })}
          />
          <div className="topic-tags">
            {draft.format && <span className="tag">{draft.format}</span>}
            {draft.category && <span className="tag">{draft.category}</span>}
            {draft.formula && <span className="tag">{draft.formula}</span>}
          </div>
          <p className="draft-title">{draft.title}</p>
          <p className="muted small">자유롭게 고친 뒤 저장하세요. 내가 고친 내용이 최종본이에요.</p>
          <textarea name="text" defaultValue={draft.text} rows={22} className="konti-text" />
          <div className="row">
            <button type="button" className="btn" onClick={copy}>{copied ? '복사됨 ✓' : '전체 복사'}</button>
            <SubmitButton pendingText="저장 중…">노션에 저장</SubmitButton>
          </div>
        </form>
      )}
    </section>
  );
}
