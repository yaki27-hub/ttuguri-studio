'use client';

/*
 * 성과 화면 보조 기능
 * - 같은 편(피드·릴스) 묶음 비교
 * - 터진 편: 같은 유형 중간값의 3배 이상 → 표시하고 내 레퍼런스 보드에 자동 저장
 * - 후킹 코드·패턴 태그·유입/전환별 성과표
 * 태그는 이 브라우저의 작업 에피소드(노션 연결)에 저장된다.
 */
import { useEffect, useMemo, useState } from 'react';
import { onBroadcast } from '@/lib/work/db';
import { createEpisode, listEpisodes, patchEpisode } from '@/lib/work/repo';
import { createReference, findReferenceByUrl } from '@/lib/work/refs';
import { HOOKS, hookById } from '@/lib/work/hooks';
import { HIT_MIN_POSTS, HIT_MULTIPLE, PATTERNS, ROLE_HINT, ROLE_LABEL, guessPatterns, median, type Role } from '@/lib/work/patterns';
import type { Episode as WorkEp } from '@/lib/work/types';
import type { Post } from './StatsBoard';

const fmt = (n?: number | null) => (typeof n === 'number' ? Math.round(n).toLocaleString('ko-KR') : '–');
const fmtPct = (v: number | null) => (v == null ? '–' : `${v.toFixed(1)}%`);
const isReels = (p: Post) => p.media_product_type === 'REELS';
const firstLine = (c?: string) => (c || '').split('\n').map((s) => s.trim()).find(Boolean) || '(캡션 없음)';
const igTime = (ts: string) => new Date(String(ts).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).getTime();

/* ───────── 묶음 ───────── */

export const groupKey = (p: Post) => (p.episode ? `ep:${p.episode.id}` : `post:${p.id}`);

export type Group = { key: string; posts: Post[]; title: string; episodeId?: string; caption: string; first: number };

export function groupPosts(rows: Post[]): Group[] {
  const m = new Map<string, Group>();
  for (const p of rows) {
    const k = groupKey(p);
    const g = m.get(k) || { key: k, posts: [], title: p.episode?.title || firstLine(p.caption), episodeId: p.episode?.id, caption: p.caption || '', first: igTime(p.timestamp) };
    g.posts.push(p);
    g.first = Math.min(g.first, igTime(p.timestamp));
    if (!g.caption && p.caption) g.caption = p.caption;
    m.set(k, g);
  }
  return [...m.values()];
}

const sum = (posts: Post[], k: 'views' | 'reach' | 'shares' | 'saved' | 'likes') => posts.reduce((a, p) => a + (p.insights?.[k] || 0), 0);

/** 피드 미연결 게시물에 어울리는 '같은 편' 후보: 캡션 첫 줄이 같거나, 3일 안에 올린 비슷한 캡션 */
export function sameEpisodeGuess(post: Post, rows: Post[]) {
  const norm = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '');
  const line = norm(firstLine(post.caption));
  const words = new Set(firstLine(post.caption).split(/\s+/).filter((w) => w.length > 1));
  let best: { ep: NonNullable<Post['episode']>; score: number } | null = null;
  for (const r of rows) {
    if (!r.episode || r.id === post.id || isReels(r) === isReels(post)) continue;
    const near = Math.abs(igTime(r.timestamp) - igTime(post.timestamp)) < 3 * 864e5;
    let score = 0;
    if (line && line === norm(firstLine(r.caption))) score = 1;
    else if (near && words.size) {
      const other = firstLine(r.caption).split(/\s+/);
      score = other.filter((w) => words.has(w)).length / words.size;
    }
    if (score >= 0.5 && (!best || score > best.score)) best = { ep: r.episode, score };
  }
  return best?.ep ?? null;
}

/* ───────── 터진 편 ───────── */

export type Hit = { multiple: number; median: number };

