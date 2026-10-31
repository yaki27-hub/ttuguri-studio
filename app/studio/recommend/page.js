import Link from 'next/link';
import { isAuthed } from '@/lib/auth';
import Login from '../../Login';
import RecommendClient from './RecommendClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function RecommendPage({ searchParams }) {
  const params = await searchParams;
  if (!(await isAuthed())) return <Login />;

  return (
    <main className="wrap narrow">
      <header className="sub-top">
        <Link href="/studio" className="back" aria-label="제작 홈으로">←</Link>
        <h1>소재 추천</h1>
      </header>
      {params?.msg && <p className="flash">{params.msg}</p>}
      <p className="muted small intro">
        내 메모를 먼저 살리고, 지금 시기와 지금까지의 성과를 참고해서 추천해요.
        고른 소재는 노션에 <b>스토리</b> 단계로 저장됩니다.
      </p>
      <RecommendClient />
    </main>
  );
}
