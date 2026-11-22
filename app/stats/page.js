import { isAuthed } from '@/lib/auth';
import { listEpisodes } from '@/lib/notion';
import { collectPosts, matchPosts } from '@/lib/sync';
import { logout, syncNow } from '../actions';
import Login from '../Login';
import Nav from '../Nav';
import StatsBoard from './StatsBoard';
import { getChannel } from '@/lib/channel-server';
import { igAccount } from '@/lib/channel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function tokenDaysLeft(channel) {
  const raw = igAccount(channel).expires;
  if (!raw) return null;
  const ms = new Date(`${raw}T00:00:00+09:00`) - new Date();
  return Math.ceil(ms / 86400000);
}

/* ---------- 페이지 ---------- */
export default async function Page({ searchParams }) {
  const params = await searchParams;
  if (!(await isAuthed())) return <Login error={params?.error} />;

  const channel = await getChannel();
  const card = channel === 'card';
  const acct = igAccount(channel);
  // 인스타와 노션을 따로 불러와서, 한쪽이 실패해도 다른 쪽은 보이게 한다.
  // 노션 에피소드 DB는 뚜구리툰 것이라 카드뉴스 채널에서는 읽지 않는다.
  const [igRes, notionRes] = await Promise.allSettled([collectPosts(channel), card ? Promise.resolve([]) : listEpisodes()]);
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

  // 노션 제작 상태별 에피소드 수 (작업 순서대로)
  const statusFlow = ['아이디어', '스토리', '콘티', '이미지 제작', '검수', '제작 완료', '업로드 완료'];
  const statusMap = new Map(statusFlow.map((s) => [s, 0]));
  for (const ep of episodes) statusMap.set(ep.status || '상태 없음', (statusMap.get(ep.status || '상태 없음') || 0) + 1);
  const statusCounts = [...statusMap].filter(([s, n]) => n > 0 || statusFlow.includes(s));
  const daysLeft = tokenDaysLeft(channel);

  return (
    <main className="wrap">
      <header className="top">
        <div className="brand">
          <div className={`brand-mark ${card ? 'card' : ''}`} aria-hidden>{card ? 'AI' : '뚜'}</div>
          <div>
            <h1>{card ? 'AI 카드뉴스 성과' : '뚜구리 스튜디오'}</h1>
            <p className="muted">{card ? '카드뉴스 계정 게시물 성과 · 저장률이 핵심 지표' : '@ttuguri 게시물 성과 · 매일 오전 9시 노션 자동 동기화'}</p>
          </div>
        </div>
        <div className="top-actions">
          {!card && <form action={syncNow}><button className="btn primary" type="submit">지금 노션에 동기화</button></form>}
          <form action={logout}><button className="btn ghost" type="submit">로그아웃</button></form>
        </div>
      </header>

      <Nav active="stats" />
      {params?.msg && <p className="flash">{params.msg}</p>}
      {card && !acct.token && (
        <p className="flash warn">
          카드뉴스 인스타 계정이 아직 연결되지 않았어요. Vercel 환경변수에 CARD_IG_ACCESS_TOKEN, CARD_IG_USER_ID(필요하면 CARD_TOKEN_EXPIRES_AT, CARD_SINCE_DATE)를 넣고 Redeploy해 주세요.
        </p>
      )}
      {loadError && !(card && !acct.token) && <p className="flash bad">데이터를 불러오지 못했어요: {loadError}</p>}

      {!(card && !acct.token) && (
        <StatsBoard
          rows={rows}
          candidates={candidates}
          statusCounts={statusCounts}
          card={card}
          now={Date.now()}
          tokenDaysLeft={daysLeft}
          tokenVar={acct.tokenVar}
        />
      )}

      <footer className="foot muted small">
        {daysLeft != null && <span>토큰 만료까지 {daysLeft}일</span>}
        <span>공유율·저장률 = 공유(저장) ÷ 도달</span>
      </footer>
    </main>
  );
}
