'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { linkEpisode, unlinkEpisode } from '../actions';
import UnlinkButton from '../UnlinkButton';

/* ---------- 타입 (lib/sync.js matchPosts 결과 중 화면에 쓰는 것만) ---------- */
type Insights = { views?: number; reach?: number; likes?: number; comments?: number; shares?: number; saved?: number };
type Episode = { id: string; url?: string; title: string; number: number | null; status?: string };
export type Post = {
  id: string;
  caption?: string;
  permalink: string;
  timestamp: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  insights?: Insights;
  insightsError?: string;
  episode: Episode | null;
};
type Props = {
  rows: Post[];
  candidates: Episode[];
  /** 노션 제작 상태별 에피소드 수 (뚜구리 채널만) */
  statusCounts: [string, number][];
  card: boolean;
  /** 서버에서 정한 기준 시각 (서버·브라우저 계산을 맞추기 위함) */
  now: number;
  tokenDaysLeft: number | null;
  tokenVar: string;
};

type Period = '7' | '30' | 'all';
type Metric = 'views' | 'reach' | 'saved';
type Sort = 'recent' | 'views' | 'saveRate' | 'shareRate';

const PERIODS: [Period, string][] = [['7', '최근 7일'], ['30', '최근 30일'], ['all', '전체']];
const METRICS: [Metric, string][] = [['views', '조회'], ['reach', '도달'], ['saved', '저장']];
const DAY = 86400000;

/* ---------- 계산 도우미 ---------- */
const fmt = (n?: number | null) => (typeof n === 'number' ? n.toLocaleString('ko-KR') : '–');
const pct = (a: number | undefined, b: number | undefined) => (typeof a === 'number' && b ? (a / b) * 100 : null);
const fmtPct = (v: number | null) => (v == null ? '–' : `${v.toFixed(1)}%`);
/** "2026-10-30T08:45:06+0000" → ms */
const igTime = (ts: string) => new Date(String(ts).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).getTime();
/** 한국 시간 날짜 키 (YYYY-MM-DD) */
const kstKey = (ms: number) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
const firstLine = (c?: string) => (c || '').split('\n').map((s) => s.trim()).find(Boolean) || '(캡션 없음)';
const isReels = (p: Post) => p.media_product_type === 'REELS';
const sumOf = (rows: Post[], k: keyof Insights) => rows.reduce((acc, r) => acc + (r.insights?.[k] || 0), 0);

function kstLabel(ts: string) {
  return new Date(igTime(ts)).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/* ---------- 요약 카드 ---------- */
function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <em>{sub}</em>}
    </div>
  );
}

