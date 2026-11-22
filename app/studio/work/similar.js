'use server';

// 레퍼런스 하나로 "비슷한 것 찾기": 주제어 뽑기 → 인스타 해시태그 검색 / 해외 웹 검색
import { requireAuth } from '@/lib/auth';
import { generateJSON, isGroundingUrl, resolveGroundingUrl, searchWebJSON } from '@/lib/ai';
import { searchHashtagMedia } from '@/lib/instagram';
import { igAccount } from '@/lib/channel';

const clip = (s, n) => String(s || '').slice(0, n);
const list = (v, n) => (Array.isArray(v) ? v : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, n);
/** 인스타 해시태그로 쓸 수 있는 글자만 (한글·영문·숫자·_) */
const cleanTag = (t) => String(t || '').replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '').toLowerCase().slice(0, 50);

/** 그 채널 계정 토큰, 없으면 다른 채널 계정 */
function pickAcct(channel) {
  const mine = igAccount(channel === 'card' ? 'card' : 'toon');
  const other = igAccount(channel === 'card' ? 'toon' : 'card');
  return mine.token && mine.userId ? mine : other.token && other.userId ? other : null;
}

/**
 * 레퍼런스에서 검색할 주제어를 뽑는다.
 * ref: { account, caption, note, take, tags } (브라우저에 저장된 값)
 */
export async function similarKeywords(ref = {}, channel = 'card') {
  await requireAuth();
  const text = [
    ref.take && `한 줄 요약: ${clip(ref.take, 200)}`,
    ref.note && `메모: ${clip(ref.note, 1500)}`,
    ref.caption && `원본 캡션: ${clip(ref.caption, 3000)}`,
    ref.tags?.length && `태그: ${list(ref.tags, 10).join(', ')}`,
  ].filter(Boolean).join('\n');
  if (!text) return { error: '레퍼런스에 캡션·메모가 없어 주제를 알 수 없어요. 아래에 키워드를 직접 적어 주세요.' };
  try {
    const out = await generateJSON({
      system: '너는 인스타그램 콘텐츠 리서처다. 요청한 JSON 형식만 출력한다.',
      prompt: `아래는 인스타그램 @${clip(ref.account, 40)} 의 ${channel === 'card' ? '카드뉴스' : '인스타툰'} 게시물 정보다.
이 게시물과 주제·형식이 비슷한 다른 게시물을 찾으려 한다.

${text}

할 일:
- topic: 이 게시물의 주제를 한국어 한 줄로.
- hashtags: 인스타그램에서 실제로 많이 쓰일 해시태그 8개. 한국어 4개 + 영어 4개. # 없이, 띄어쓰기 없이. 너무 넓은 태그(love, instagood 등)는 빼기.
- queryKo: 국내 자료를 찾을 한국어 검색어 1개.
- queryEn: 해외 자료를 찾을 영어 검색어 1개.

출력: {"topic":"","hashtags":[],"queryKo":"","queryEn":""}`,
      temperature: 0.4,
    });
    return {
      topic: clip(out.topic, 200),
      hashtags: [...new Set(list(out.hashtags, 12).map(cleanTag).filter(Boolean))],
      queryKo: clip(out.queryKo, 120),
      queryEn: clip(out.queryEn, 120),
    };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * 해시태그별 인기 게시물. 7일 동안 30개 제한이 있어 한 번에 3개까지만.
 * 태그별 오류는 따로 돌려준다.
 */
export async function similarHashtags(tags = [], channel = 'card', edge = 'top_media') {
  await requireAuth();
  const acct = pickAcct(channel);
  if (!acct) return { error: '인스타 토큰이 연결되지 않았어요.', results: [] };
  const picked = [...new Set(list(tags, 3).map(cleanTag).filter(Boolean))];
  if (!picked.length) return { error: '검색할 해시태그를 골라 주세요.', results: [] };
  const results = await Promise.all(picked.map(async (tag) => {
    try {
      return { tag, media: await searchHashtagMedia(tag, acct, edge === 'recent_media' ? 'recent_media' : 'top_media') };
    } catch (e) {
      const msg = String(e.message || '');
      const hint = /permission|permitted|access/i.test(msg)
        ? ' (메타 앱에 해시태그 검색 권한이 없을 수 있어요)'
        : /limit|too many/i.test(msg) ? ' (7일 동안 해시태그 30개 제한에 걸렸을 수 있어요)' : '';
      return { tag, media: [], error: msg + hint };
    }
  }));
  return { results };
}

/**
 * 해외(또는 국내) 웹에서 비슷한 사례 찾기.
 * 모델이 적은 링크는 실제로 검색된 페이지 목록(sources)과 맞는 것만 남긴다.
 */
export async function similarWeb(query, topic = '', lang = 'en') {
  await requireAuth();
  const q = clip(query, 200).trim();
  if (!q) return { error: '검색어를 적어 주세요.' };
  const en = lang !== 'ko';
  try {
    const { data, sources } = await searchWebJSON({
      prompt: `${en ? '해외(영어권)' : '국내'} 웹에서 아래 주제와 비슷한 콘텐츠를 찾아라.
우선순위: 인스타그램 카드뉴스·캐러셀 게시물, 같은 주제를 다룬 뉴스레터·블로그·기사.
검색어: ${q}
${topic ? `주제: ${clip(topic, 200)}` : ''}

찾은 것 중 실제로 검색 결과에 있던 페이지만 최대 8개. 없는 링크를 지어내지 말 것.
각 항목: title(원문 제목), url(검색 결과 링크를 그대로), source(사이트나 계정 이름), why(이 주제와 어떻게 비슷한지 한국어 한 줄), angle(내 카드뉴스에 빌려올 만한 관점·구성 한국어 한 줄).
출력은 JSON 하나만: {"items":[{"title":"","url":"","source":"","why":"","angle":""}]}`,
    });
    const real = sources.filter((s) => /^https?:\/\//.test(s.url) && !isGroundingUrl(s.url));
    const norm = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '')).toLowerCase(); } catch { return ''; } };
    const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
    const raw = (Array.isArray(data?.items) ? data.items : []).slice(0, 10);
    // 모델이 구글 중계 주소를 그대로 적은 경우: 풀리면 실제 검색 결과다
    const resolved = await Promise.all(raw.map((it) => resolveGroundingUrl(it?.url)));
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
      used.add(real1);
      items.push({ title: clip(it.title, 200), url: real1, source: clip(it.source, 80) || host(real1), why: clip(it.why, 200), angle: clip(it.angle, 200) });
    });
    // 모델이 따로 소개하지 않은, 검색된 나머지 페이지
    const others = real.filter((s) => !used.has(s.url)).map((s) => ({ url: s.url, title: s.title || host(s.url) }));
    return { items, others };
  } catch (e) {
    return { error: e.message };
  }
}
