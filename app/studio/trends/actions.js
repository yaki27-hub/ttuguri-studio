'use server';

import { requireAuth } from '@/lib/auth';
import { fetchTrending } from '@/lib/trends';
import { fetchAiNews } from '@/lib/ainews';
import { discoverAccount, discoverPost } from '@/lib/instagram';
import { readPostSlides } from '@/lib/ai';
import { igAccount } from '@/lib/channel';

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

/** 그 채널 계정 토큰, 없으면 다른 채널 계정 (business_discovery 는 어느 계정으로든 된다) */
function pickAcct(channel) {
  const mine = igAccount(channel === 'card' ? 'card' : 'toon');
  const other = igAccount(channel === 'card' ? 'toon' : 'card');
  return mine.token && mine.userId ? mine : other.token && other.userId ? other : null;
}

/**
 * 해외 인스타 게시물 번역: 장별 이미지 글자 + 캡션을 읽어 한국어로.
 * 이미지 읽기가 안 되면(Gemini 키 없음 등) 캡션만 돌려주고 readError 로 이유를 알린다.
 */
export async function translatePost(username, mediaId, channel = 'card') {
  await requireAuth();
  const acct = pickAcct(channel);
  if (!acct) return { error: '인스타 토큰이 연결되지 않았어요.' };
  const u = String(username || '').trim().replace(/^@/, '').toLowerCase();
  if (!USERNAME.test(u)) return { error: '계정명이 올바르지 않아요.' };
  let post;
  try {
    post = await discoverPost(u, String(mediaId || ''), acct);
  } catch (e) {
    return { error: e.message };
  }
  let read = null;
  let readError = '';
  try {
    const images = [];
    for (const url of post.images) {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 4_000_000) continue;
      images.push({ mimeType: (r.headers.get('content-type') || 'image/jpeg').split(';')[0], data: buf.toString('base64') });
    }
    if (!images.length) throw new Error('게시물 이미지를 내려받지 못했어요.');
    read = await readPostSlides({ images, caption: post.caption, account: u });
  } catch (e) {
    readError = e.message;
  }
  return { post, read, readError };
}