/* ---------- 날짜별 막대 차트 (의존성 없이 SVG) ---------- */
function TrendChart({ days, metric }: { days: { key: string; value: number; posts: number }[]; metric: string }) {
  const W = 640, H = 180, padL = 40, padB = 22, padT = 8;
  const max = Math.max(1, ...days.map((d) => d.value));
  const step = (W - padL) / Math.max(1, days.length);
  const bw = Math.max(2, Math.min(28, step * 0.7));
  const labelEvery = Math.ceil(days.length / 8);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`게시일별 ${metric} 막대 차트`}>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(max * t)} y2={y(max * t)} className="grid" />
          <text x={padL - 6} y={y(max * t) + 4} textAnchor="end" className="axis">
            {Math.round(max * t).toLocaleString('ko-KR')}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = padL + step * i + (step - bw) / 2;
        return (
          <g key={d.key}>
            <rect x={x} y={y(d.value)} width={bw} height={Math.max(0, H - padB - y(d.value))} rx={3} className={d.posts ? 'bar' : 'bar zero'}>
              <title>{`${d.key} · 게시물 ${d.posts}개 · ${metric} ${d.value.toLocaleString('ko-KR')}`}</title>
            </rect>
            {i % labelEvery === 0 && (
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="axis">
                {Number(d.key.slice(5, 7))}/{Number(d.key.slice(8))}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- 상태별 가로 막대 ---------- */
function StatusChart({ counts }: { counts: [string, number][] }) {
  const max = Math.max(1, ...counts.map(([, n]) => n));
  if (!counts.length) return <p className="muted small">노션 에피소드가 없어요.</p>;
  return (
    <ul className="hbars">
      {counts.map(([name, n]) => (
        <li key={name}>
          <span className="hb-label">{name}</span>
          <span className="hb-track"><span style={{ width: `${(n / max) * 100}%` }} /></span>
          <b>{n}</b>
        </li>
      ))}
    </ul>
  );
}

/* ---------- 게시물 ↔ 에피소드 연결 ---------- */
function LinkForm({ post, candidates }: { post: Post; candidates: Episode[] }) {
  if (!candidates.length) return <p className="muted small">연결할 수 있는 에피소드가 없어요.</p>;
  return (
    <form action={linkEpisode} className="link-form">
      <input type="hidden" name="mediaId" value={post.id} />
      <input type="hidden" name="permalink" value={post.permalink} />
      <input type="hidden" name="timestamp" value={post.timestamp} />
      <select name="pageId" required defaultValue="" aria-label="연결할 에피소드">
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
function PostRow({ post, candidates, maxViews, card, now }: { post: Post; candidates: Episode[]; maxViews: number; card: boolean; now: number }) {
  const i = post.insights || {};
  const thumb = post.thumbnail_url || (post.media_type === 'IMAGE' || post.media_type === 'CAROUSEL_ALBUM' ? post.media_url : null);
  const fresh = now - igTime(post.timestamp) < 48 * 3600 * 1000;
  const barW = maxViews ? Math.max(2, Math.round(((i.views || 0) / maxViews) * 100)) : 0;

  return (
    <article className={`post ${card ? 'no-ep' : ''}`}>
      <a className="thumb" href={post.permalink} target="_blank" rel="noreferrer">
        {thumb ? <img src={thumb} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span>{isReels(post) ? '릴스' : '게시물'}</span>}
      </a>

      <div className="post-main">
        <div className="post-head">
          <a href={post.permalink} target="_blank" rel="noreferrer" className="post-title">{firstLine(post.caption)}</a>
          <div className="post-meta">
            <span>{kstLabel(post.timestamp)}</span>
            <span className="tag">{isReels(post) ? '릴스' : '피드'}</span>
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
          <div className="rate"><dt>공유율</dt><dd>{fmtPct(pct(i.shares, i.reach))}</dd></div>
          <div className="rate"><dt>저장률</dt><dd>{fmtPct(pct(i.saved, i.reach))}</dd></div>
        </dl>
      </div>

      {!card && (
        <div className="post-episode">
          {post.episode ? (
            <>
              <p className="label linked">노션 연결됨</p>
              <a className="episode-chip" href={post.episode.url} target="_blank" rel="noreferrer">
                <span className="dot" />
                {post.episode.number != null ? `#${post.episode.number} ` : ''}{post.episode.title}
              </a>
              <UnlinkButton action={unlinkEpisode} pageId={post.episode.id} timestamp={post.timestamp} title={post.episode.title} />
            </>
          ) : (
            <>
              <p className="label">노션 미연결</p>
              <LinkForm post={post} candidates={candidates} />
            </>
          )}
        </div>
      )}
    </article>
  );
}

/* ---------- 성과 보드 ---------- */
export default function StatsBoard({ rows, candidates, statusCounts, card, now, tokenDaysLeft, tokenVar }: Props) {
  const [period, setPeriod] = useState<Period>('30');
  const [metric, setMetric] = useState<Metric>('views');
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | 'reels' | 'feed'>('all');
  const [link, setLink] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [sort, setSort] = useState<Sort>('recent');

  // 1) 기간: 카드·차트·목록이 모두 이 결과를 쓴다
  const inPeriod = useMemo(() => {
    if (period === 'all') return rows;
    const from = now - Number(period) * DAY;
    return rows.filter((r) => igTime(r.timestamp) >= from);
  }, [rows, period, now]);

  // 2) 요약 숫자
  const totalReach = sumOf(inPeriod, 'reach');
  const linkedCount = inPeriod.filter((r) => r.episode).length;

  // 3) 날짜별 차트 (빈 날도 0으로 채움)
  const days = useMemo(() => {
    const oldest = inPeriod.length ? Math.min(...inPeriod.map((r) => igTime(r.timestamp))) : now;
    const span = period === 'all' ? Math.ceil((now - oldest) / DAY) + 1 : Number(period);
    const map = new Map<string, { key: string; value: number; posts: number }>();
    for (let d = span - 1; d >= 0; d--) {
      const key = kstKey(now - d * DAY);
      map.set(key, { key, value: 0, posts: 0 });
    }
    for (const r of inPeriod) {
      const slot = map.get(kstKey(igTime(r.timestamp)));
      if (slot) { slot.value += r.insights?.[metric] || 0; slot.posts += 1; }
    }
    return [...map.values()];
  }, [inPeriod, period, metric, now]);

  // 4) 목록: 검색·필터·정렬은 목록에만 적용
  const filtered = useMemo(() => {
    const word = q.trim().toLowerCase();
    const list = inPeriod.filter((r) =>
      (!word || (r.caption || '').toLowerCase().includes(word)) &&
      (type === 'all' || (type === 'reels') === isReels(r)) &&
      (link === 'all' || (link === 'linked') === Boolean(r.episode)));
    const rate = (r: Post, k: 'saved' | 'shares') => pct(r.insights?.[k], r.insights?.reach) ?? -1;
    const by: Record<Sort, (a: Post, b: Post) => number> = {
      recent: (a, b) => igTime(b.timestamp) - igTime(a.timestamp),
      views: (a, b) => (b.insights?.views || 0) - (a.insights?.views || 0),
      saveRate: (a, b) => rate(b, 'saved') - rate(a, 'saved'),
      shareRate: (a, b) => rate(b, 'shares') - rate(a, 'shares'),
    };
    return [...list].sort(by[sort]);
  }, [inPeriod, q, type, link, sort]);
  const maxViews = Math.max(0, ...filtered.map((r) => r.insights?.views || 0));
  const filtering = Boolean(q.trim()) || type !== 'all' || link !== 'all';
  const resetFilters = () => { setQ(''); setType('all'); setLink('all'); };

  // 5) 확인할 일 (기간과 상관없이 전체 게시물 기준)
  const unlinked = card ? [] : rows.filter((r) => !r.episode);
  const fresh = rows.filter((r) => now - igTime(r.timestamp) < 48 * 3600 * 1000);
  const errors = rows.filter((r) => r.insightsError);
  const todos: { tone: 'warn' | 'bad' | 'info'; text: string; action?: () => void; actionLabel?: string }[] = [];
  if (tokenDaysLeft != null && tokenDaysLeft <= 14) {
    todos.push({
      tone: tokenDaysLeft <= 3 ? 'bad' : 'warn',
      text: `인스타 토큰이 ${tokenDaysLeft > 0 ? `${tokenDaysLeft}일 후` : '이미'} 만료돼요. 토큰을 연장한 뒤 Vercel 환경변수 ${tokenVar}를 바꿔 주세요.`,
    });
  }
  if (errors.length) todos.push({ tone: 'bad', text: `인사이트를 못 불러온 게시물 ${errors.length}개` });
  if (unlinked.length) {
    todos.push({
      tone: 'warn',
      text: `노션에 연결 안 된 게시물 ${unlinked.length}개`,
      actionLabel: '목록에서 보기',
      action: () => { setPeriod('all'); setQ(''); setType('all'); setLink('unlinked'); document.getElementById('post-list')?.scrollIntoView({ behavior: 'smooth' }); },
    });
  }
  if (fresh.length) todos.push({ tone: 'info', text: `48시간 안에 올린 게시물 ${fresh.length}개 — 수치가 아직 늘어나는 중이에요` });

  return (
    <>
      <div className="board-bar">
        <div className="seg" role="group" aria-label="기간 선택">
          {PERIODS.map(([v, label]) => (
            <button key={v} type="button" className={period === v ? 'on' : ''} aria-pressed={period === v} onClick={() => setPeriod(v)}>{label}</button>
          ))}
        </div>
        <span className="muted small">게시일 기준 · 카드·차트·목록이 같이 바뀌어요</span>
      </div>

      <section className={`kpis ${card ? 'five' : ''}`} aria-label="요약">
        <Kpi label="게시물" value={inPeriod.length} sub={`릴스 ${inPeriod.filter(isReels).length} · 피드 ${inPeriod.filter((r) => !isReels(r)).length}`} />
        <Kpi label="총 조회" value={fmt(sumOf(inPeriod, 'views'))} sub={`게시물당 ${fmt(inPeriod.length ? Math.round(sumOf(inPeriod, 'views') / inPeriod.length) : 0)}`} />
        <Kpi label="총 도달" value={fmt(totalReach)} />
        <Kpi label="평균 공유율" value={fmtPct(pct(sumOf(inPeriod, 'shares'), totalReach))} sub={`공유 ${fmt(sumOf(inPeriod, 'shares'))}`} />
        <Kpi label="평균 저장률" value={fmtPct(pct(sumOf(inPeriod, 'saved'), totalReach))} sub={`저장 ${fmt(sumOf(inPeriod, 'saved'))}`} />
        {!card && <Kpi label="노션 연결" value={<>{linkedCount}<small>/{inPeriod.length}</small></>} sub={`미연결 ${inPeriod.length - linkedCount}`} />}
      </section>

      <section className={`charts ${card ? 'one' : ''}`}>
        <div className="panel">
          <div className="panel-head">
            <h2>게시일별 {METRICS.find(([m]) => m === metric)?.[1]}</h2>
            <div className="seg small" role="group" aria-label="차트 지표">
              {METRICS.map(([m, label]) => (
                <button key={m} type="button" className={metric === m ? 'on' : ''} aria-pressed={metric === m} onClick={() => setMetric(m)}>{label}</button>
              ))}
            </div>
          </div>
          {inPeriod.length ? <TrendChart days={days} metric={METRICS.find(([m]) => m === metric)?.[1] || ''} /> : <p className="muted empty">이 기간에 올린 게시물이 없어요.</p>}
          <p className="muted small">그날 올린 게시물의 지금까지 누적값이에요. 막대에 마우스를 올리면 숫자가 보여요.</p>
        </div>
        {!card && (
          <div className="panel">
            <div className="panel-head"><h2>제작 상태별 에피소드</h2></div>
            <StatusChart counts={statusCounts} />
            <p className="muted small">노션 에피소드 DB 전체 기준 (기간과 상관없음)</p>
          </div>
        )}
      </section>

      <section className="panel todo" aria-label="확인할 일">
        <div className="panel-head"><h2>확인할 일</h2></div>
        {todos.length ? (
          <ul>
            {todos.map((t) => (
              <li key={t.text} className={t.tone}>
                <span className="todo-dot" aria-hidden />
                <span>{t.text}</span>
                {t.action && <button type="button" className="btn small" onClick={t.action}>{t.actionLabel}</button>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">지금 확인할 일이 없어요.</p>
        )}
      </section>

      <section id="post-list" className="list-tools" aria-label="게시물 찾기">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="캡션 검색" aria-label="캡션 검색" />
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="형식">
          <option value="all">릴스·피드 전체</option>
          <option value="reels">릴스</option>
          <option value="feed">피드</option>
        </select>
        {!card && (
          <select value={link} onChange={(e) => setLink(e.target.value as typeof link)} aria-label="노션 연결">
            <option value="all">연결 상태 전체</option>
            <option value="linked">노션 연결됨</option>
            <option value="unlinked">노션 미연결</option>
          </select>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬">
          <option value="recent">최신순</option>
          <option value="views">조회 많은 순</option>
          <option value="saveRate">저장률 높은 순</option>
          <option value="shareRate">공유율 높은 순</option>
        </select>
        <button type="button" className="btn ghost" onClick={resetFilters} disabled={!filtering}>필터 해제</button>
        <span className="muted small count">{filtering ? `${inPeriod.length}개 중 ${filtered.length}개` : `${filtered.length}개`}</span>
      </section>

      <section className="list">
        {filtered.map((post) => (
          <PostRow key={post.id} post={post} candidates={candidates} maxViews={maxViews} card={card} now={now} />
        ))}
        {!filtered.length && (
          <div className="muted empty">
            {filtering ? (
              <>
                <p>조건에 맞는 게시물이 없어요.</p>
                <button type="button" className="btn" onClick={resetFilters}>검색·필터 해제</button>
              </>
            ) : rows.length ? (
              <p>이 기간에 올린 게시물이 없어요. 기간을 넓혀 보세요.</p>
            ) : (
              <p>표시할 게시물이 없어요.</p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
