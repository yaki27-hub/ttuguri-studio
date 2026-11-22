/*
 * 기사 본문 가져오기 (서버 전용)
 *  - 구글 뉴스 RSS 링크는 주소가 안에 들어 있는 예전 형식만 풀고, 나머지는 실제 주소·본문을 넣어 달라고 안내한다.
 *  - 페이지에서 광고·메뉴를 빼고 본문만 뽑는다 (Mozilla Readability).
 * 구독·로그인이 필요한 기사는 본문이 비어 오니, 그때는 화면에서 붙여넣기로 받는다.
 */
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const MAX_TEXT = 20000;

async function get(url, init = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    ...init,
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8', ...(init.headers || {}) },
  });
  return res;
}

const isGoogleNews = (u) => /^https?:\/\/news\.google\.com\/(rss\/)?articles\//.test(u);

/** 구글 뉴스 기사 id → 실제 기사 주소 (예전 형식만: id 안에 주소가 그대로 들어 있을 때) */
function resolveGoogleNews(url) {
  const id = new URL(url).pathname.split('/').pop();
  try {
    const raw = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1');
    const m = raw.match(/https?:\/\/[\x21-\x7e]+/);
    if (m && !raw.includes('AU_yqL')) return m[0];
  } catch {}
  throw new Error('구글 뉴스를 거친 링크라 기사 주소를 바로 열 수 없어요. ‘링크 열기’로 기사를 연 뒤, 주소창의 실제 기사 주소를 넣거나 본문을 복사해 붙여넣어 주세요.');
}

const clean = (s) =>
  String(s || '')
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*/g, '\n\n')
    .trim();

/**
 * @param {string} url
 * @returns {Promise<{ url: string, title: string, site: string, published?: string, text: string, truncated: boolean }>}
 */
export async function fetchArticle(url) {
  let target = String(url || '').trim();
  if (!/^https?:\/\//.test(target)) throw new Error('http로 시작하는 링크가 아니에요.');
  if (isGoogleNews(target)) target = resolveGoogleNews(target);

  const res = await get(target, { headers: { Accept: 'text/html,application/xhtml+xml' } });
  if (!res.ok) throw new Error(`기사 페이지가 응답하지 않아요 (HTTP ${res.status}). 본문을 붙여넣어 주세요.`);
  const html = await res.text();
  const { document } = parseHTML(html);
  const meta = (p) => document.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.getAttribute('content') || '';
  const art = new Readability(document, { charThreshold: 300 }).parse();
  // 문단 사이에 줄바꿈을 넣어 문장이 붙지 않게 한다
  const blocks = String(art?.content || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|blockquote|pre|figcaption|div|section|tr)>/gi, '$&\n\n');
  const text = clean(blocks ? parseHTML(`<!doctype html><html><body>${blocks}</body></html>`).document.body.textContent : art?.textContent);
  if (text.length < 400) throw new Error('본문을 거의 가져오지 못했어요. 구독·로그인이 필요한 기사일 수 있어요. 본문을 복사해 붙여넣어 주세요.');
  return {
    url: res.url || target,
    title: clean(art?.title || meta('og:title')),
    site: clean(art?.siteName || meta('og:site_name') || new URL(res.url || target).hostname.replace(/^www\./, '')),
    published: meta('article:published_time') || art?.publishedTime || undefined,
    text: text.slice(0, MAX_TEXT),
    truncated: text.length > MAX_TEXT,
  };
}
