'use client';

import { useFormStatus } from 'react-dom';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="unlink" disabled={pending}>
      {pending ? '해제 중…' : '연결 해제'}
    </button>
  );
}

/** 실수로 누르지 않도록 확인 창을 띄운 뒤 해제한다 */
export default function UnlinkButton({ action, pageId, timestamp, title }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`“${title}” 에피소드와의 연결을 해제할까요?\n노션의 Media ID·링크·성과 수치가 비워집니다.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="timestamp" value={timestamp} />
      <Submit />
    </form>
  );
}
