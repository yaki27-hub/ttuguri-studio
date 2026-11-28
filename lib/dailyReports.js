import { get, list, put } from '@vercel/blob';
import { searchWebJSON, resolveGroundingUrl, isGroundingUrl } from '@/lib/ai';
import { listEpisodes } from '@/lib/notion';
import { DEFAULT_BRIEF, buildDailyPrompt, parseDailyReport, recentIdeaTitles } from '@/lib/work/dailyReport';

/*
 * 매일 소재 리포트 서버 저장소 (Vercel Blob, 비공개).
 * daily/YYYY-MM-DD.json  → { date, savedAt, via, report, answer }
 * daily/brief.txt        → 고친 조사 기준 (없으면 기본값)
 */

const PREFIX = 'daily/';
const BRIEF = `${PREFIX}brief.txt`;

export const blobReady = () => !!(process.env.BLOB_READ_WRITE_TOKEN || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID));

export const todayKST = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

async function readText(pathname) {
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r || !r.stream) return null;
  return new Response(r.stream).text();
}

async function writeJSON(pathname, data) {
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}

/** 최근 리포트 (날짜 내림차순) */
export async function listReports(limit = 30) {
  const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
  const files = blobs
    .filter((b) => /\d{4}-\d{2}-\d{2}\.json$/.test(b.pathname))
    .sort((a, b) => b.pathname.localeCompare(a.pathname))
    .slice(0, limit);
  const out = await Promise.all(
    files.map(async (b) => {
      try {
        return JSON.parse((await readText(b.pathname)) || 'null');
      } catch {
        return null;
      }
    }),
  );
  return out.filter((r) => r && r.date && r.report);
}

export async function saveReport(rec) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rec?.date || '')) throw new Error('날짜가 잘못됐어요.');
  const clean = { date: rec.date, savedAt: rec.savedAt || new Date().toISOString(), via: rec.via || 'paste', report: parseDailyReport(rec.report), answer: String(rec.answer || '').slice(0, 4000) };
  await writeJSON(`${PREFIX}${rec.date}.json`, clean);
  return clean;
}

export async function setAnswer(date, answer) {
  const text = await readText(`${PREFIX}${date}.json`);
  if (!text) throw new Error('그 날짜의 리포트가 없어요.');
  const rec = JSON.parse(text);
  rec.answer = String(answer || '').slice(0, 4000);
  await writeJSON(`${PREFIX}${date}.json`, rec);
  return rec;
}

export async function getBrief() {
  try {
    return (await readText(BRIEF)) || DEFAULT_BRIEF;
  } catch {
    return DEFAULT_BRIEF;
  }
}

export async function setBrief(text) {
  const t = String(text || '').trim() || DEFAULT_BRIEF;
  await put(BRIEF, t, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'text/plain; charset=utf-8', cacheControlMaxAge: 60 });
  return t;
}

/** 오늘 프롬프트: 조사 기준 + 날짜·시즌 + 이전 7일 추천 + 노션 에피소드(+브라우저 작업 제목)
 *  more = 오늘 이미 받은 소재 제목 (다른 소재 더 찾기: 이것과 겹치지 않게, 다른 각도로) */
export async function makePrompt(extraTitles = [], more = []) {
  const [brief, saved, notionEps] = await Promise.all([
    getBrief(),
    listReports(10).catch(() => []),
    listEpisodes().catch(() => []),
  ]);
  const titles = [...new Set([...notionEps.map((e) => e.title).filter((t) => t && t !== '(제목 없음)'), ...extraTitles.map(String)])];
  const base = buildDailyPrompt({ brief, recentIdeas: recentIdeaTitles(saved, todayKST()), episodes: titles });
  if (!more.length) return base;
  return `${base}

[추가 조사 — 오늘 이미 받은 소재]
아래 ${more.length}개는 오늘 이미 받았어. 같은 사건·같은 농담·같은 형식은 빼고, 아직 안 본 커뮤니티·계정·키워드를 새로 검색해서 다른 각도의 소재 10개를 더 찾아.
관찰(observations)도 앞에서 보지 않은 새 사례만. 오늘의 질문은 앞과 다른 주제로 하나, 콘티는 새 소재 중 1개만.
${more.map((t) => `- ${t}`).join('\n')}`;
}

