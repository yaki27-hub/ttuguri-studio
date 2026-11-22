'use client';

import { useMemo } from 'react';
import type { Post } from './StatsBoard';

/* 주간 콘텐츠 점검: 최근 7일 vs 그 전 7일, 업로드 시간대별 반응, 새 팔로워 */

type Followers = {
  followers: number | null;
  daily: { end: string; value: number }[] | null;
  dailyError: string | null;
} | null;
type Props = { rows: Post[]; followers: Followers; card: boolean; now: number };
type Key = 'posts' | 'views' | 'reach' | 'likes' | 'comments' | 'saved' | 'shares' | 'newFollowers';

const DAY = 86400000;
const igTime = (ts: string) => new Date(String(ts).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).getTime();
const kstHour = (ms: number) => new Date(ms + 9 * 3600 * 1000).getUTCHours();
const kstDate = (ms: number) =>
  new Date(ms).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
const fmt = (n: number | null | undefined) => (typeof n === 'number' ? Math.round(n).toLocaleString('ko-KR') : '–');
const firstLine = (c?: string) => (c || '').split('\n').map((s) => s.trim()).find(Boolean) || '(캡션 없음)';

/** 플래너의 4개 시간대 + 그 밖 */
const SLOTS = [
  { id: 'commute', label: '출근', range: '7–9시', test: (h: number) => h >= 7 && h < 9 },
  { id: 'lunch', label: '점심', range: '12–14시', test: (h: number) => h >= 12 && h < 14 },
  { id: 'evening', label: '퇴근', range: '17–19시', test: (h: number) => h >= 17 && h < 19 },
  { id: 'night', label: '취침 전', range: '21–23시', test: (h: number) => h >= 21 && h < 23 },
  { id: 'other', label: '그 밖', range: '', test: () => true },
] as const;
const slotOf = (ms: number) => SLOTS.find((s) => s.test(kstHour(ms)))!;

function Delta({ cur, prev }: { cur: number | null; prev: number | null }) {
  if (cur == null || prev == null) return <span className="wr-delta">–</span>;
  if (prev === 0) return <span className="wr-delta">{cur > 0 ? '새로 생김' : '–'}</span>;
  const d = ((cur - prev) / prev) * 100;
  const cls = Math.abs(d) < 1 ? '' : d > 0 ? 'up' : 'down';
  return (
    <span className={`wr-delta ${cls}`}>
      {d > 0 ? '▲' : d < 0 ? '▼' : ''} {Math.abs(d).toFixed(0)}%
    </span>
  );
}

