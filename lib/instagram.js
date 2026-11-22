import { igAccount } from './channel';

// Instagram Graph API (Facebook Login 사용자 토큰, graph.facebook.com)
const HOST = process.env.IG_GRAPH_HOST || 'graph.facebook.com';
const VERSION = process.env.IG_API_VERSION || 'v26.0';
const BASE = `https://${HOST}/${VERSION}`;

// 게시물별로 조회할 지표 (노션 열과 1:1 대응)
export const METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved'];

/** acct: igAccount(channel). 없으면 뚜구리툰 계정 */
function creds(acct) {
  const a = acct || igAccount('toon');
  if (!a.token) throw new Error(`${a.tokenVar} 환경변수가 설정되지 않았습니다.`);
  if (!a.userId) throw new Error(`${a.tokenVar.replace('ACCESS_TOKEN', 'USER_ID')} 환경변수가 설정되지 않았습니다.`);
  return a;
}

export function igUserId(acct) {
  return creds(acct).userId;
}

async function igGet(path, params = {}, acct) {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', creds(acct).token);
  return igFetch(url);
}

async function igFetch(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    // 토큰이 포함된 URL은 절대 메시지에 넣지 않는다
    const err = new Error(json.error?.message || `Instagram API 오류 (HTTP ${res.status})`);
    err.code = json.error?.code;
    throw err;
  }
  return json;
}

/** 계정의 전체 게시물 목록 (페이지네이션 포함) */
export async function fetchAllMedia(acct) {
  const fields = [
    'id', 'caption', 'permalink', 'timestamp', 'media_type',
    'media_product_type', 'thumbnail_url', 'media_url', 'like_count', 'comments_count',
  ].join(',');

  let page = await igGet(`${igUserId(acct)}/media`, { fields, limit: '50' }, acct);
  const all = [...(page.data || [])];
  let guard = 0;
  while (page.paging?.next && guard < 20) {
    page = await igFetch(new URL(page.paging.next));
    all.push(...(page.data || []));
    guard += 1;
  }
  return all;
}

/** 게시물 하나의 인사이트. 일부 지표가 거부되면 지표별로 다시 시도한다. */
export async function fetchInsights(media, acct) {
  const result = {};
  const read = (json) => {
    for (const row of json.data || []) {
      result[row.name] = row.values?.[0]?.value ?? row.total_value?.value ?? null;
    }
  };

  try {
    read(await igGet(`${media.id}/insights`, { metric: METRICS.join(',') }, acct));
  } catch {
    for (const m of METRICS) {
      try {
        read(await igGet(`${media.id}/insights`, { metric: m }, acct));
      } catch {
        /* 이 게시물 유형에서 지원하지 않는 지표는 건너뜀 */
      }
    }
  }

  // 인사이트가 비어 있으면 기본 필드로 보완
  if (result.likes == null && media.like_count != null) result.likes = media.like_count;
  if (result.comments == null && media.comments_count != null) result.comments = media.comments_count;
  return result;
}

/** 여러 게시물의 인사이트를 동시에 몇 개씩 가져온다 */
export async function withInsights(mediaList, concurrency = 4, acct) {
  const out = new Array(mediaList.length);
  let i = 0;
  async function worker() {
    while (i < mediaList.length) {
      const idx = i++;
      const m = mediaList[idx];
      let insights = {};
      let error = null;
      try {
        insights = await fetchInsights(m, acct);
      } catch (e) {
        error = e.message;
      }
      out[idx] = { ...m, insights, insightsError: error };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, mediaList.length) }, worker));
  return out;
}

const DISCOVERY_MEDIA_FIELDS = [
  'id', 'caption', 'permalink', 'timestamp', 'media_type', 'media_product_type',
  'like_count', 'comments_count', 'thumbnail_url', 'media_url',
].join(',');

/**
 * 다른 계정의 최근 게시물 (business_discovery).
 * 비즈니스·크리에이터 계정만 되고, 개인 계정이나 없는 계정은 오류가 난다.
 * 좋아요를 숨긴 게시물은 like_count 가 없다.
 */
export async function discoverAccount(username, limit = 12, acct) {
  const fields = `business_discovery.username(${username}){username,name,followers_count,media_count,profile_picture_url,media.limit(${limit}){${DISCOVERY_MEDIA_FIELDS}}}`;
  const json = await igGet(igUserId(acct), { fields }, acct);
  const bd = json.business_discovery || {};
  return {
    username: bd.username || username,
    name: bd.name || '',
    followers: bd.followers_count ?? null,
    picture: bd.profile_picture_url || '',
    media: bd.media?.data || [],
  };
}

/**
 * 다른 계정 게시물 하나를 장별 이미지까지 (해외 소식 번역용).
 * 캐러셀 장 이미지는 children 으로 받는다. children 이 막히면 대표 이미지만 쓴다.
 */
export async function discoverPost(username, mediaId, acct) {
  const base = 'id,caption,permalink,timestamp,media_type,media_product_type,like_count,comments_count,media_url,thumbnail_url';
  const ask = async (withChildren) => {
    const fields = `business_discovery.username(${username}){username,media.limit(30){${base}${withChildren ? ',children{media_url,media_type}' : ''}}}`;
    const json = await igGet(igUserId(acct), { fields }, acct);
    return (json.business_discovery?.media?.data || []).find((m) => m.id === mediaId);
  };
  let m;
  try {
    m = await ask(true);
  } catch {
    m = await ask(false);
  }
  if (!m) throw new Error('게시물을 찾지 못했어요. 최근 30개 안의 게시물만 가져올 수 있어요.');
  const kids = (m.children?.data || []).filter((c) => c.media_type !== 'VIDEO' && c.media_url).map((c) => c.media_url);
  const images = kids.length ? kids : [m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url].filter(Boolean);
  return {
    id: m.id,
    username,
    permalink: m.permalink,
    caption: m.caption || '',
    timestamp: m.timestamp,
    likes: m.like_count ?? null,
    comments: m.comments_count ?? null,
    reel: m.media_product_type === 'REELS',
    images: images.slice(0, 10),
  };
}

const HASHTAG_MEDIA_FIELDS = 'id,caption,permalink,media_type,media_url,like_count,comments_count,timestamp';

/**
 * 해시태그 인기·최근 게시물 (Instagram Hashtag Search).
 * - 한 계정당 7일 동안 서로 다른 해시태그 30개까지만 검색할 수 있다.
 * - 결과에 게시한 계정 이름은 오지 않는다(링크를 열어야 보임).
 * - 메타 앱에 공개 콘텐츠 접근 권한이 없으면 오류가 난다.
 * edge: 'top_media'(인기) | 'recent_media'(최근 24시간)
 */
export async function searchHashtagMedia(tag, acct, edge = 'top_media', limit = 12) {
  const userId = igUserId(acct);
  const found = await igGet('ig_hashtag_search', { user_id: userId, q: tag }, acct);
  const id = found.data?.[0]?.id;
  if (!id) return [];
  const json = await igGet(`${id}/${edge}`, { user_id: userId, fields: HASHTAG_MEDIA_FIELDS, limit: String(limit) }, acct);
  return (json.data || []).map((m) => ({
    id: m.id,
    permalink: m.permalink,
    caption: m.caption || '',
    image: m.media_type === 'VIDEO' ? '' : m.media_url || '',
    video: m.media_type === 'VIDEO',
    carousel: m.media_type === 'CAROUSEL_ALBUM',
    likes: m.like_count ?? null,
    comments: m.comments_count ?? null,
    timestamp: m.timestamp,
  }));
}
