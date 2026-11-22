'use server';

// 레퍼런스 하나로 "비슷한 것 찾기": 주제어 뽑기 → 구글 검색으로 인스타 게시물·해외/국내 웹 찾기
// (인스타 해시태그 API는 메타 앱 심사(Instagram Public Content Access)가 필요해서 쓰지 않는다)
import { requireAuth } from '@/lib/auth';
import { generateJSON, isGroundingUrl, readPostSlides, resolveGroundingUrl, searchWebJSON } from '@/lib/ai';
import { discoverAccount } from '@/lib/instagram';
import { igAccount } from '@/lib/channel';
import { translatePost } from '../trends/actions';
import { parseIgPostUrl, readIgPost } from '@/lib/igpage';
import { fetchArticle } from '@/lib/article';

const USERNAME = /^[a-z0-9._]{1,30}$/;

/** 그 채널 계정 토큰, 없으면 다른 채널 계정 (business_discovery 는 어느 계정으로든 된다) */
function pickAcct(channel) {
  const mine = igAccount(channel === 'card' ? 'card' : 'toon');
  const other = igAccount(channel === 'card' ? 'toon' : 'card');
  return mine.token && mine.userId ? mine : other.token && other.userId ? other : null;
}

const clip = (s, n) => String(s || '').slice(0, n);
const list = (v, n) => (Array.isArray(v) ? v : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, n);
/** 인스타 해시태그로 쓸 수 있는 글자만 (한글·영문·숫자·_) */
const cleanTag = (t) => String(t || '').replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '').toLowerCase().slice(0, 50);

/**
 * 레퍼런스에서 검색할 주제어를 뽑는다.
 * ref: { account, url, caption, note, take, tags } (브라우저에 저장된 값)
 * 레퍼런스가 기사 링크면 기사 본문까지 읽어서, 넓은 주제가 아니라 "그 소식" 중심으로 뽑는다.
 */