export default function WeeklyReview({ rows, followers, card, now }: Props) {
  const data = useMemo(() => {
    const posts = rows
      .map((r) => ({ ...r, ms: igTime(r.timestamp) }))
      .filter((r) => !Number.isNaN(r.ms));
    const inRange = (from: number, to: number) => posts.filter((p) => p.ms > from && p.ms <= to);
    const thisWeek = inRange(now - 7 * DAY, now);
    const lastWeek = inRange(now - 14 * DAY, now - 7 * DAY);

    // 하루별 새 팔로워: end_time 이 그 날의 끝이므로 끝 시각으로 구간을 나눈다
    const daily = followers?.daily ?? null;
    const followSum = (from: number, to: number) => {
      if (!daily) return null;
      const list = daily.filter((d) => {
        const t = igTime(d.end);
        return t > from && t <= to;
      });
      return list.length ? list.reduce((a, d) => a + d.value, 0) : null;
    };

    const totals = (list: typeof posts, from: number, to: number): Record<Key, number | null> => {
      const sum = (k: 'views' | 'reach' | 'likes' | 'comments' | 'saved' | 'shares') =>
        list.reduce((a, p) => a + (p.insights?.[k] || 0), 0);
      return {
        posts: list.length,
        views: sum('views'),
        reach: sum('reach'),
        likes: sum('likes'),
        comments: sum('comments'),
        saved: sum('saved'),
        shares: sum('shares'),
        newFollowers: followSum(from, to),
      };
    };
    const cur = totals(thisWeek, now - 7 * DAY, now);
    const prev = totals(lastWeek, now - 14 * DAY, now - 7 * DAY);

    // 시간대별: 이번 주 게시 수 + 최근 30일 게시물의 평균 반응
    const month = inRange(now - 30 * DAY, now);
    const main = card ? 'saved' : 'views';
    const slots = SLOTS.map((s) => {
      const m = month.filter((p) => slotOf(p.ms).id === s.id);
      const avg = (k: 'views' | 'reach' | 'saved' | 'likes') =>
        m.length ? m.reduce((a, p) => a + (p.insights?.[k] || 0), 0) / m.length : null;
      return {
        ...s,
        week: thisWeek.filter((p) => slotOf(p.ms).id === s.id).length,
        monthPosts: m.length,
        reach: avg('reach'),
        main: avg(main),
        likes: avg('likes'),
      };
    });
    // 2개 이상 올린 시간대 중 주 지표 평균이 가장 높은 곳
    const best = [...slots].filter((s) => s.monthPosts >= 2 && s.main != null).sort((a, b) => b.main! - a.main!)[0]?.id;
    // 이번 주에 가장 많이 올린 시간대 (같은 수가 여럿이면 없음)
    const sorted = [...slots].sort((a, b) => b.week - a.week);
    const mostWeek = sorted[0].week > (sorted[1]?.week ?? 0) ? sorted[0] : null;

    const score = (p: (typeof posts)[number]) => (card ? p.insights?.saved || 0 : p.insights?.views || 0);
    const top = [...thisWeek].sort((a, b) => score(b) - score(a))[0];

    return { cur, prev, slots, best, mostWeek, top, monthCount: month.length };
  }, [rows, followers, card, now]);

  const { cur, prev, slots, best, mostWeek, top, monthCount } = data;
  const lines: [Key, string][] = [
    ['posts', '게시물'],
    ['views', '조회'],
    ['reach', '도달'],
    ['likes', '좋아요'],
    ['comments', '댓글'],
    ['saved', '저장'],
    ['shares', '공유'],
    ['newFollowers', '새 팔로워'],
  ];
  const mainLabel = card ? '저장' : '조회';
  const followNote = !followers
    ? null
    : followers.daily
      ? null
      : '하루별 새 팔로워는 인스타가 팔로워 100명 이상 계정에만 줘요' +
        (followers.dailyError ? ` (${followers.dailyError})` : '');

  return (
    <section className="stat-panel weekly-review" aria-labelledby="wr-title">
      <div className="stat-head">
        <h2 id="wr-title">주간 콘텐츠 점검</h2>
        <span className="muted small">
          최근 7일({kstDate(now - 7 * DAY)}~) · 그 전 7일과 비교
        </span>
      </div>

      <div className="wr-grid">
        <div className="wr-block">
          <h3>이번 주 숫자</h3>
          <table className="wr-table">
            <thead>
              <tr><th scope="col">항목</th><th scope="col">이번 주</th><th scope="col">지난주</th><th scope="col">변화</th></tr>
            </thead>
            <tbody>
              {lines.map(([k, label]) => (
                <tr key={k}>
                  <th scope="row">{label}</th>
                  <td><b>{fmt(cur[k])}</b></td>
                  <td>{fmt(prev[k])}</td>
                  <td><Delta cur={cur[k]} prev={prev[k]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            팔로워 지금 {fmt(followers?.followers)}명 · 조회·저장은 이번 주에 올린 게시물이 받은 누적값이에요.
            {followNote && <><br />{followNote}</>}
          </p>
        </div>

        <div className="wr-block">
          <h3>올린 시간대</h3>
          <table className="wr-table">
            <thead>
              <tr>
                <th scope="col">시간대</th>
                <th scope="col">이번 주</th>
                <th scope="col">30일 평균 {mainLabel}</th>
                <th scope="col">30일 평균 도달</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((s) => (
                <tr key={s.id} className={s.id === best ? 'best' : ''}>
                  <th scope="row">
                    {s.label} <span className="muted">{s.range}</span>
                    {s.id === best && <span className="wr-badge">가장 좋음</span>}
                  </th>
                  <td>{s.week}개</td>
                  <td>{s.monthPosts ? fmt(s.main) : '–'}</td>
                  <td>{s.monthPosts ? fmt(s.reach) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            {!cur.posts
              ? '이번 주에 올린 게시물이 없어요. '
              : mostWeek
                ? `이번 주는 주로 ${mostWeek.label}${mostWeek.range ? `(${mostWeek.range})` : ''}에 올렸어요. `
                : '이번 주는 여러 시간대에 고르게 올렸어요. '}
            평균은 최근 30일 게시물 {monthCount}개 기준(한국 시간), 2개 이상 올린 시간대만 비교해요.
          </p>
        </div>
      </div>

      {top && (
        <p className="wr-top">
          <span className="muted small">이번 주 {mainLabel} 1위</span>{' '}
          <a href={top.permalink} target="_blank" rel="noreferrer">{firstLine(top.caption).slice(0, 60)}</a>{' '}
          <span className="muted small">
            · 조회 {fmt(top.insights?.views)} · 저장 {fmt(top.insights?.saved)} · 공유 {fmt(top.insights?.shares)}
          </span>
        </p>
      )}
    </section>
  );
}
