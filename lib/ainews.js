// AI 소식 모음 (키 없이 받는 공개 RSS·API, 30분 캐시)
//   kr        한국 뉴스: Google 뉴스 키워드 검색(ko) + AI타임스
//   global    해외 뉴스: Google 뉴스 키워드 검색(en) + The Verge AI + TechCrunch AI
//   official  공식 발표: OpenAI · Google AI 블로그 · Hugging Face 블로그
//   community 커뮤니티: Hacker News에서 반응(점수) 높은 AI 글
// Reddit은 서버 요청을 막아서(403) 넣지 않았다.

const UA = 'Mozilla/5.0 (compatible; ttuguri-studio/1.0)';
const HOUR = 3600_000;

export const DEFAULT_KR_QUERY = ['AI', '인공지능', '챗GPT', '생성형AI', '오픈AI', '제미나이', '클로드', '앤트로픽', '엔비디아'];
export const DEFAULT_EN_QUERY = ['"artificial intelligence"', 'OpenAI', 'Anthropic', 'Gemini', 'ChatGPT', 'Claude', '"AI model"', '"AI agent"'];

const decode = (s = '') =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const tag = (xml, name) => decode(xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1] ?? '');

/** RSS(<item>)와 Atom(<entry>) 모두 읽는다 */
function parseFeed(xml, sourceName) {
  const isAtom = !xml.includes('<item>') && xml.includes('<entry>');
  const chunks = xml.split(isAtom ? '<entry>' : '<item>').slice(1);
  return chunks.map((c) => {
    const body = c.split(isAtom ? '</entry>' : '</item>')[0];
    const link = isAtom ? body.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? '' : tag(body, 'link') || body.match(/<link[^>]*href="([^"]+)"/)?.[1] || '';
    let title = tag(body, 'title');
    let source = tag(body, 'source') || sourceName;
    // Google 뉴스 제목은 "제목 - 언론사" 형태
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const at = tag(body, 'pubDate') || tag(body, 'updated') || tag(body, 'published') || tag(body, 'dc:date');
    return { title, url: decode(link), source, at: at ? new Date(at).toISOString() : '' };
  });
}

async function feed(url, sourceName) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`${sourceName} HTTP ${res.status}`);
  return parseFeed(await res.text(), sourceName);
}

const googleNews = (terms, lang) => {
  const q = `${terms.join(' OR ')} when:2d`;
  const p = lang === 'ko' ? 'hl=ko&gl=KR&ceid=KR:ko' : 'hl=en-US&gl=US&ceid=US:en';
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${p}`;
};

async function hackerNews() {
  const since = Math.floor((Date.now() - 48 * HOUR) / 1000);
  const url = `https://hn.algolia.com/api/v1/search?query=AI&tags=story&hitsPerPage=40&numericFilters=${encodeURIComponent(`created_at_i>${since},points>40`)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`Hacker News HTTP ${res.status}`);
  const json = await res.json();
  return (json.hits || []).map((h) => ({
    title: h.title,
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    source: 'Hacker News',
    at: h.created_at,
    score: h.points,
    comments: h.num_comments,
    discuss: `https://news.ycombinator.com/item?id=${h.objectID}`,
  }));
}

const SOURCES = {
  kr: (terms) => [
    [googleNews(terms.kr, 'ko'), 'Google 뉴스'],
    ['https://www.aitimes.com/rss/allArticle.xml', 'AI타임스'],
  ],
  global: (terms) => [
    [googleNews(terms.en, 'en'), 'Google News'],
    ['https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 'The Verge'],
    ['https://techcrunch.com/category/artificial-intelligence/feed/', 'TechCrunch'],
  ],
  official: () => [
    ['https://openai.com/news/rss.xml', 'OpenAI'],
    ['https://blog.google/innovation-and-ai/technology/ai/rss/', 'Google AI'],
    ['https://huggingface.co/blog/feed.xml', 'Hugging Face'],
  ],
};

/** 비슷한 제목(같은 사건 여러 기사)은 하나만 남긴다 */
const keyOf = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').slice(0, 28);

/**
 * group: kr | global | official | community
 * terms: { kr: string[], en: string[] } 검색어 (없으면 기본값)
 */
export async function fetchAiNews(group, terms = {}) {
  const t = { kr: terms.kr?.length ? terms.kr : DEFAULT_KR_QUERY, en: terms.en?.length ? terms.en : DEFAULT_EN_QUERY };
  const errors = [];
  let items = [];
  if (group === 'community') {
    try {
      items = (await hackerNews()).sort((a, b) => b.score - a.score);
    } catch (e) {
      errors.push(e.message);
    }
  } else {
    const list = (SOURCES[group] || SOURCES.kr)(t);
    const results = await Promise.allSettled(list.map(([u, n]) => feed(u, n)));
    results.forEach((r, i) => (r.status === 'fulfilled' ? items.push(...r.value) : errors.push(`${list[i][1]}: ${r.reason?.message || '실패'}`)));
    // 뉴스는 최근 3일, 공식 발표는 최근 30일
    const since = Date.now() - (group === 'official' ? 30 * 24 : 72) * HOUR;
    items = items.filter((x) => x.title && x.url && (!x.at || Date.parse(x.at) >= since)).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }
  const seen = new Set();
  items = items.filter((x) => {
    const k = keyOf(x.title);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { items: items.slice(0, 60), errors };
}
