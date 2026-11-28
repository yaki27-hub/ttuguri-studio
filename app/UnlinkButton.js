'use client';

import { useFormStatus } from 'react-dom';

function Submit({ label }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="unlink" disabled={pending}>
      {pending ? '해제 중…' : label}
    </button>
  );
}

/** 실수로 누르지 않도록 확인 창을 띄운 뒤 해제한다 */
export default function UnlinkButton({ action, pageId, timestamp, title, mediaId = '', permalink = '', grouped = false }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(grouped
          ? `“${title}”에서 이 게시물만 뺄까요?\n같은 편의 다른 게시물은 그대로 연결돼 있고, 성과 합계를 다시 계산해요.`
          : `“${title}” 에피소드와의 연결을 해제할까요?\n노션의 Media ID·링크·성과 수치가 비워집니다.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="timestamp" value={timestamp} />
      <input type="hidden" name="mediaId" value={mediaId} />
      <input type="hidden" name="permalink" value={permalink} />
      <Submit label={grouped ? '이 게시물만 빼기' : '연결 해제'} />
    </form>
  );
}