/** 워치리스트 계정들의 최근 게시물. 계정별 오류는 따로 돌려준다. */
export async function loadWatchlist(usernames, channel = 'toon') {
  await requireAuth();
  // 그 채널 계정 토큰으로 조회하고, 없으면 다른 채널 계정으로 (business_discovery는 어느 계정으로든 된다)
  const acct = pickAcct(channel);
  if (!acct) return { error: '인스타 토큰이 연결되지 않았어요.', accounts: [] };
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
        const a = await discoverAccount(u, 12, acct);
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

const SERVICE_KR = ['챗GPT', '제미나이', '클로드', '오픈AI', '앤트로픽', '퍼플렉시티', 'AI 기능', 'AI 출시', 'AI 에이전트'];
const HOWTO_KR = ['AI 활용', '생성형 AI 활용', '업무 자동화', 'AI 툴', '프롬프트'];

/**
 * 카드뉴스 소재 추천용 프롬프트를 만든다 (오늘 AI 소식 + 최근에 만든 카드뉴스 + 토픽).
 * AI 호출은 브라우저가 aiDraft 로 하거나, 키가 없으면 프롬프트를 복사해 쓴다.
 * @param {{ system?: string, recent?: string[], topics?: { keywords?: string[] }[] }} [opts]
 */
export async function cardRecommendPrompt({ system = '', recent = [], topics = [] } = {}) {
  await requireAuth();
  const [kr, howto, global, official] = await Promise.all([
    fetchAiNews('kr', { kr: SERVICE_KR }),
    fetchAiNews('kr', { kr: HOWTO_KR }),
    fetchAiNews('global'),
    fetchAiNews('official'),
  ]);
  const pick = (r, n) => r.items.slice(0, n);
  const news = [...pick(kr, 12), ...pick(howto, 6), ...pick(global, 8), ...pick(official, 4)].map((x, i) => ({ i: i + 1, title: x.title, source: x.source, url: x.url, at: x.at }));
  const kw = (Array.isArray(topics) ? topics : []).flatMap((t) => (Array.isArray(t?.keywords) ? t.keywords : [])).filter((k) => typeof k === 'string').slice(0, 40);
  const prompt = `${String(system).slice(0, 3000)}

[작업: 카드뉴스 소재 추천]
오늘 날짜: ${new Date().toISOString().slice(0, 10)}

[오늘 AI 소식 — 번호로 인용할 것]
${news.map((n) => `${n.i}. ${n.title} (${n.source}${n.at ? `, ${n.at.slice(0, 10)}` : ''})`).join('\n')}

[최근에 만든 카드뉴스 — 겹치지 않게]
${(Array.isArray(recent) ? recent : []).slice(0, 15).map((t) => `- ${String(t).slice(0, 80)}`).join('\n') || '(없음)'}
${kw.length ? `\n[관심 키워드]\n${kw.join(', ')}\n` : ''}
위 소식을 바탕으로 저장하고 싶어지는 정보 카드뉴스 소재 3개를 추천해라.
- 직장인이 바로 써먹을 수 있는 것(새 기능 사용법, 무료 한도, 업무 활용)을 우선. 투자·정치 뉴스는 직장인 생활과 직접 이어질 때만.
- 서로 다른 형식으로: 새 소식 정리 / 사용법·활용 / 비교·체크리스트 중에서.
- sources에는 근거가 된 소식 번호만. 소식에 없는 사실·수치를 지어내지 말 것.
- 출처를 따져라: 공식 발표(OpenAI·Google 등)나 주요 매체가 다룬 소식을 우선한다. 낯선 사이트 하나만 다루고 제목이 자극적인 소식("충격", "Shocking" 등)은 고르지 않는다. 같은 소식을 여러 곳이 다루면 그 번호를 모두 sources에 넣는다.
- check에는 카드뉴스로 만들기 전에 작가가 직접 확인해야 할 것(요금, 한국 출시 여부 등).

출력은 아래 형식의 JSON 하나만.
{"topics":[{"title":"작업 제목","hook":"표지 후킹 제목(22자 안팎)","angle":"무엇을 어떤 흐름으로 알려 줄지 한두 문장","format":"새 소식 정리|사용법·활용|비교·체크리스트","sources":[1],"check":"확인할 것","why":"왜 지금 이 소재인지"}]}`;
  return { prompt, news };
}

/**
 * 시즌 캘린더: 내 지난 게시물 중 시즌 말이 들어간 것의 성과.
 * seasons = [{ id, words }] → { [id]: [{ caption, permalink, timestamp, views, shares, reach, reels }] }
 */
export async function seasonHistory(seasons = [], channel = 'toon') {
  await requireAuth();
  const { collectPosts } = await import('@/lib/sync');
  try {
    const posts = await collectPosts(channel === 'card' ? 'card' : 'toon');
    const out = {};
    for (const s of seasons) {
      const words = (s.words || []).filter(Boolean);
      out[s.id] = posts
        .filter((p) => words.some((w) => (p.caption || '').includes(w)))
        .map((p) => ({
          caption: (p.caption || '').split('\n').find((l) => l.trim()) || '',
          permalink: p.permalink,
          timestamp: p.timestamp,
          views: p.insights?.views ?? null,
          shares: p.insights?.shares ?? null,
          reach: p.insights?.reach ?? null,
          reels: p.media_product_type === 'REELS',
        }))
        .sort((a, b) => (b.views || 0) - (a.views || 0))
        .slice(0, 3);
    }
    return { history: out, total: posts.length };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * 매일 소재 리포트: 구글 검색을 붙여 조사한다 (GEMINI_API_KEY 필요).
 * 관찰 사례의 링크는 실제 검색 결과와 맞는지 확인해 linkOk 를 단다.
 */
export async function dailyReportSearch(prompt = '') {
  await requireAuth();
  const { searchWebJSON, resolveGroundingUrl, isGroundingUrl } = await import('@/lib/ai');
  try {
    const { data, sources } = await searchWebJSON({ prompt: String(prompt).slice(0, 20000), temperature: 0.5 });
    if (!data) return { error: '검색은 했지만 JSON 결과를 받지 못했어요. 다시 시도하거나 프롬프트를 복사해 다른 AI에 붙여넣어 주세요.' };
    const real = sources.filter((x) => /^https?:\/\//.test(x.url) && !isGroundingUrl(x.url));
    const norm = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '')).toLowerCase(); } catch { return ''; } };
    const obs = Array.isArray(data.observations) ? data.observations : [];
    data.observations = await Promise.all(
      obs.map(async (o) => {
        const url = String(o?.url || '');
        const resolved = await resolveGroundingUrl(url);
        if (resolved) return { ...o, url: resolved, linkOk: true };
        const hit = real.find((x) => norm(x.url) && norm(x.url) === norm(url));
        return { ...o, url: hit?.url || url, linkOk: !!hit };
      }),
    );
    return { data, sources: real.map((x) => ({ url: x.url, title: x.title })) };
  } catch (e) {
    return { error: e.message };
  }
}