/** 게시물 id → 터진 편 정보 (같은 유형 중간값의 3배 이상) */
export function findHits(rows: Post[]): Map<string, Hit> {
  const out = new Map<string, Hit>();
  for (const reels of [true, false]) {
    const list = rows.filter((r) => isReels(r) === reels && typeof r.insights?.views === 'number');
    if (list.length < HIT_MIN_POSTS) continue;
    const med = median(list.map((r) => r.insights!.views!));
    if (!med) continue;
    for (const r of list) {
      const m = r.insights!.views! / med;
      if (m >= HIT_MULTIPLE) out.set(r.id, { multiple: m, median: med });
    }
  }
  return out;
}

/** 터진 편을 내 레퍼런스 보드에 쌓는다 (이미 있으면 건너뜀). 이 브라우저 저장소에 쓴다. */
export function useAutoHitRefs(rows: Post[], hits: Map<string, Hit>, channel: 'toon' | 'card') {
  const [added, setAdded] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      let n = 0;
      for (const r of rows) {
        const h = hits.get(r.id);
        if (!h) continue;
        try {
          if (await findReferenceByUrl(r.permalink)) continue;
          const i = r.insights || {};
          await createReference({
            url: r.permalink,
            account: r.username || (channel === 'card' ? '내 카드뉴스 계정' : 'ttuguri'),
            postType: isReels(r) ? 'reel' : r.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : 'feed',
            tags: ['내 계정', '터진 편'],
            likes: i.likes,
            comments: i.comments,
            views: i.views,
            metricsAt: new Date().toISOString(),
            metricsSource: `내 인사이트 · ${isReels(r) ? '릴스' : '피드'} 중간값의 ${h.multiple.toFixed(1)}배`,
            take: firstLine(r.caption).slice(0, 100),
            note: `공유 ${fmt(i.shares)} · 저장 ${fmt(i.saved)} · 도달 ${fmt(i.reach)}`,
            caption: r.caption || '',
            channel,
          });
          n++;
        } catch {
          /* 중복·저장 실패는 건너뜀 */
        }
      }
      if (alive) setAdded(n);
    })();
    return () => {
      alive = false;
    };
  }, [rows, hits, channel]);
  return added;
}

/* ───────── 작업 에피소드 (태그 저장소) ───────── */

export function useWorkEps() {
  const [eps, setEps] = useState<WorkEp[] | null>(null);
  useEffect(() => {
    const load = () => listEpisodes().then(setEps, () => setEps([]));
    load();
    return onBroadcast((m) => (m.kind === 'episode' || m.kind === 'episodes') && load());
  }, []);
  const byNotion = useMemo(() => {
    const m = new Map<string, WorkEp>();
    for (const e of eps ?? []) if (e.notionPageId) m.set(e.notionPageId.replace(/-/g, ''), e);
    return m;
  }, [eps]);
  const of = (notionId?: string) => (notionId ? byNotion.get(notionId.replace(/-/g, '')) : undefined);
  return { eps, of };
}

/** 그룹의 태그: 직접 단 것 + 후킹 코드 + 유입/전환. 직접 단 패턴이 없으면 캡션으로 짐작 */
export function tagsOf(g: Group, ep?: WorkEp) {
  const explicit = ep?.patterns?.length ? ep.patterns : null;
  const patterns = explicit ?? guessPatterns(`${g.title}\n${g.caption}`);
  return { patterns, guessed: !explicit, hookId: ep?.hookId, role: ep?.role };
}

/* ───────── 태그 편집 (게시물 카드 안) ───────── */