/** 구글 검색을 붙여 조사한다. 관찰 사례의 링크는 실제 검색 결과와 맞는지 확인해 linkOk 를 단다. */
export async function searchReport(prompt) {
  const { data, sources } = await searchWebJSON({ prompt: String(prompt).slice(0, 24000), temperature: 0.5 });
  if (!data) throw new Error('검색은 했지만 JSON 결과를 받지 못했어요.');
  const real = sources.filter((x) => /^https?:\/\//.test(x.url) && !isGroundingUrl(x.url));
  const norm = (u) => {
    try {
      const x = new URL(u);
      return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '')).toLowerCase();
    } catch {
      return '';
    }
  };
  data.observations = await Promise.all(
    (Array.isArray(data.observations) ? data.observations : []).map(async (o) => {
      const url = String(o?.url || '');
      const resolved = await resolveGroundingUrl(url);
      if (resolved) return { ...o, url: resolved, linkOk: true };
      const hit = real.find((x) => norm(x.url) && norm(x.url) === norm(url));
      return { ...o, url: hit?.url || url, linkOk: !!hit };
    }),
  );
  return parseDailyReport(data);
}

/** 오늘 조사하고 저장 (크론·수동 공통). 오늘 답을 이미 적었으면 그대로 둔다. */
export async function runDailyReport({ via = 'auto', extraTitles = [] } = {}) {
  const prompt = await makePrompt(extraTitles);
  let report;
  let lastErr;
  for (let i = 0; i < 2 && !report; i++) {
    try {
      report = await searchReport(prompt);
    } catch (e) {
      lastErr = e;
    }
  }
  if (!report) throw lastErr;
  const date = todayKST();
  const prev = await readText(`${PREFIX}${date}.json`).then((t) => (t ? JSON.parse(t) : null)).catch(() => null);
  return saveReport({ date, via, report, answer: prev?.answer || '' });
}

/** 다른 소재 더 찾기: 오늘 리포트에 새 묶음을 덧붙인다 (오늘 리포트가 없으면 새로 조사) */
export async function moreDailyIdeas({ extraTitles = [] } = {}) {
  const date = todayKST();
  const prev = await readText(`${PREFIX}${date}.json`).then((t) => (t ? JSON.parse(t) : null)).catch(() => null);
  if (!prev?.report) return runDailyReport({ via: 'ai', extraTitles });
  const old = prev.report;
  const round = Math.max(0, ...old.ideas.map((i) => i.round || 0)) + 1;
  const report = await searchReport(await makePrompt(extraTitles, old.ideas.map((i) => i.title)));
  const seen = new Set(old.ideas.map((i) => i.title.replace(/\s/g, '')));
  const offset = Math.max(0, ...old.ideas.map((i) => i.priority || 0));
  const fresh = report.ideas.filter((i) => !seen.has(i.title.replace(/\s/g, ''))).map((i) => ({ ...i, round, priority: offset + (i.priority || 0) }));
  if (!fresh.length) throw new Error('새로 찾은 소재가 모두 오늘 받은 것과 겹쳤어요. 잠시 뒤 다시 시도해 주세요.');
  const urls = new Set(old.observations.map((o) => o.url).filter(Boolean));
  const merged = {
    observations: [...old.observations, ...report.observations.filter((o) => !o.url || !urls.has(o.url))],
    noTrend: old.noTrend,
    ideas: [...old.ideas, ...fresh],
    question: old.question || report.question,
    questions: [...(old.questions || []), ...(report.question && report.question !== old.question ? [report.question] : [])],
    conti: [...old.conti, ...report.conti],
  };
  return saveReport({ ...prev, report: merged, savedAt: new Date().toISOString() });
}
