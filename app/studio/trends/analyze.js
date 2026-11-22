'use server';

// 해외 계정 분석 (카드뉴스): 숫자 정리 → 잘된 게시물로 AI 스타일 분석 → 여러 계정 비교
import { requireAuth } from '@/lib/auth';
import { discoverAccountDeep } from '@/lib/instagram';
import { accountStats } from '@/lib/accountStats';
import { generateJSON, generateJSONWithImages } from '@/lib/ai';
import { igAccount } from '@/lib/channel';

const USERNAME = /^[a-z0-9._]{1,30}$/;
const MAX_ACCOUNTS = 5;
const clip = (s, n) => String(s || '').slice(0, n);
const list = (v, n) => (Array.isArray(v) ? v : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, n);

/** 그 채널 계정 토큰, 없으면 다른 채널 계정 (business_discovery 는 어느 계정으로든 된다) */
function pickAcct(channel) {
  const mine = igAccount(channel === 'card' ? 'card' : 'toon');
  const other = igAccount(channel === 'card' ? 'toon' : 'card');
  return mine.token && mine.userId ? mine : other.token && other.userId ? other : null;
}
const cleanUser = (u) => String(u || '').trim().replace(/^@/, '').toLowerCase();

/** 계정별 최근 30개 숫자 정리. 계정별 오류는 따로 돌려준다 */
export async function analyzeAccounts(usernames = [], channel = 'card') {
  await requireAuth();
  const acct = pickAcct(channel);
  if (!acct) return { error: '인스타 토큰이 연결되지 않았어요.', accounts: [] };
  const users = [...new Set(list(usernames, 10).map(cleanUser))].filter((u) => USERNAME.test(u)).slice(0, MAX_ACCOUNTS);
  if (!users.length) return { error: '분석할 계정명을 적어 주세요.', accounts: [] };
  const accounts = await Promise.all(users.map(async (u) => {
    try {
      return accountStats(await discoverAccountDeep(u, 30, acct));
    } catch (e) {
      const msg = String(e.message || '');
      return { username: u, error: /business|nonexist|Invalid user|cannot be found|does not exist/i.test(msg) ? '비즈니스·크리에이터 계정이 아니거나 없는 계정이에요.' : msg };
    }
  }));
  return { accounts, at: Date.now() };
}

const MAX_IMAGES = 8;

async function loadImage(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 3_000_000) return null;
    return { mimeType: (r.headers.get('content-type') || 'image/jpeg').split(';')[0], data: buf.toString('base64') };
  } catch {
    return null;
  }
}

/**
 * AI 스타일 분석. stats: analyzeAccounts 의 계정 하나 (브라우저가 그대로 다시 보냄).
 * 반응 상위 게시물의 장 이미지(최대 8장)와 상·하위 캡션을 읽는다.
 */
