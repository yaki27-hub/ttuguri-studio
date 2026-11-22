// 공개 인스타 게시물 페이지의 미리보기 정보(메타 태그) 읽기.
// 링크 미리보기처럼 페이지 머리말만 읽는다. 로그인·토큰은 쓰지 않는다.

const POST = /^https:\/\/(?:www\.)?instagram\.com\/(?:([A-Za-z0-9._]+)\/)?(p|reel|reels)\/([A-Za-z0-9_-]+)/;

/** 인스타 게시물 링크면 { account?, kind, code }, 아니면 null */
export function parseIgPostUrl(url) {
  const m = String(url || '').match(POST);
  return m ? { account: m[1] || '', kind: m[2] === 'p' ? 'p' : 'reel', code: m[3] } : null;
}

const decode = (s) => String(s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const meta = (html, key) => {
  const m = html.match(new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`, 'i'));
  return m ? decode(m[1]) : '';
};

/** "2,400" "1.2K" "3M" → 숫자 */
function count(s) {
  const m = String(s || '').replace(/,/g, '').match(/^([\d.]+)\s*([KkMm])?$/);
  if (!m) return null;
  return Math.round(Number(m[1]) * ({ k: 1e3, m: 1e6 }[(m[2] || '').toLowerCase()] || 1));
}

/**
 * 게시물이 실제로 있으면 { url, account, likes, comments, date, caption, image }, 없거나 못 읽으면 null.
 * 설명 문구 예: "2,400 likes, 33 comments - getintoai on January 22, 2026: "캡션…""
 */
export async function readIgPost(url) {
  const p = parseIgPostUrl(url);
  if (!p) return null;
  let html;
  try {
    const res = await fetch(`https://www.instagram.com/${p.kind}/${p.code}/`, {
      headers: { 'User-Agent': 'link-preview/1.0', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    html = (await res.text()).slice(0, 400_000);
  } catch {
    return null;
  }
  const ogUrl = meta(html, 'og:url');
  const desc = meta(html, 'og:description') || meta(html, 'description');
  // 없는 게시물은 og:url·설명이 비어 있다
  if (!ogUrl.includes(p.code) || !desc) return null;
  const account = parseIgPostUrl(ogUrl)?.account || desc.match(/ - ([A-Za-z0-9._]+) on /)?.[1] || p.account;
  const likes = count(desc.match(/^([\d.,]+[KkMm]?) likes?/)?.[1]);
  const comments = count(desc.match(/([\d.,]+[KkMm]?) comments?/)?.[1]);
  const date = desc.match(/ on ([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1] || '';
  const caption = (desc.match(/:\s*"([\s\S]*)"?\s*$/)?.[1] || '').replace(/"\s*$/, '').trim();
  return {
    url: `https://www.instagram.com/${p.kind}/${p.code}/`,
    account,
    likes,
    comments,
    date,
    caption,
    image: meta(html, 'og:image'),
  };
}
