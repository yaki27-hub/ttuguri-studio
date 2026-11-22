'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 인스타·노션 성과를 다시 불러온다 (노션에 쓰지는 않음).
 * 페이지 서버 코드(collectPosts·listEpisodes)를 다시 실행하고,
 * 화면에서 고른 기간·검색·필터는 그대로 둔다.
 */
export default function RefreshButton({ loadedAt }: { loadedAt: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const time = new Date(loadedAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
  return (
    <button
      type="button"
      className="btn"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      aria-live="polite"
      title={`마지막으로 불러온 시각 ${time}`}
    >
      {pending ? '불러오는 중…' : <>새로고침<span className="refresh-time"> · {time}</span></>}
    </button>
  );
}
