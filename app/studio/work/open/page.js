import { isAuthed } from '@/lib/auth';
import { getEpisode, getPageText } from '@/lib/notion';
import Login from '../../../Login';
import OpenFromNotion from '../_c/OpenFromNotion';

export const dynamic = 'force-dynamic';

/** 노션 에피소드 → 작업실 (이미 연결된 게 있으면 그걸 연다) */
export default async function OpenPage({ searchParams }) {
  const sp = await searchParams;
  if (!(await isAuthed())) return <Login />;
  const pageId = String(sp?.notion || '');
  let ep = null;
  let body = '';
  let error = '';
  try {
    [ep, body] = await Promise.all([getEpisode(pageId), getPageText(pageId)]);
  } catch (e) {
    error = e.message;
  }
  return (
    <main className="wrap narrow">
      <OpenFromNotion
        pageId={pageId}
        error={error}
        episode={ep && { title: ep.title, format: ep.format, empathy: ep.empathy, twist: ep.twist, category: ep.category, body: body.slice(0, 4000) }}
      />
    </main>
  );
}
