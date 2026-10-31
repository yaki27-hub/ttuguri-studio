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