export async function similarKeywords(ref = {}, channel = 'card') {
  await requireAuth();
  let article = null;
  const url = String(ref.url || '');
  if (/^https?:\/\//.test(url) && !parseIgPostUrl(url)) {
    try {
      article = await fetchArticle(url);
    } catch {
      article = null; // 못 읽으면 메모·캡션만으로
    }
  }
  const text = [
    article && `원래 기사 제목: ${clip(article.title, 300)} (${clip(article.site, 60)}${article.published ? `, ${clip(article.published, 30)}` : ''})`,
    article && `원래 기사 본문(앞부분):\n${clip(article.text, 3500)}`,
    ref.take && `한 줄 요약: ${clip(ref.take, 200)}`,
    ref.note && `메모: ${clip(ref.note, 1500)}`,
    ref.caption && `원본 캡션: ${clip(ref.caption, 3000)}`,
    ref.tags?.length && `태그: ${list(ref.tags, 10).join(', ')}`,
  ].filter(Boolean).join('\n');
  if (!text) return { error: '레퍼런스에 캡션·메모가 없어 주제를 알 수 없어요. 아래에 키워드를 직접 적어 주세요.' };
  try {
    const prompt = `아래는 @${clip(ref.account, 40)} 의 ${channel === 'card' ? '카드뉴스' : '인스타툰'} 레퍼런스 정보다.
이 레퍼런스가 다룬 "바로 그 소식·사건"을 다룬 다른 게시물을 찾으려 한다. 넓은 분야(예: AI 일반)가 아니라 이 소식 자체가 기준이다.

${text}

할 일:
- event: 이 소식의 핵심을 "누가 무엇을 했다/주장했다 → 결과" 형태의 한국어 한 줄로. 숫자·고유명사는 그대로.
- brief: 이 소식의 핵심 사실 2~3문장 (한국어). 위 정보에 없는 내용은 덧붙이지 말 것.
- entities: 이 소식을 다른 소식과 구별하는 고유명사·핵심어 3~6개 (사람·회사·제품·개념). 한국어, 영어 표기가 있으면 "한국어(English)".
- topic: 이 소식이 속한 넓은 주제 한 줄.
- queryKo: 같은 소식을 찾는 한국어 검색어. entities 중 가장 구별되는 2~3개 + 핵심 동작으로, 6단어 이내. 일반어(뉴스, 정리, 팁)는 넣지 말 것.
- queryEn: 같은 소식을 찾는 영어 검색어, 같은 규칙.
- hashtags: 이 소식에 붙을 법한 구체적인 해시태그 8개(한국어 4 + 영어 4). # 없이, 띄어쓰기 없이. 너무 넓은 태그(ai, 인공지능, tech 등)는 빼기.

출력: {"event":"","brief":"","entities":[],"topic":"","queryKo":"","queryEn":"","hashtags":[],"date":""}`;
    let out = null;
    let via = article ? 'article' : 'memo';
    if (!article && process.env.GEMINI_API_KEY) {
      // 기사를 직접 못 열면(새 형식 구글 뉴스 링크 등) 구글 검색으로 원래 기사를 찾아 사실을 확인한다
      try {
        const r = await searchWebJSON({
          prompt: `먼저 구글에서 아래 제목·메모의 원래 기사(같은 소식을 다룬 기사들)를 찾아 사실을 확인한 뒤 답하라. 찾은 기사에 없는 내용은 쓰지 말 것.
date 에는 그 소식이 처음 보도된 날짜(YYYY-MM-DD, 모르면 빈 문자열).

${prompt}`,
          temperature: 0.2,
        });
        if (r.data?.event) {
          out = r.data;
          via = 'search';
        }
      } catch {
        out = null;
      }
    }
    if (!out) {
      out = await generateJSON({ system: '너는 인스타그램 콘텐츠 리서처다. 요청한 JSON 형식만 출력한다.', prompt, temperature: 0.3 });
    }
    const date = article?.published ? clip(article.published, 10) : /^\d{4}-\d{2}-\d{2}$/.test(String(out.date || '')) ? out.date : '';
    return {
      event: clip(out.event, 200),
      brief: clip(out.brief, 600),
      entities: list(out.entities, 6).map((x) => clip(x, 60)),
      topic: clip(out.topic, 200),
      date,
      via,
      hashtags: [...new Set(list(out.hashtags, 12).map(cleanTag).filter(Boolean))],
      queryKo: clip(out.queryKo, 120),
      queryEn: clip(out.queryEn, 120),
    };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * 해외(또는 국내) 웹에서 비슷한 사례 찾기.
 * 모델이 적은 링크는 실제로 검색된 페이지 목록(sources)과 맞는 것만 남긴다.
 */
/** 모델이 적은 일치 정도. 모르면 related 로 본다 */
const matchOf = (it) => (['same', 'related', 'loose'].includes(it?.match) ? it.match : 'related');
/** 같은 소식 먼저, 그 안에서는 반응(좋아요+댓글) 많은 순 */
const byMatch = (items) => [...items].sort((a, b) => (a.match === b.match ? 0 : a.match === 'same' ? -1 : 1) || ((b.likes ?? -1) + (b.comments ?? 0)) - ((a.likes ?? -1) + (a.comments ?? 0)));

/**
 * 인스타 결과 확인: 게시물 페이지를 직접 열어 실제로 있는지 보고, 계정·좋아요·댓글·날짜를 채운다.
 * - 페이지 정보가 읽히면 → 확인됨 (지표 포함)
 * - 못 읽어도 구글 중계 주소로 확인된 링크면 → 지표 없이 남김
 * - 둘 다 아니면(모델이 적기만 한 링크) → 버림
 */
async function verifyIgItems(raw, resolved, sources, newsDate = '') {
  const seen = new Set();
  const cands = [];
  const push = (url, it, viaGoogle) => {
    const p = parseIgPostUrl(url);
    if (!p || seen.has(p.code)) return;
    seen.add(p.code);
    cands.push({ url, it, viaGoogle });
  };
  raw.forEach((it, i) => push(resolved[i] || (isGroundingUrl(it?.url) ? '' : String(it?.url || '')), it, !!resolved[i]));
  sources.forEach((s) => push(s.url, { title: s.title }, true));
  const pages = await Promise.all(cands.slice(0, 12).map((c) => readIgPost(c.url)));
  const items = [];
  cands.slice(0, 12).forEach((c, i) => {
    const page = pages[i];
    if (!page && !c.viaGoogle) return;
    const p = parseIgPostUrl(c.url);
    const account = page?.account || p.account || '';
    let match = matchOf(c.it);
    // 소식 날짜보다 두 달 넘게 앞선 게시물은 같은 사건일 수 없다
    if (match === 'same' && newsDate && page?.date) {
      const gap = (Date.parse(newsDate) - Date.parse(page.date)) / 86400000;
      if (gap > 60) match = 'related';
    }
    items.push({
      match,
      title: clip(c.it?.title || page?.caption.split('\n')[0], 200),
      url: page?.url || c.url,
      source: account ? `@${account}` : 'Instagram',
      account,
      why: clip(c.it?.why, 200),
      angle: clip(c.it?.angle, 200),
      likes: page?.likes ?? null,
      comments: page?.comments ?? null,
      date: page?.date || '',
      caption: clip(page?.caption, 2000),
      image: page?.image || '',
    });
  });
  return items;
}

/** scope: 'ig'(구글에 잡힌 인스타 게시물) | 'igen'(해외 계정 인스타 게시물) | 'en'(해외 웹) | 'ko'(국내 웹) */
export async function similarWeb(query, ctx = {}, scope = 'ig') {
  await requireAuth();
  const q = clip(query, 200).trim();
  if (!q) return { error: '검색어를 적어 주세요.' };
  const ig = scope === 'ig' || scope === 'igen';
  const overseas = scope === 'igen';
  const en = scope === 'en';
  // 이전 호출 형태(주제 문자열)도 받는다
  const c = typeof ctx === 'string' ? { topic: ctx } : ctx || {};
  const about = [
    c.event && `원래 소식: ${clip(c.event, 200)}`,
    c.brief && `핵심 사실: ${clip(c.brief, 600)}`,
    c.entities?.length && `구별되는 핵심어: ${list(c.entities, 6).join(', ')}`,
    c.date && `소식 날짜: ${clip(c.date, 10)} 무렵`,
    !c.event && c.topic && `주제: ${clip(c.topic, 200)}`,
  ].filter(Boolean).join('\n');
  const matchRule = `각 항목의 match: 원래 소식과 "같은 사건"을 다루면 "same", 같은 대상·같은 소주제지만 다른 소식이면 "related", 대상 이름만 스치듯 나오거나 넓은 분야만 같으면 "loose".
"same"을 최우선으로 찾고, 부족하면 "related"로 채운다. "loose"는 넣지 말 것.`;
  const igPrompt = `구글에서 site:instagram.com 으로 아래 소식을 다룬 인스타그램 게시물을 찾아라. ${overseas ? '해외(영어권) 계정의 영어 게시물만 찾는다. 영어로 검색한다.' : '한국어 검색과 영어 검색을 모두 해 본다. 국내·해외 계정 모두 좋다.'}
${about}
${overseas ? `검색어(영어): ${q}` : `검색어(한국어): ${q}\n${c.queryEn ? `검색어(영어): ${clip(c.queryEn, 120)}` : ''}`}

우선순위: 같은 소식 > 카드뉴스·캐러셀 형식 > 좋아요·댓글이 많은 게시물(반응이 좋은 것) > 릴스.
${matchRule}
검색 결과에 실제로 나온 instagram.com/p/ 또는 /reel/ 게시물 페이지만 최대 10개. 없는 링크를 지어내지 말 것.
각 항목: title(게시물 첫 문장이나 내용 요약), url(검색 결과 링크를 그대로), account(알 수 있으면 계정명, @ 없이. 모르면 빈 문자열), match, why(원래 소식과 어떻게 같은지/다른지 한국어 한 줄), angle(내 카드뉴스에 빌려올 만한 관점·구성 한국어 한 줄).
출력은 JSON 하나만: {"items":[{"title":"","url":"","account":"","match":"same","why":"","angle":""}]}`;
  try {
    const { data, sources } = await searchWebJSON({
      prompt: ig ? igPrompt : `${en ? '해외(영어권)' : '국내'} 웹에서 아래 소식을 다룬 콘텐츠를 찾아라.
${about}
검색어: ${q}

우선순위: 같은 소식을 다룬 기사·뉴스레터·블로그·카드뉴스 > 같은 소주제의 다른 소식.
${matchRule}
찾은 것 중 실제로 검색 결과에 있던 페이지만 최대 8개. 없는 링크를 지어내지 말 것.
각 항목: title(원문 제목), url(검색 결과 링크를 그대로), source(사이트나 계정 이름), match, why(원래 소식과 어떻게 같은지/다른지 한국어 한 줄), angle(내 카드뉴스에 빌려올 만한 관점·구성 한국어 한 줄).
출력은 JSON 하나만: {"items":[{"title":"","url":"","source":"","match":"same","why":"","angle":""}]}`,
    });
    const real = sources.filter((s) => /^https?:\/\//.test(s.url) && !isGroundingUrl(s.url));
    const norm = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '')).toLowerCase(); } catch { return ''; } };
    const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
    const raw = (Array.isArray(data?.items) ? data.items : []).slice(0, 10);
    // 모델이 구글 중계 주소를 그대로 적은 경우: 풀리면 실제 검색 결과다
    const resolved = await Promise.all(raw.map((it) => resolveGroundingUrl(it?.url)));
    if (ig) return { items: byMatch(await verifyIgItems(raw.filter((it) => matchOf(it) !== 'loose'), resolved.filter((_, i) => matchOf(raw[i]) !== 'loose'), real, c.date)), others: [] };
    const used = new Set();
    const items = [];
    raw.forEach((it, i) => {
      const url = String(it?.url || '');
      let real1 = resolved[i];
      if (!real1 && !isGroundingUrl(url)) {
        // 일반 주소: 검색된 페이지 목록과 같은 주소 → 그대로, 같은 사이트 → 검색된 실제 주소로
        const hit = real.find((s) => !used.has(s.url) && norm(s.url) === norm(url)) || real.find((s) => !used.has(s.url) && host(s.url) && host(s.url) === host(url));
        real1 = hit?.url || null;
      }
      if (!real1 || used.has(real1)) return; // 확인 안 되는 링크는 버린다
      if (matchOf(it) === 'loose') return;
      used.add(real1);
      items.push({ title: clip(it.title, 200), url: real1, source: clip(it.source, 80) || host(real1), account: '', match: matchOf(it), why: clip(it.why, 200), angle: clip(it.angle, 200) });
    });
    // 모델이 따로 소개하지 않은, 검색된 나머지 페이지
    const others = real.filter((s) => !used.has(s.url)).map((s) => ({ url: s.url, title: s.title || host(s.url) }));
    return { items: byMatch(items), others };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * 검색으로 찾은 인스타 게시물을 장별로 읽고 번역한다 (결과 모양은 translatePost 와 같음).
 * 1) 비즈니스·크리에이터 계정이면 최근 30개 안에서 찾아 장별 이미지를 모두 읽는다.
 * 2) 안 되면 게시물 페이지의 대표 이미지(첫 장)와 캡션만 읽는다.
 */
