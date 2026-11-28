import { fetchAllMedia, withInsights } from './instagram';
import { igAccount } from './channel';
import { listEpisodes, updatePage, P, num, rich, url, date, select } from './notion';

/** 인스타 URL에서 게시물 코드만 추출 (/p/, /reel/, 쿼리스트링 차이를 무시하고 비교하기 위함) */
export function shortcode(link) {
  const m = String(link || '').match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/** "2026-10-30T08:45:06+0000" → Date */
export function parseIgTime(ts) {
  return new Date(String(ts).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
}

/** 한국 시간 기준 날짜 (YYYY-MM-DD) */
export function kstDate(ts) {
  const d = parseIgTime(ts);
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 대시보드·동기화 대상 게시물 (SINCE_DATE 이후, 최신순) */
export async function collectPosts(channel = 'toon') {
  const acct = igAccount(channel);
  const since = acct.since ? new Date(acct.since) : null;
  const media = (await fetchAllMedia(acct))
    .filter((m) => !since || parseIgTime(m.timestamp) >= since)
    .sort((a, b) => parseIgTime(b.timestamp) - parseIgTime(a.timestamp));
  return withInsights(media, 4, acct);
}

/** 노션 'Instagram Media ID' 칸에는 같은 편의 게시물(피드·릴스) ID를 쉼표로 여러 개 둔다 */
export function mediaIdsOf(episode) {
  return String(episode?.mediaId || '').split(/[\s,]+/).filter(Boolean);
}

/** 게시물마다 연결된 에피소드를 찾는다 (Media ID 우선, 다음은 인스타 링크) */
export function matchPosts(posts, episodes) {
  const byMediaId = new Map();
  const byCode = new Map();
  for (const ep of episodes) {
    for (const id of mediaIdsOf(ep)) byMediaId.set(id, ep);
    const code = shortcode(ep.link);
    if (code) byCode.set(code, ep);
  }
  return posts.map((post) => ({
    ...post,
    episode: byMediaId.get(post.id) || byCode.get(shortcode(post.permalink)) || null,
  }));
}

const METRIC_KEYS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved'];

/** 같은 편 게시물 성과 합계 (도달은 겹칠 수 있지만 편 단위 비교용으로 더한다) */
export function sumInsights(posts) {
  const out = {};
  for (const k of METRIC_KEYS) {
    const vals = posts.map((p) => p.insights?.[k]).filter((v) => typeof v === 'number');
    out[k] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }
  return out;
}

/**
 * 노션에 쓸 속성 묶음. posts = 이 편에 묶인 게시물들(피드·릴스).
 * 링크·업로드일은 가장 먼저 올린 게시물 기준.
 */
export function metricProperties(posts, episode, now = new Date().toISOString()) {
  const list = Array.isArray(posts) ? posts : [posts];
  const dated = list.filter((p) => p.timestamp && !Number.isNaN(parseIgTime(p.timestamp).getTime()));
  const first = [...dated].sort((a, b) => parseIgTime(a.timestamp) - parseIgTime(b.timestamp))[0] || list[0];
  const i = sumInsights(list);
  // 이번에 못 본 예전 게시물 ID(기간 밖 등)는 지우지 않고 남긴다
  const ids = [...new Set([...list.map((p) => p.id), ...mediaIdsOf(episode)])];
  const props = {
    [P.mediaId]: rich(ids.join(',')),
    [P.views]: num(i.views),
    [P.reach]: num(i.reach),
    [P.likes]: num(i.likes),
    [P.comments]: num(i.comments),
    [P.shares]: num(i.shares),
    [P.saved]: num(i.saved),
    [P.syncedAt]: date(now),
    [P.syncState]: select(list.some((p) => p.insightsError) ? '오류' : '정상'),
  };
  // 비어 있는 칸만 채운다 (사용자가 직접 넣은 값은 덮어쓰지 않음)
  if (!episode?.link && first?.permalink) props[P.link] = url(first.permalink);
  if (!episode?.uploaded && first?.timestamp) props[P.uploaded] = date(kstDate(first.timestamp));
  return props;
}

/** 전체 동기화: 연결된 에피소드에 최신 성과(묶인 게시물 합계)를 기록한다 */
export async function runSync() {
  const [posts, episodes] = await Promise.all([collectPosts(), listEpisodes()]);
  const matched = matchPosts(posts, episodes);
  const now = new Date().toISOString();

  const summary = { posts: posts.length, updated: 0, unmatched: [], errors: [] };
  const groups = new Map();
  for (const post of matched) {
    if (!post.episode) {
      summary.unmatched.push({ id: post.id, permalink: post.permalink });
      continue;
    }
    const g = groups.get(post.episode.id) || { episode: post.episode, posts: [] };
    g.posts.push(post);
    groups.set(post.episode.id, g);
  }
  for (const { episode, posts: list } of groups.values()) {
    try {
      await updatePage(episode.id, metricProperties(list, episode, now));
      summary.updated += 1;
    } catch (e) {
      summary.errors.push({ episode: episode.title, message: e.message });
    }
  }
  return summary;
}