export function TagEditor({ g, ep }: { g: Group; ep?: WorkEp }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const t = tagsOf(g, ep);
  if (!g.episodeId) return null;

  async function ensure(): Promise<WorkEp> {
    if (ep) return ep;
    // 노션에만 있는 편: 태그를 담을 작업 에피소드를 '게시 완료' 상태로 만든다
    return createEpisode(g.caption || g.title, {
      title: g.title,
      titleIsAuto: false,
      notionPageId: g.episodeId,
      status: 'published',
      stage: 'publish',
      publishedAt: new Date(g.first).toISOString(),
    });
  }
  async function save(patch: Partial<WorkEp>) {
    setBusy(true);
    try {
      const e = await ensure();
      await patchEpisode(e.id, patch);
    } finally {
      setBusy(false);
    }
  }
  const togglePattern = (p: string) => {
    const cur = ep?.patterns?.length ? ep.patterns : t.patterns;
    save({ patterns: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] });
  };

  return (
    <div className="tag-edit">
      <div className="tag-line">
        {t.hookId && <span className="tag hot">{t.hookId}</span>}
        {t.role && <span className="tag good">{ROLE_LABEL[t.role]}</span>}
        {t.patterns.map((p) => (
          <span key={p} className={`tag ${t.guessed ? 'dashed' : ''}`} title={t.guessed ? '캡션으로 짐작한 태그' : undefined}>
            #{p}
          </span>
        ))}
        <button type="button" className="unlink" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? '닫기' : '태그'}
        </button>
      </div>
      {open && (
        <div className="tag-panel">
          <div className="chips">
            {PATTERNS.map((p) => {
              const on = t.patterns.includes(p);
              return (
                <button key={p} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} disabled={busy} onClick={() => togglePattern(p)}>
                  {p}
                </button>
              );
            })}
          </div>
          <div className="tag-selects">
            <select aria-label="후킹 코드" value={ep?.hookId ?? ''} disabled={busy} onChange={(e) => save({ hookId: e.target.value || undefined })}>
              <option value="">후킹 코드 없음</option>
              {HOOKS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.id} {h.title}
                </option>
              ))}
            </select>
            <select aria-label="유입용·전환용" value={ep?.role ?? ''} disabled={busy} onChange={(e) => save({ role: (e.target.value || undefined) as Role | undefined })}>
              <option value="">목적 미정</option>
              {(['reach', 'convert'] as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]} — {ROLE_HINT[r]}
                </option>
              ))}
            </select>
          </div>
          {t.guessed && <p className="hint">점선 태그는 캡션으로 짐작한 거예요. 누르면 직접 단 태그로 바뀌어요.</p>}
        </div>
      )}
    </div>
  );
}

/* ───────── 피드 vs 릴스 비교 ───────── */

