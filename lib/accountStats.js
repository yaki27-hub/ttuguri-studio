// 다른 계정의 최근 게시물로 숫자 정리 (해외 계정 분석). 서버·테스트 어디서나 쓰는 순수 함수.

const DAY = 86400000;
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

const igTime = (ts) => new Date(String(ts).replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).getTime();
const round = (x) => (x == null ? null : Math.round(x));
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export const typeOf = (m) => (m.media_product_type === 'REELS' ? 'reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : 'feed');

/**
 * account: discoverAccountDeep 결과. 좋아요를 숨긴 게시물은 좋아요 평균에서 뺀다.
 * 돌려주는 값은 화면에 그대로 쓰는 요약 숫자 + 반응 순 상위 게시물.
 */
export function accountStats(account, topN = 6) {
  const posts = (account.media || []).map((m) => ({
    id: m.id,
    permalink: m.permalink,
    caption: m.caption || '',
    type: typeOf(m),
    likes: m.like_count ?? null,
    comments: m.comments_count ?? null,
    time: igTime(m.timestamp),
    timestamp: m.timestamp,
    thumb: m.thumbnail_url || (m.media_type === 'VIDEO' ? '' : m.media_url) || '',
    slides: (m.children?.data || []).filter((c) => c.media_type !== 'VIDEO' && c.media_url).map((c) => c.media_url),
    image: m.media_type === 'VIDEO' ? m.thumbnail_url || '' : m.media_url || '',
  })).filter((p) => !Number.isNaN(p.time));

  const n = posts.length;
  const times = posts.map((p) => p.time);
  const spanDays = n > 1 ? (Math.max(...times) - Math.min(...times)) / DAY : 0;
  const likes = posts.map((p) => p.likes).filter((x) => typeof x === 'number');
  const comments = posts.map((p) => p.comments).filter((x) => typeof x === 'number');
  const score = (p) => (p.likes ?? 0) + (p.comments ?? 0) * 3; // 댓글은 좋아요보다 무겁게
  const followers = account.followers;

  const mix = { carousel: 0, feed: 0, reel: 0 };
  for (const p of posts) mix[p.type] += 1;
  const byType = Object.fromEntries(
    Object.keys(mix).map((t) => [t, round(avg(posts.filter((p) => p.type === t && typeof p.likes === 'number').map((p) => p.likes)))]),
  );

  // 요일별 평균 반응 (한국 시간)
  const days = WEEKDAY.map((label, d) => {
    const list = posts.filter((p) => new Date(p.time + 9 * 3600 * 1000).getUTCDay() === d);
    return { label, posts: list.length, avgLikes: avg(list.map((p) => p.likes).filter((x) => typeof x === 'number')) };
  });

  const avgLikes = avg(likes);
  const avgComments = avg(comments);
  const top = [...posts].sort((a, b) => score(b) - score(a)).slice(0, topN);
  const hashtags = posts.map((p) => (p.caption.match(/#[\p{L}\p{N}_]+/gu) || []).length);

  return {
    username: account.username,
    name: account.name,
    bio: account.bio,
    picture: account.picture,
    followers,
    mediaCount: account.mediaCount,
    analyzed: n,
    from: n ? new Date(Math.min(...times)).toISOString() : null,
    to: n ? new Date(Math.max(...times)).toISOString() : null,
    perWeek: spanDays > 0 ? +(((n - 1) / spanDays) * 7).toFixed(1) : null,
    mix,
    avgLikesByType: byType,
    avgLikes: avgLikes == null ? null : Math.round(avgLikes),
    medianLikes: round(median(likes)),
    avgComments: avgComments == null ? null : Math.round(avgComments),
    hiddenLikes: n - likes.length,
    /** (좋아요+댓글) ÷ 팔로워, % */
    engagement: followers && avgLikes != null ? +((((avgLikes ?? 0) + (avgComments ?? 0)) / followers) * 100).toFixed(2) : null,
    avgCaption: Math.round(avg(posts.map((p) => p.caption.length)) ?? 0),
    avgHashtags: +(avg(hashtags) ?? 0).toFixed(1),
    bestDay: [...days].filter((d) => d.posts >= 2 && d.avgLikes != null).sort((a, b) => b.avgLikes - a.avgLikes)[0]?.label ?? null,
    days,
    top: top.map(({ time, ...p }) => ({ ...p, caption: p.caption.slice(0, 600) })),
    /** AI 분석용: 반응 하위 게시물 캡션 (잘된 것과 비교) */
    bottomCaptions: [...posts].sort((a, b) => score(a) - score(b)).slice(0, 5).map((p) => p.caption.slice(0, 400)),
  };
}