export async function translateIgUrl(url, account = '', channel = 'card') {
  await requireAuth();
  const p = parseIgPostUrl(url);
  if (!p) return { error: '인스타 게시물 링크가 아니에요.' };
  const user = String(account || p.account || '').trim().replace(/^@/, '').toLowerCase();
  const acct = pickAcct(channel);
  if (acct && USERNAME.test(user)) {
    try {
      const a = await discoverAccount(user, 30, acct);
      const m = a.media.find((x) => String(x.permalink || '').includes(`/${p.code}`));
      if (m) {
        const r = await translatePost(user, m.id, channel);
        if (!r.error && r.post) return { ...r, post: { ...r.post, username: r.post.username || user } };
      }
    } catch {
      /* 개인 계정이거나 오래된 게시물 → 아래로 */
    }
  }
  const page = await readIgPost(url);
  if (!page) return { error: '게시물을 열지 못했어요. 비공개이거나 지워진 게시물일 수 있어요.' };
  const post = {
    username: page.account || user || 'instagram',
    permalink: page.url,
    caption: page.caption,
    timestamp: page.date && !Number.isNaN(Date.parse(page.date)) ? new Date(page.date).toISOString() : '',
    likes: page.likes,
    comments: page.comments,
    coverOnly: true,
  };
  let read = null;
  let readError = '';
  try {
    if (!page.image) throw new Error('대표 이미지가 없어요.');
    const r = await fetch(page.image, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('대표 이미지를 내려받지 못했어요.');
    const buf = Buffer.from(await r.arrayBuffer());
    read = await readPostSlides({
      images: [{ mimeType: (r.headers.get('content-type') || 'image/jpeg').split(';')[0], data: buf.toString('base64') }],
      caption: post.caption,
      account: post.username,
    });
  } catch (e) {
    readError = e.message;
  }
  return { post, read, readError };
}
