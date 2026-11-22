// AI 공급자 추상화: AI_PROVIDER=gemini(기본) | claude
// 환경변수만 바꾸면 코드 수정 없이 모델을 갈아탈 수 있다.

const PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

/** JSON 응답만 받는다. system: 지시문, prompt: 이번 요청 */
export async function generateJSON({ system, prompt, temperature = 0.9 }) {
  const raw = PROVIDER === 'claude'
    ? await callClaude({ system, prompt, temperature })
    : await callGemini({ system, prompt, temperature });
  return parseJSON(raw);
}

function parseJSON(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('AI 응답을 읽지 못했어요. 다시 시도해 주세요.');
  }
}

/* ---------------- Gemini ---------------- */
let cachedGeminiModel = null;

/** GEMINI_MODEL 이 없으면 사용 가능한 최신 flash 모델을 고른다 */
async function geminiModel(key) {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  if (cachedGeminiModel) return cachedGeminiModel;
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      headers: { 'x-goog-api-key': key },
      cache: 'no-store',
    });
    const json = await res.json();
    const ver = (n) => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0');
    const candidates = (json.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n))
      .sort((a, b) => ver(b) - ver(a));
    cachedGeminiModel = candidates[0] || 'gemini-2.5-flash';
  } catch {
    cachedGeminiModel = 'gemini-2.5-flash';
  }
  return cachedGeminiModel;
}

async function callGemini({ system, prompt, temperature }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
  const model = await geminiModel(key);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature, responseMimeType: 'application/json' },
      }),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini 오류: ${json.error?.message || res.status}`);
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
  if (!text) throw new Error('Gemini가 빈 응답을 보냈어요. 다시 시도해 주세요.');
  return text;
}

/* ---------------- 이미지 + 글로 JSON 받기 (Gemini) ---------------- */
/** images: [{ mimeType, data(base64) }]. AI_PROVIDER 와 상관없이 GEMINI_API_KEY 로 */
export async function generateJSONWithImages({ prompt, images = [], temperature = 0.3 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY가 없어 이미지를 읽을 수 없어요.');
  const model = await geminiModel(key);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [...images.map((im) => ({ inlineData: { mimeType: im.mimeType, data: im.data } })), { text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json' },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini 오류: ${json.error?.message || res.status}`);
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
  if (!text) throw new Error('Gemini가 빈 응답을 보냈어요.');
  return parseJSON(text);
}

/* ---------------- 웹 검색 (Gemini + 구글 검색) ---------------- */
const GROUNDING_REDIRECT = /^https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//;
export const isGroundingUrl = (u) => GROUNDING_REDIRECT.test(String(u || ''));

/**
 * 구글 검색 결과의 중계 주소를 실제 주소로 푼다. 중계 주소가 아니거나 못 풀면 null.
 * 중계 주소는 실제 검색 결과에서만 나오므로, 풀리면 지어낸 링크가 아니다.
 */
export async function resolveGroundingUrl(u) {
  if (!isGroundingUrl(u)) return null;
  try {
    const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(5000), cache: 'no-store' });
    const loc = r.headers.get('location');
    return loc && /^https?:\/\//.test(loc) && !isGroundingUrl(loc) ? loc : null;
  } catch {
    return null;
  }
}

/**
 * 구글 검색을 붙여 답을 받는다. AI_PROVIDER 와 상관없이 GEMINI_API_KEY 가 있으면 쓴다.
 * 돌려주는 값: { data(JSON), sources: [{ url, title }] }
 * sources 는 모델이 실제로 검색해 본 페이지라서, 모델이 적은 링크는 이 목록과 맞춰 본다.
 */