export function FeedReelsCompare({ groups }: { groups: Group[] }) {
  const pairs = groups
    .filter((g) => g.posts.some(isReels) && g.posts.some((p) => !isReels(p)))
    .map((g) => {
      const reels = g.posts.filter(isReels);
      const feed = g.posts.filter((p) => !isReels(p));
      const rv = sum(reels, 'views'), fv = sum(feed, 'views');
      const rs = sum(reels, 'shares'), fs = sum(feed, 'shares');
      return { g, rv, fv, rs, fs, win: rv === fv ? null : rv > fv ? '릴스' : '피드' };
    })
    .sort((a, b) => b.g.first - a.g.first);
  if (!pairs.length) return null;
  const reelsWins = pairs.filter((p) => p.win === '릴스').length;
  return (
    <section className="stat-panel" aria-labelledby="fr-title">
      <div className="stat-head">
        <h2 id="fr-title">같은 편 피드 vs 릴스</h2>
        <span className="muted small">
          {pairs.length}편 중 릴스가 나은 편 {reelsWins} · 피드가 나은 편 {pairs.filter((p) => p.win === '피드').length} (조회 기준)
        </span>
      </div>
      <div className="table-scroll">
        <table className="wr-table">
          <thead>
            <tr>
              <th scope="col">편</th>
              <th scope="col">피드 조회</th>
              <th scope="col">릴스 조회</th>
              <th scope="col">피드 공유</th>
              <th scope="col">릴스 공유</th>
              <th scope="col">나은 쪽</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map(({ g, rv, fv, rs, fs, win }) => (
              <tr key={g.key}>
                <th scope="row" className="clip">{g.title}</th>
                <td>{fmt(fv)}</td>
                <td>{fmt(rv)}</td>
                <td>{fmt(fs)}</td>
                <td>{fmt(rs)}</td>
                <td>{win ? <b>{win} ×{(Math.max(rv, fv) / Math.max(1, Math.min(rv, fv))).toFixed(1)}</b> : '같음'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ───────── 패턴별 성과표 ───────── */

export function PatternTable({ groups, of }: { groups: Group[]; of: (id?: string) => WorkEp | undefined }) {
  const rows = useMemo(() => {
    const m = new Map<string, { label: string; kind: string; n: number; views: number; shares: number; reach: number; guessed: number }>();
    const add = (key: string, label: string, kind: string, g: Group, guessed: boolean) => {
      const r = m.get(key) || { label, kind, n: 0, views: 0, shares: 0, reach: 0, guessed: 0 };
      r.n += 1;
      r.views += sum(g.posts, 'views');
      r.shares += sum(g.posts, 'shares');
      r.reach += sum(g.posts, 'reach');
      if (guessed) r.guessed += 1;
      m.set(key, r);
    };
    for (const g of groups) {
      const t = tagsOf(g, of(g.episodeId));
      if (t.hookId) add(`h:${t.hookId}`, `${t.hookId} ${hookById(t.hookId)?.title ?? ''}`, '후킹', g, false);
      for (const p of t.patterns) add(`p:${p}`, p, '패턴', g, t.guessed);
      if (t.role) add(`r:${t.role}`, ROLE_LABEL[t.role], '목적', g, false);
    }
    return [...m.values()].sort((a, b) => b.shares / b.n - a.shares / a.n);
  }, [groups, of]);

  const allViews = groups.length ? groups.reduce((a, g) => a + sum(g.posts, 'views'), 0) / groups.length : null;
  const allShares = groups.length ? groups.reduce((a, g) => a + sum(g.posts, 'shares'), 0) / groups.length : null;

  return (
    <section className="stat-panel" aria-labelledby="pt-title">
      <div className="stat-head">
        <h2 id="pt-title">후킹·패턴별 성과</h2>
        <span className="muted small">
          이 기간 {groups.length}편 평균 조회 {fmt(allViews)} · 공유 {fmt(allShares)} · 공유 많은 순
        </span>
      </div>
      {rows.length ? (
        <div className="table-scroll">
          <table className="wr-table">
            <thead>
              <tr>
                <th scope="col">태그</th>
                <th scope="col">편 수</th>
                <th scope="col">평균 조회</th>
                <th scope="col">평균 공유</th>
                <th scope="col">공유율</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.kind + r.label}>
                  <th scope="row">
                    <span className="muted small">{r.kind}</span> {r.label}
                    {r.n < 3 && <span className="wr-badge thin">표본 적음</span>}
                  </th>
                  <td>
                    {r.n}편{r.guessed ? <span className="muted small"> (짐작 {r.guessed})</span> : null}
                  </td>
                  <td>{fmt(r.views / r.n)}</td>
                  <td>
                    <b>{fmt(r.shares / r.n)}</b>
                  </td>
                  <td>{fmtPct(r.reach ? (r.shares / r.reach) * 100 : null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted small">아직 태그가 달린 편이 없어요. 아래 게시물 카드의 ‘태그’에서 달 수 있어요.</p>
      )}
      <p className="hint">
        한 편이 여러 태그에 들어갈 수 있어요. 직접 단 태그가 없는 편은 캡션으로 짐작해요(점선). 3편 미만은 우연일 수 있으니 참고만 하세요. 태그는 이 브라우저에 저장돼요.
      </p>
    </section>
  );
}

/** 지금 시각 기준 '집계 중' 여부 */
export const isFresh = (p: Post, now: number) => now - igTime(p.timestamp) < 48 * 3600 * 1000;