export async function analyzeStyle(stats = {}) {
  await requireAuth();
  const user = cleanUser(stats.username);
  if (!USERNAME.test(user)) return { error: '계정명이 올바르지 않아요.' };
  const top = (Array.isArray(stats.top) ? stats.top : []).slice(0, 6);
  if (!top.length) return { error: '분석할 게시물이 없어요.' };

  // 상위 3개 게시물에서 장을 골고루 (게시물마다 최대 3장)
  const picks = [];
  for (const p of top.slice(0, 3)) {
    const slides = (Array.isArray(p.slides) && p.slides.length ? p.slides : [p.image || p.thumb]).filter((u) => /^https:\/\//.test(String(u)));
    slides.slice(0, 3).forEach((u, i) => picks.push({ url: u, label: `반응 ${top.indexOf(p) + 1}위 게시물 ${i + 1}장` }));
  }
  const loaded = (await Promise.all(picks.slice(0, MAX_IMAGES).map(async (x) => ({ ...x, img: await loadImage(x.url) })))).filter((x) => x.img);

  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '숨김');
  const topText = top.map((p, i) => `${i + 1}위 [${p.type}] ♥${fmt(p.likes)} 💬${fmt(p.comments)}\n${clip(p.caption, 500)}`).join('\n\n');
  const bottomText = list(stats.bottomCaptions, 5).map((c, i) => `하위 ${i + 1}: ${clip(c, 300)}`).join('\n');
  const prompt = `인스타그램 @${user} 은 해외 AI·정보 카드뉴스 계정이다. 이 계정이 왜 잘되는지 분석해서, 한국어로 카드뉴스를 만드는 사람이 따라 할 수 있게 정리하라.

계정 정보: 팔로워 ${fmt(stats.followers)}, 최근 ${stats.analyzed}개 분석, 주 ${stats.perWeek ?? '?'}회 게시, 형식 비율 캐러셀 ${stats.mix?.carousel ?? 0} / 피드 ${stats.mix?.feed ?? 0} / 릴스 ${stats.mix?.reel ?? 0}
소개: ${clip(stats.bio, 300)}

이미지 ${loaded.length}장은 순서대로: ${loaded.map((x) => x.label).join(', ')}

반응 상위 게시물 캡션:
${topText}

반응 하위 게시물 캡션 (비교용):
${bottomText}

규칙: 이미지·캡션에서 보이는 것만 근거로 쓴다. 추측이면 "추정"이라고 붙인다. 모두 한국어. 원문 문구를 예로 들 때는 원문 그대로 짧게.
출력 JSON:
{
 "oneLine": "이 계정을 한 줄로",
 "topics": ["주로 다루는 주제 3~5개"],
 "hooks": [{"pattern": "첫 장 문구 패턴", "example": "실제 예시(원문)"}],
 "structure": "장 구성 흐름 (예: 1장 후킹 → 2~5장 항목별 설명 → 마지막 장 저장 유도)",
 "design": {"colors": "", "type": "글자 크기·굵기·배치", "layout": "", "imagery": "사진·일러스트·스크린샷 등"},
 "caption": "캡션 쓰는 방식 (길이·톤·CTA·해시태그)",
 "whyTop": ["상위 게시물이 하위보다 잘된 이유 2~4개"],
 "apply": ["내 한국어 카드뉴스에 바로 적용할 점 3~5개"],
 "avoid": ["따라 하지 않는 게 좋은 점 1~2개"]
}`;
  try {
    const out = loaded.length
      ? await generateJSONWithImages({ prompt, images: loaded.map((x) => x.img) })
      : await generateJSON({ system: '너는 인스타그램 카드뉴스 분석가다. 요청한 JSON 형식만 출력한다.', prompt, temperature: 0.3 });
    return {
      username: user,
      at: Date.now(),
      imagesRead: loaded.length,
      oneLine: clip(out.oneLine, 200),
      topics: list(out.topics, 6),
      hooks: (Array.isArray(out.hooks) ? out.hooks : []).slice(0, 5).map((h) => ({ pattern: clip(h?.pattern, 200), example: clip(h?.example, 200) })),
      structure: clip(out.structure, 400),
      design: { colors: clip(out.design?.colors, 200), type: clip(out.design?.type, 200), layout: clip(out.design?.layout, 200), imagery: clip(out.design?.imagery, 200) },
      caption: clip(out.caption, 400),
      whyTop: list(out.whyTop, 5),
      apply: list(out.apply, 6),
      avoid: list(out.avoid, 3),
    };
  } catch (e) {
    return { error: e.message };
  }
}

/** 여러 계정 비교. items: [{ stats(숫자 요약), style(analyzeStyle 결과) }] */
export async function compareAccounts(items = []) {
  await requireAuth();
  const rows = (Array.isArray(items) ? items : []).slice(0, MAX_ACCOUNTS).filter((x) => x?.stats?.username);
  if (rows.length < 2) return { error: '비교하려면 계정이 2개 이상 있어야 해요.' };
  const text = rows.map(({ stats: s, style: st }) => `@${clip(s.username, 30)}: 팔로워 ${s.followers ?? '?'}, 주 ${s.perWeek ?? '?'}회, 평균 좋아요 ${s.avgLikes ?? '숨김'}, 평균 댓글 ${s.avgComments ?? '?'}, 참여율 ${s.engagement ?? '?'}%, 형식 캐러셀 ${s.mix?.carousel ?? 0}/피드 ${s.mix?.feed ?? 0}/릴스 ${s.mix?.reel ?? 0}
${st ? `스타일: ${clip(st.oneLine, 200)} / 후킹: ${(st.hooks || []).map((h) => clip(h.pattern, 80)).join('; ')} / 구성: ${clip(st.structure, 200)} / 잘된 이유: ${list(st.whyTop, 4).join('; ')}` : '스타일 분석 없음 (숫자만)'}`).join('\n\n');
  try {
    const out = await generateJSON({
      system: '너는 인스타그램 카드뉴스 전략가다. 요청한 JSON 형식만 출력한다. 모두 한국어.',
      prompt: `해외 AI·정보 카드뉴스 계정들을 비교한다. 아래 숫자와 분석만 근거로 쓴다. 팔로워 규모가 다르니 참여율을 함께 본다.

${text}

출력 JSON:
{"leader": "참여율·반응 기준으로 가장 배울 게 많은 계정과 이유 한 줄", "common": ["잘되는 계정들의 공통점 2~4개"], "differences": ["계정별로 다른 점 2~4개 (@계정명 포함)"], "plan": ["내 한국어 카드뉴스에서 이번 주에 해 볼 것 3~5개"]}`,
      temperature: 0.3,
    });
    return { leader: clip(out.leader, 300), common: list(out.common, 5), differences: list(out.differences, 5), plan: list(out.plan, 6), at: Date.now() };
  } catch (e) {
    return { error: e.message };
  }
}