export async function searchWebJSON({ prompt, temperature = 0.3 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY가 없어 웹 검색을 할 수 없어요.');
  const model = await geminiModel(key);
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini 검색 오류: ${json.error?.message || res.status}`);
  const cand = json.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text || '').join('') || '';
  const chunks = (cand?.groundingMetadata?.groundingChunks || []).map((c) => c.web).filter((w) => w?.uri).slice(0, 15);
  const sources = await Promise.all(chunks.map(async (w) => ({ url: (await resolveGroundingUrl(w.uri)) || w.uri, title: w.title || '' })));
  let data = null;
  try { data = text ? parseJSON(text) : null; } catch { data = null; }
  return { data, sources };
}

/* ---------------- Claude ---------------- */
async function callClaude({ system, prompt, temperature }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
      max_tokens: 4000,
      temperature,
      system: `${system}\n\n반드시 JSON 하나만 출력한다. 설명이나 코드 블록 표시는 쓰지 않는다.`,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Claude 오류: ${json.error?.message || res.status}`);
  return (json.content || []).map((c) => c.text || '').join('');
}

/* ---------------- 이미지 (Gemini 나노바나나) ---------------- */
// AI_PROVIDER 와 상관없이 GEMINI_API_KEY 가 있으면 쓴다.
export const IMAGE_MODEL = () => process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';

/**
 * 이미지 한 장 생성. refs: 참고 이미지 [{ mimeType, data(base64) }] (캐릭터 레퍼런스 등)
 * 돌려주는 값: { mimeType, data(base64), note }
 */
export async function generateImage({ prompt, refs = [], aspectRatio = '4:5', imageSize = '1K' }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
  const parts = [
    ...refs.map((r) => ({ inlineData: { mimeType: r.mimeType, data: r.data } })),
    { text: prompt },
  ];
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL()}:generateContent`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio, imageSize } },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini 이미지 오류: ${json.error?.message || res.status}`);
  const out = json.candidates?.[0]?.content?.parts || [];
  const img = out.find((p) => p.inlineData?.data);
  const note = out.map((p) => p.text || '').join('').trim();
  if (!img) {
    const reason = json.candidates?.[0]?.finishReason || json.promptFeedback?.blockReason;
    throw new Error(`이미지가 오지 않았어요${reason ? ` (${reason})` : ''}.${note ? ` 모델 답: ${note.slice(0, 200)}` : ''}`);
  }
  return { mimeType: img.inlineData.mimeType || 'image/png', data: img.inlineData.data, note };
}

/* ---------------- 이미지 속 글자 읽기 (Gemini) ---------------- */
/**
 * 해외 인스타 게시물의 장별 이미지 + 캡션을 읽고 한국어로 옮긴다.
 * images: [{ mimeType, data(base64) }]
 * 돌려주는 값: { slides: [{ n, original, ko }], captionKo, summary }
 */
export async function readPostSlides({ images, caption = '', account = '' }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY가 없어 이미지 속 글자를 읽지 못해요.');
  const model = await geminiModel(key);
  const prompt = `인스타그램 @${account} 게시물이다. 이미지 ${images.length}장은 순서대로 1장, 2장… 이다.
할 일:
1. 장마다 이미지에 적힌 글자를 원문 그대로 옮긴다(original). 글자가 없으면 그림 내용을 한 줄로 [그림: …] 처럼 적는다.
2. 그 글자를 자연스러운 한국어로 번역한다(ko). 제품명·회사명·숫자·날짜는 원문 표기 유지.
3. 아래 캡션도 한국어로 번역한다(captionKo). 해시태그는 빼고.
4. 이 게시물이 말하는 핵심을 한국어 한두 문장으로(summary). 이미지·캡션에 없는 내용은 덧붙이지 않는다.

캡션:
"""${String(caption).slice(0, 4000)}"""

출력은 JSON 하나만: {"slides":[{"n":1,"original":"","ko":""}],"captionKo":"","summary":""}`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [...images.map((im) => ({ inlineData: { mimeType: im.mimeType, data: im.data } })), { text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini 오류: ${json.error?.message || res.status}`);
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
  if (!text) throw new Error('Gemini가 빈 응답을 보냈어요.');
  const out = parseJSON(text);
  return {
    slides: (Array.isArray(out.slides) ? out.slides : []).map((x, i) => ({ n: Number(x.n) || i + 1, original: String(x.original || '').trim(), ko: String(x.ko || '').trim() })),
    captionKo: String(out.captionKo || '').trim(),
    summary: String(out.summary || '').trim(),
  };
}
