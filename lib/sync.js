import { fetchAllMedia, withInsights } from './instagram';
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
export async function collectPosts() {
  const since = process.env.SINCE_DATE ? new Date(process.env.SINCE_DATE) : null;
  const media = (await fetchAllMedia())
    .filter((m) => !since || parseIgTime(m.timestamp) >= since)
    .sort((a, b) => parseIgTime(b.timestamp) - parseIgTime(a.timestamp));
  return withInsights(media);
}

/** 게시물마다 연결된 에피소드를 찾는다 (Media ID 우선, 다음은 인스타 링크) */
export function matchPosts(posts, episodes) {
  const byMediaId = new Map();
  const byCode = new Map();
  for (const ep of episodes) {
    if (ep.mediaId) byMediaId.set(ep.mediaId, ep);
    const code = shortcode(ep.link);
    if (code) byCode.set(code, ep);
  }
  return posts.map((post) => ({
    ...post,
    episode: byMediaId.get(post.id) || byCode.get(shortcode(post.permalink)) || null,
  }));
}

/** 노션에 쓸 속성 묶음 */
export function metricProperties(post, episode, now = new Date().toISOString()) {
  const i = post.insights || {};
  const props = {
    [P.mediaId]: rich(post.id),
    [P.views]: num(i.views),
    [P.reach]: num(i.reach),
    [P.likes]: num(i.likes),
    [P.comments]: num(i.comments),
    [P.shares]: num(i.shares),
    [P.saved]: num(i.saved),
    [P.syncedAt]: date(now),
    [P.syncState]: select(post.insightsError ? '오류' : '정상'),
  };
  // 비어 있는 칸만 채운다 (사용자가 직접 넣은 값은 덮어쓰지 않음)
  if (!episode?.link) props[P.link] = url(post.permalink);
  if (!episode?.uploaded) props[P.uploaded] = date(kstDate(post.timestamp));
  return props;
}

/** 전체 동기화: 연결된 에피소드에 최신 성과를 기록한다 */
export async function runSync() {
  const [posts, episodes] = await Promise.all([collectPosts(), listEpisodes()]);
  const matched = matchPosts(posts, episodes);
  const now = new Date().toISOString();

  const summary = { posts: posts.length, updated: 0, unmatched: [], errors: [] };
  for (const post of matched) {
    if (!post.episode) {
      summary.unmatched.push({ id: post.id, permalink: post.permalink });
      continue;
    }
    try {
      await updatePage(post.episode.id, metricProperties(post, post.episode, now));
      summary.updated += 1;
    } catch (e) {
      summary.errors.push({ episode: post.episode.title, message: e.message });
    }
  }
  return summary;
}
