'use server';

import { requireAuth } from '@/lib/auth';
import { fetchTrending } from '@/lib/trends';
import { fetchAiNews } from '@/lib/ainews';
import { discoverAccount } from '@/lib/instagram';

/** 오늘 급상승 검색어 (30분 캐시) */
export async function loadTrending(geo = 'KR') {
  await requireAuth();
  try {
    return { items: await fetchTrending(geo === 'US' ? 'US' : 'KR'), at: Date.now() };
  } catch (e) {
    return { error: e.message, items: [] };
  }
}

const USERNAME = /^[A-Za-z0-9._]{1,30}$/;
const MAX_ACCOUNTS = 20;

/** 워치리스트 계정들의 최근 게시물. 계정별 오류는 따로 돌려준다. */
export async function loadWatchlist(usernames) {
  await requireAuth();
  if (!process.env.IG_ACCESS_TOKEN || !process.env.IG_USER_ID) return { error: '인스타 토큰이 연결되지 않았어요.', accounts: [] };
  const list = [...new Set((Array.isArray(usernames) ? usernames : []).map((u) => String(u).trim().replace(/^@/, '').toLowerCase()))]
    .filter((u) => USERNAME.test(u))
    .slice(0, MAX_ACCOUNTS);
  const accounts = new Array(list.length);
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const idx = i++;
      const u = list[idx];
      try {
        const a = await discoverAccount(u);
        accounts[idx] = {
          ...a,
          media: a.media.map((m) => ({
            id: m.id,
            permalink: m.permalink,
            caption: (m.caption || '').slice(0, 600),
            timestamp: m.timestamp,
            type: m.media_product_type === 'REELS' ? 'reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : 'feed',
            likes: m.like_count ?? null,
            comments: m.comments_count ?? null,
            thumb: m.thumbnail_url || (m.media_type === 'VIDEO' ? '' : m.media_url) || '',
          })),
        };
      } catch (e) {
        accounts[idx] = { username: u, error: /business|nonexist|Invalid user|cannot be found/i.test(e.message) ? '비즈니스·크리에이터 계정이 아니거나 없는 계정이에요.' : e.message, media: [] };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, list.length) }, worker));
  return { accounts, at: Date.now() };
}

const cleanTerms = (v) =>
  (Array.isArray(v) ? v : [])
    .map((x) => String(x).trim().slice(0, 30))
    .filter(Boolean)
    .slice(0, 12)
    .map((x) => (/\s/.test(x) && !/^".*"$/.test(x) ? `"${x}"` : x));

/** AI 소식. group: kr | global | official | community, terms: 검색어 (한국·해외 뉴스만 씀) */
export async function loadAiNews(group, terms = {}) {
  await requireAuth();
  const g = ['kr', 'global', 'official', 'community'].includes(group) ? group : 'kr';
  try {
    return { ...(await fetchAiNews(g, { kr: cleanTerms(terms.kr), en: cleanTerms(terms.en) })), at: Date.now() };
  } catch (e) {
    return { items: [], errors: [e.message] };
  }
}
