import Link from 'next/link';
import { isAuthed } from '@/lib/auth';
import { getEpisode, getPageText } from '@/lib/notion';
import Login from '../../../Login';
import SubmitButton from '../../../SubmitButton';
import { setStatus } from '../../actions';
import KontiEditor from './KontiEditor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 제작 화면에서 다루는 단계 (제작 완료·업로드 완료는 성과 탭과 연결)
const FLOW = ['아이디어', '스토리', '콘티', '이미지 제작', '검수', '업로드 완료'];

export default async function EpisodePage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!(await isAuthed())) return <Login />;

  let ep;
  let body = '';
  let error = null;
  try {
    [ep, body] = await Promise.all([getEpisode(id), getPageText(id)]);
  } catch (e) {
    error = e.message;
  }

  const idx = ep ? FLOW.indexOf(ep.status) : -1;
  const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;

  return (
    <main className="wrap narrow">
      <header className="sub-top">
        <Link href="/studio" className="back" aria-label="제작 홈으로">←</Link>
        <h1>에피소드</h1>
        {ep?.url && <a href={ep.url} target="_blank" rel="noreferrer" className="small link">노션에서 열기</a>}
      </header>

      {sp?.msg && <p className="flash">{sp.msg}</p>}
      {error && <p className="flash bad">불러오지 못했어요: {error}</p>}

      {ep && (
        <>
          <section className="card">
            <div className="topic-tags">
              {ep.number != null && <span className="tag">#{ep.number}</span>}
              {ep.format && <span className="tag">{ep.format}</span>}
              {ep.category && <span className="tag">{ep.category}</span>}
              {ep.formula.map((f) => <span key={f} className="tag">{f}</span>)}
            </div>
            <h2 className="ep-h">{ep.title}</h2>
            {ep.empathy && <p><b>공감</b> {ep.empathy}</p>}
            {ep.twist && <p><b>반전</b> {ep.twist}</p>}

            <ol className="stepper" aria-label="제작 단계">
              {FLOW.map((s, i) => (
                <li key={s} className={i < idx ? 'done' : i === idx ? 'now' : ''}>{s}</li>
              ))}
            </ol>
            {!FLOW.includes(ep.status) && ep.status && (
              <p className="muted small">현재 상태: {ep.status}</p>
            )}
            {next && (
              <form action={setStatus}>
                <input type="hidden" name="pageId" value={ep.id} />
                <input type="hidden" name="status" value={next} />
                <SubmitButton className="btn block" pendingText="변경 중…">“{next}” 단계로 넘기기</SubmitButton>
              </form>
            )}
          </section>

          <KontiEditor pageId={ep.id} hasKonti={/콘티/.test(body)} />

          <section className="card">
            <h2>노션 본문</h2>
            {body ? (
              <details>
                <summary className="small">지금 저장된 내용 보기 ({body.split('\n').length}줄)</summary>
                <pre className="body-text">{body}</pre>
              </details>
            ) : (
              <p className="muted small">아직 본문이 비어 있어요.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}

