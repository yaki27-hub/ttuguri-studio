import { isAuthed } from '@/lib/auth';
import { listEpisodes } from '@/lib/notion';
import { collectPosts, matchPosts, parseIgTime } from '@/lib/sync';
import { login, logout, syncNow, linkEpisode, unlinkEpisode } from './actions';
import UnlinkButton from './UnlinkButton';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('ko-KR') : '–');
const pct = (a, b) => (typeof a === 'number' && b > 0 ? (a / b) * 100 : null);
const fmtPct = (v) => (v == null ? '–' : `${v.toFixed(1)}%`);

function kstLabel(ts) {
  return parseIgTime(ts).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function firstLine(caption) {
  return (caption || '').split('\n').map((s) => s.trim()).find(Boolean) || '(캡션 없음)';
}

function tokenDaysLeft() {
  const raw = process.env.TOKEN_EXPIRES_AT;
  if (!raw) return null;
  const ms = new Date(`${raw}T00:00:00+09:00`) - new Date();
  return Math.ceil(ms / 86400000);
}

/* ---------- 로그인 ---------- */
function Login({ error }) {
  const configured = Boolean(process.env.DASHBOARD_PASSWORD);
  return (
    <main className="login">
      <form action={login} className="login-card">
        <div className="brand-mark" aria-hidden>뚜</div>
        <h1>뚜구리 스튜디오</h1>
        <p className="muted">@ttuguri 성과 대시보드</p>
        {configured ? (
          <>
            <input type="password" name="password" placeholder="비밀번호" autoFocus required />
            {error && <p className="error">비밀번호가 맞지 않아요.</p>}
            <button className="btn primary" type="submit">들어가기</button>
          </>
        ) : (
          <p className="error">Vercel 환경변수 DASHBOARD_PASSWORD 를 먼저 설정해 주세요.</p>
        )}
      </form>
    </main>
  );
}

/* ---------- 게시물 ↔ 에피소드 연결 ---------- */
function LinkForm({ post, candidates }) {
  if (!candidates.length) return <p className="muted small">연결할 수 있는 에피소드가 없어요.</p>;
  return (
    <form action={linkEpisode} className="link-form">
      <input type="hidden" name="mediaId" value={post.id} />
      <input type="hidden" name="permalink" value={post.permalink} />
      <input type="hidden" name="timestamp" value={post.timestamp} />
      <select name="pageId" required defaultValue="">
        <option value="" disabled>에피소드 선택…</option>
        {candidates.map((ep) => (
          <option key={ep.id} value={ep.id}>
            {ep.number != null ? `#${ep.number} ` : ''}{ep.title}{ep.status ? ` · ${ep.status}` : ''}
          </option>
        ))}
      </select>
      <button className="btn" type="submit">연결</button>
    </form>
  );
}

/* ---------- 게시물 카드 ---------- */
function PostRow({ post, candidates, maxViews }) {
  const i = post.insights || {};
  const shareRate = pct(i.shares, i.reach);
  const saveRate = pct(i.saved, i.reach);
  const thumb = post.thumbnail_url || (post.media_type === 'IMAGE' || post.media_type === 'CAROUSEL_ALBUM' ? post.media_url : null);
  const fresh = Date.now() - parseIgTime(post.timestamp).getTime() < 48 * 3600 * 1000;
  const barW = maxViews ? Math.max(2, Math.round(((i.views || 0) / maxViews) * 100)) : 0;

  return (
    <article className="post">
      <a className="thumb" href={post.permalink} target="_blank" rel="noreferrer">
        {thumb ? <img src={thumb} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span>{post.media_product_type === 'REELS' ? '릴스' : '게시물'}</span>}
      </a>

      <div className="post-main">
        <div className="post-head">
          <a href={post.permalink} target="_blank" rel="noreferrer" className="post-title">{firstLine(post.caption)}</a>
          <div className="post-meta">
            <span>{kstLabel(post.timestamp)}</span>
            <span className="tag">{post.media_product_type === 'REELS' ? '릴스' : '피드'}</span>
            {fresh && <span className="tag warn" title="인사이트는 최대 48시간 늦게 집계될 수 있어요">집계 중</span>}
            {post.insightsError && <span className="tag bad">인사이트 오류</span>}
          </div>
        </div>

        <div className="views-bar" aria-hidden><span style={{ width: `${barW}%` }} /></div>

        <dl className="metrics">
          <div><dt>조회</dt><dd>{fmt(i.views)}</dd></div>
          <div><dt>도달</dt><dd>{fmt(i.reach)}</dd></div>
          <div><dt>좋아요</dt><dd>{fmt(i.likes)}</dd></div>
          <div><dt>댓글</dt><dd>{fmt(i.comments)}</dd></div>
          <div><dt>공유</dt><dd>{fmt(i.shares)}</dd></div>
          <div><dt>저장</dt><dd>{fmt(i.saved)}</dd></div>
          <div className="rate"><dt>공유율</dt><dd>{fmtPct(shareRate)}</dd></div>
          <div className="rate"><dt>저장률</dt><dd>{fmtPct(saveRate)}</dd></div>
        </dl>
      </div>

      <div className="post-episode">
        {post.episode ? (
          <>
            <p className="label linked">노션 연결됨</p>
            <a className="episode-chip" href={post.episode.url} target="_blank" rel="noreferrer">
              <span className="dot" />
              {post.episode.number != null ? `#${post.episode.number} ` : ''}{post.episode.title}
            </a>
            <UnlinkButton
              action={unlinkEpisode}
              pageId={post.episode.id}
              timestamp={post.timestamp}
              title={post.episode.title}
            />
          </>
        ) : (
          <>
            <p className="label">노션 미연결</p>
            <LinkForm post={post} candidates={candidates} />
          </>
        )}
      </div>
    </article>
  );
}

/* ---------- 페이지 ---------- */
export default async function Page({ searchParams }) {
  const params = await searchParams;
  if (!(await isAuthed())) return <Login error={params?.error} />;

  // 인스타와 노션을 따로 불러와서, 한쪽이 실패해도 다른 쪽은 보이게 한다
  const [igRes, notionRes] = await Promise.allSettled([collectPosts(), listEpisodes()]);
  const posts = igRes.status === 'fulfilled' ? igRes.value : [];
  const episodes = notionRes.status === 'fulfilled' ? notionRes.value : [];
  const loadError = [
    igRes.status === 'rejected' && `인스타그램 — ${igRes.reason?.message}`,
    notionRes.status === 'rejected' && `노션 — ${notionRes.reason?.message}`,
  ].filter(Boolean).join(' / ') || null;

  const rows = matchPosts(posts, episodes);
  const linkedIds = new Set(rows.filter((r) => r.episode).map((r) => r.episode.id));
  const statusOrder = { '업로드 완료': 0, '제작 완료': 1, 검수: 2, '이미지 제작': 3, 콘티: 4, 스토리: 5, 아이디어: 6 };
  const candidates = episodes
    .filter((ep) => !ep.mediaId && !ep.link && !linkedIds.has(ep.id))
    .sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) || (a.number ?? 999) - (b.number ?? 999));

  const sum = (k) => rows.reduce((acc, r) => acc + (r.insights?.[k] || 0), 0);
  const totalReach = sum('reach');
  const maxViews = Math.max(0, ...rows.map((r) => r.insights?.views || 0));
  const linkedCount = rows.filter((r) => r.episode).length;
  const daysLeft = tokenDaysLeft();

  return (
    <main className="wrap">
      <header className="top">
        <div className="brand">
          <div className="brand-mark" aria-hidden>뚜</div>
          <div>
            <h1>뚜구리 스튜디오</h1>
            <p className="muted">@ttuguri 게시물 성과 · 매일 오전 9시 노션 자동 동기화</p>
          </div>
        </div>
        <div className="top-actions">
          <form action={syncNow}><button className="btn primary" type="submit">지금 노션에 동기화</button></form>
          <form action={logout}><button className="btn ghost" type="submit">로그아웃</button></form>
        </div>
      </header>

      {params?.msg && <p className="flash">{params.msg}</p>}
      {daysLeft != null && daysLeft <= 14 && (
        <p className={`flash ${daysLeft <= 3 ? 'bad' : 'warn'}`}>
          인스타 토큰이 {daysLeft > 0 ? `${daysLeft}일 후` : '이미'} 만료돼요. 토큰 디버거에서 연장한 뒤 Vercel 환경변수 IG_ACCESS_TOKEN 을 바꿔 주세요.
        </p>
      )}
      {loadError && <p className="flash bad">데이터를 불러오지 못했어요: {loadError}</p>}

      <section className="kpis">
        <div className="kpi"><span>게시물</span><strong>{rows.length}</strong></div>
        <div className="kpi"><span>총 조회</span><strong>{fmt(sum('views'))}</strong></div>
        <div className="kpi"><span>총 도달</span><strong>{fmt(totalReach)}</strong></div>
        <div className="kpi"><span>평균 공유율</span><strong>{fmtPct(pct(sum('shares'), totalReach))}</strong></div>
        <div className="kpi"><span>평균 저장률</span><strong>{fmtPct(pct(sum('saved'), totalReach))}</strong></div>
        <div className="kpi"><span>노션 연결</span><strong>{linkedCount}<small>/{rows.length}</small></strong></div>
      </section>

      <section className="list">
        {rows.map((post) => (
          <PostRow key={post.id} post={post} candidates={candidates} maxViews={maxViews} />
        ))}
        {!rows.length && !loadError && <p className="muted empty">표시할 게시물이 없어요.</p>}
      </section>

      <footer className="foot muted small">
        {daysLeft != null && <span>토큰 만료까지 {daysLeft}일</span>}
        <span>공유율·저장률 = 공유(저장) ÷ 도달</span>
      </footer>
    </main>
  );
}
