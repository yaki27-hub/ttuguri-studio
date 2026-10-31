import { generateJSON } from './ai';
import { OPTIONS } from './notion';
import { buildSystem } from './work/prompts';

// 프로젝트 지침(인스타툰_뚜구리)을 압축한 공통 지시문
export const SYSTEM = `너는 인스타툰 「뚜구리툰」의 스토리 기획자이자 콘티 작가다.

[캐릭터]
- 주인공: 뚜구리. 회사 일과 개인 프로젝트를 병행하는 직장인 두더지.
- 핵심 모순: 쉬고 싶지만 무언가 하고 싶다. (회사 9to6, 내 일 6to12)
- 성격, 고정 말투, 시그니처 행동, 특별한 능력, 고정 개그 패턴은 미확정이다. 임의로 만들지 않는다.
- 주변 인물은 얼굴과 세부 특징을 생략한 익명 실루엣이다.

[콘텐츠]
- 형식: 한컷 또는 4컷. 한컷으로 충분한 이야기를 억지로 4컷으로 늘리지 않는다.
- 장르: 현실적인 직장인 일상 공감 코미디. 목표 반응은 "이거 완전 내 얘긴데?"
- 카테고리: 회사생활 / 개인 프로젝트 / 일상
- 스토리 공식: 상황 공감형, 이상과 현실형, 반복형, 생각과 현실형, 허무한 결말형, 시각적 대비
- 과장된 세계관, 억지 감동, 교훈, 장황한 독백은 피한다.
- 실제 경험에서 나온 사건을 우선한다.

[대사]
- 실제 한국 직장인이 쓰는 자연스럽고 짧은 구어체.
- 그림으로 보여줄 수 있는 것은 대사로 설명하지 않는다.
- 언어유희, 작은 반전, 시각적 대비를 활용한다.
- 이미 만든 에피소드와 같은 농담을 반복하지 않는다.

[4컷 구조]
1컷 기(상황 제시) → 2컷 승(사건 진행) → 3컷 전(갈등·모순·반전 단서) → 4컷 결(공감·반전·허무한 결말).
각 컷에는 핵심 행동 하나만 둔다.

[이미지 제작 메모 규칙]
- 화면 비율 4:5(1:1.25) 고정.
- 뚜구리는 화면 중심보다 약간 아래에 배치.
- 이미지에는 글자, 말풍선, 제목을 넣지 않고 텍스트가 들어갈 여백을 확보한다.

[캡션]
- 짧은 공감형 캡션과 질문형 마무리, 해시태그는 5개 정도.

모든 답은 한국어로 쓴다.`;

const SETTING_KEYS = ['characterName', 'seriesName', 'introduction', 'voiceRules', 'prohibitions', 'styleNotes'];

/** 설정 화면에서 저장한 캐릭터 설정(JSON)이 오면 그걸로 지시문을 만든다. 없으면 기본 SYSTEM. */
export function systemFrom(settingsJSON) {
  let s;
  try { s = JSON.parse(String(settingsJSON || '')); } catch { return SYSTEM; }
  if (!s || typeof s !== 'object') return SYSTEM;
  const clean = { referenceAssetIds: [], recurringExpressions: [] };
  for (const k of SETTING_KEYS) clean[k] = typeof s[k] === 'string' ? s[k].slice(0, 4000) : '';
  if (!clean.characterName || !clean.seriesName) return SYSTEM;
  clean.referenceAssetIds = Array.from({ length: Math.min(20, Number(s.referenceCount) || 0) });
  clean.recurringExpressions = Array.isArray(s.recurringExpressions) ? s.recurringExpressions.filter((x) => typeof x === 'string').slice(0, 30) : [];
  return `${buildSystem(clean)}

[제작 탭 공통]
- 카테고리: ${OPTIONS.category.join(' / ')}
- 스토리 공식: ${OPTIONS.formula.join(', ')}
- 캡션: 짧은 공감형 캡션과 질문형 마무리, 해시태그는 5개 정도.

모든 답은 한국어로 쓴다.`;
}

const pick = (v, list, fallback = '') => (list.includes(v) ? v : fallback);

function kstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 소재 추천 3개 */
export async function recommendTopics({ memos, episodes, system = SYSTEM }) {
  const memoLines = memos.length
    ? memos.map((m) => `- [${m.id}] ${m.title}`).join('\n')
    : '(아직 메모 없음)';

  const done = episodes
    .filter((e) => !memos.some((m) => m.id === e.id))
    .map((e) => `- ${e.title}${e.status ? ` (${e.status})` : ''}`)
    .join('\n');

  const perf = episodes
    .filter((e) => typeof e.views === 'number')
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 8)
    .map((e) => `- ${e.title} | ${e.category || '-'} | ${(e.formula || []).join(',') || '-'} | 조회 ${e.views} · 도달 ${e.reach ?? '-'} · 공유 ${e.shares ?? 0} · 저장 ${e.saved ?? 0}`)
    .join('\n') || '(성과 데이터 없음)';

  const prompt = `오늘 날짜: ${kstToday()} (한국)

[사용자가 직접 남긴 소재 메모 — 실제 경험이므로 최우선 재료]
${memoLines}

[이미 만든·진행 중인 에피소드 — 겹치지 않게]
${done || '(없음)'}

[지금까지 게시물 성과 — 게시물 수가 적으니 참고 정도로만]
${perf}

위 정보를 바탕으로 뚜구리툰 소재 3개를 추천해라.
- 메모가 있으면 최소 2개는 메모를 발전시킨 소재로 한다. 그 경우 memoId 에 해당 메모의 [ ] 안 ID를 넣는다.
- 나머지는 지금 시기(계절·요일·직장인 이벤트)에 맞는 공감 소재로 한다. memoId 는 빈 문자열.
- 서로 다른 카테고리나 스토리 공식이 섞이도록 한다.
- reason 에는 왜 지금 이 소재인지 근거를 1~2문장으로 쓴다. 성과 데이터를 근거로 쓸 때는 실제 숫자를 언급한다.

JSON 형식:
{"topics":[{"title":"에피소드 제목(짧게)","memoId":"","category":"${OPTIONS.category.join('|')}","format":"한컷|4컷","formula":"${OPTIONS.formula.join('|')}","empathy":"핵심 공감 한 문장","twist":"웃음 또는 반전 포인트 한 문장","reason":"추천 이유"}]}`;

  const json = await generateJSON({ system, prompt });
  return (json.topics || []).slice(0, 3).map((t) => ({
    title: String(t.title || '').trim(),
    memoId: memos.some((m) => m.id === t.memoId) ? t.memoId : '',
    category: pick(t.category, OPTIONS.category),
    format: pick(t.format, ['한컷', '4컷'], '한컷'),
    formula: pick(t.formula, OPTIONS.formula),
    empathy: String(t.empathy || '').trim(),
    twist: String(t.twist || '').trim(),
    reason: String(t.reason || '').trim(),
  })).filter((t) => t.title);
}

/** 콘티 생성 */
export async function generateKonti({ episode, note, existingTitles, system = SYSTEM }) {
  const prompt = `[에피소드]
- 제목: ${episode.title}
- 카테고리: ${episode.category || '미정'}
- 형식: ${episode.format || '미정 (한컷/4컷 중 적합한 쪽을 골라라)'}
- 스토리 공식: ${(episode.formula || []).join(', ') || '미정'}
- 핵심 공감: ${episode.empathy || '미정'}
- 웃음·반전: ${episode.twist || '미정'}
${note ? `\n[사용자 추가 요청]\n${note}\n` : ''}
[이미 만든 에피소드 제목 — 같은 농담 금지]
${existingTitles.slice(0, 40).join(', ')}

이 에피소드의 제작 가능한 최종 콘티를 작성해라. 불필요한 설명 없이 결과물 중심으로.
한컷이면 cuts 에 1개, 4컷이면 4개를 넣는다.

JSON 형식:
{"title":"","category":"${OPTIONS.category.join('|')}","format":"한컷|4컷","formula":"${OPTIONS.formula.join('|')}","empathy":"","twist":"","hook":"첫 장면 또는 후킹 문구",
"cuts":[{"no":1,"role":"기|승|전|결 (한컷은 빈 문자열)","scene":"장면 설명","action":"뚜구리 행동과 감정","dialogue":"대사·말풍선 (없으면 빈 문자열)","background":"배경과 주요 소품"}],
"image":{"composition":"화면 구도","placement":"캐릭터 배치","props":"배경 및 소품","caution":"연출 시 주의사항"},
"caption":"인스타 캡션 (해시태그 5개 포함)"}`;

  const k = await generateJSON({ system, prompt, temperature: 0.85 });
  return {
    title: String(k.title || episode.title).trim(),
    category: pick(k.category, OPTIONS.category, episode.category),
    format: pick(k.format, ['한컷', '4컷'], episode.format || '한컷'),
    formula: pick(k.formula, OPTIONS.formula, (episode.formula || [])[0] || ''),
    empathy: String(k.empathy || episode.empathy || '').trim(),
    twist: String(k.twist || episode.twist || '').trim(),
    text: kontiToText(k),
  };
}

/** AI 결과를 사람이 고치기 쉬운 텍스트로 */
export function kontiToText(k) {
  const lines = [];
  if (k.hook) lines.push(`## 후킹`, k.hook, '');
  lines.push('## 콘티');
  for (const c of k.cuts || []) {
    const head = (k.cuts || []).length > 1 ? `[${c.no}컷${c.role ? ` · ${c.role}` : ''}]` : '[한컷]';
    lines.push(head);
    if (c.scene) lines.push(`- 장면: ${c.scene}`);
    if (c.action) lines.push(`- 뚜구리: ${c.action}`);
    if (c.dialogue) lines.push(`- 대사: ${c.dialogue}`);
    if (c.background) lines.push(`- 배경·소품: ${c.background}`);
    lines.push('');
  }
  const img = k.image || {};
  lines.push('## 이미지 제작 메모');
  if (img.composition) lines.push(`- 구도: ${img.composition}`);
  if (img.placement) lines.push(`- 배치: ${img.placement}`);
  if (img.props) lines.push(`- 배경·소품: ${img.props}`);
  if (img.caution) lines.push(`- 주의: ${img.caution}`);
  if (k.caption) lines.push('', '## 캡션 초안', k.caption);
  return lines.join('\n').trim();
}
