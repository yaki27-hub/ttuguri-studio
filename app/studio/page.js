import Link from 'next/link';
import { isAuthed } from '@/lib/auth';
import { listEpisodes } from '@/lib/notion';
import Login from '../Login';
import Nav from '../Nav';
import SubmitButton from '../SubmitButton';
import { addMemo } from './actions';

export const dynamic = 'force-dynamic';

const IN_PROGRESS = ['스토리', '콘티', '이미지 제작', '검수'];

function shortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
}

function EpisodeItem({ ep }) {
  return (
    <li>
      <Link href={`/studio/ep/${ep.id}`} className="ep-item">
        <span className="ep-title">{ep.title}</span>
        <span className="ep-meta">
          {ep.format && <span className="tag">{ep.format}</span>}
          {ep.category && <span className="tag">{ep.category}</span>}
          <span className={`status s-${ep.status}`}>{ep.status}</span>
        </span>
      </Link>
    </li>
  );
}

export default async function StudioHome({ searchParams }) {
  const params = await searchParams;
  if (!(await isAuthed())) return <Login />;

  let episodes = [];
  let error = null;
  try {
    episodes = await listEpisodes();
  } catch (e) {
    error = e.message;
  }

  const memos = episodes
    .filter((e) => e.status === '아이디어')
    .sort((a, b) => (b.createdTime || '').localeCompare(a.createdTime || ''));
  const working = episodes
    .filter((e) => IN_PROGRESS.includes(e.status))
    .sort((a, b) => IN_PROGRESS.indexOf(b.status) - IN_PROGRESS.indexOf(a.status) || (a.number ?? 0) - (b.number ?? 0));

  return (
    <main className="wrap narrow">
      <header className="top compact">
        <div className="brand">
          <div className="brand-mark" aria-hidden>뚜</div>
          <h1>뚜구리 스튜디오</h1>
        </div>
      </header>
      <Nav active="studio" />

      {params?.msg && <p className="flash">{params.msg}</p>}
      {error && <p className="flash bad">노션을 불러오지 못했어요: {error}</p>}

      <section className="card">
        <h2>① 소재 메모</h2>
        <p className="muted small">있었던 일을 한 줄로 던져두세요. 추천의 재료가 돼요.</p>
        <form action={addMemo} className="memo-form">
          <textarea
            name="memo"
            rows={3}
            required
            maxLength={500}
            placeholder="예) 회의 3시간 했는데 결론이 '다음 회의에서 정하자'"
          />
          <SubmitButton pendingText="저장 중…">노션에 저장</SubmitButton>
        </form>
      </section>

      <Link href="/studio/recommend" className="cta">
        <span>
          <strong>② 소재 추천 받기</strong>
          <small>메모 {memos.length}개 · 성과 · 지금 시기를 섞어서 3개 추천</small>
        </span>
        <span aria-hidden>→</span>
      </Link>

      <section className="card">
        <div className="card-head">
          <h2>진행 중</h2>
          <span className="muted small">{working.length}편</span>
        </div>
        {working.length ? (
          <ul className="ep-list">{working.map((ep) => <EpisodeItem key={ep.id} ep={ep} />)}</ul>
        ) : (
          <p className="muted small">진행 중인 에피소드가 없어요.</p>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>아이디어 메모</h2>
          <span className="muted small">{memos.length}개</span>
        </div>
        {memos.length ? (
          <ul className="ep-list">
            {memos.map((ep) => (
              <li key={ep.id}>
                <Link href={`/studio/ep/${ep.id}`} className="ep-item">
                  <span className="ep-title">{ep.title}</span>
                  <span className="ep-meta"><span className="muted small">{shortDate(ep.createdTime)}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">아직 메모가 없어요. 위에서 첫 메모를 남겨 보세요.</p>
        )}
      </section>
    </main>
  );
}
