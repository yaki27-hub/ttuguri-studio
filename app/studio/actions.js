'use server';

import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import {
  listEpisodes, getEpisode, createEpisode, updatePage, appendText,
  P, OPTIONS, title, num, rich, select, multi, status,
} from '@/lib/notion';
import { recommendTopics, generateKonti, systemFrom } from '@/lib/studio';

const go = (path, msg) => redirect(msg ? `${path}?msg=${encodeURIComponent(msg)}` : path);
const nextNumber = (episodes) => Math.max(0, ...episodes.map((e) => e.number || 0)) + 1;

function topicProps(t) {
  const props = {};
  if (t.title) props[P.title] = title(t.title);
  if (OPTIONS.category.includes(t.category)) props[P.category] = select(t.category);
  if (OPTIONS.format.includes(t.format)) props[P.format] = select(t.format);
  if (OPTIONS.formula.includes(t.formula)) props[P.formula] = multi([t.formula]);
  if (t.empathy) props[P.empathy] = rich(t.empathy);
  if (t.twist) props[P.twist] = rich(t.twist);
  return props;
}

/** ① 소재 메모 저장 → 노션 "아이디어" 행 */
export async function addMemo(formData) {
  await requireAuth();
  const memo = String(formData.get('memo') || '').trim();
  if (!memo) go('/studio', '메모를 입력해 주세요.');
  let msg;
  try {
    const episodes = await listEpisodes();
    await createEpisode({
      [P.title]: title(memo),
      [P.number]: num(nextNumber(episodes)),
      [P.status]: status('아이디어'),
      [P.origin]: select('실제 경험'),
    });
    msg = '메모를 노션 아이디어에 저장했어요.';
  } catch (e) {
    msg = `저장 실패: ${e.message}`;
  }
  go('/studio', msg);
}

/** ② 소재 추천 (useActionState) */
export async function recommendAction(_prev, formData) {
  await requireAuth();
  try {
    const episodes = await listEpisodes();
    const memos = episodes.filter((e) => e.status === '아이디어');
    const topics = await recommendTopics({ memos, episodes, system: systemFrom(formData?.get('settings')) });
    if (!topics.length) return { error: '추천을 만들지 못했어요. 다시 시도해 주세요.' };
    return { topics, at: Date.now() };
  } catch (e) {
    return { error: e.message };
  }
}

/** 추천 카드 선택 → 에피소드로 확정하고 콘티 화면으로 */
export async function pickTopic(formData) {
  await requireAuth();
  let t;
  try {
    t = JSON.parse(String(formData.get('topic') || '{}'));
  } catch {
    go('/studio/recommend', '선택한 소재를 읽지 못했어요.');
  }
  let pageId;
  let error;
  try {
    const props = { ...topicProps(t), [P.status]: status('스토리') };
    if (t.memoId) {
      await updatePage(t.memoId, props);
      pageId = t.memoId;
    } else {
      const episodes = await listEpisodes();
      const ep = await createEpisode({
        ...props,
        [P.number]: num(nextNumber(episodes)),
        [P.origin]: select('창작 초안'),
      });
      pageId = ep.id;
    }
  } catch (e) {
    error = e.message;
  }
  if (error) go('/studio/recommend', `저장 실패: ${error}`);
  go(`/studio/ep/${pageId}`);
}

/** ③ 콘티 초안 생성 (useActionState) */
export async function kontiAction(_prev, formData) {
  await requireAuth();
  const pageId = String(formData.get('pageId') || '');
  const note = String(formData.get('note') || '').trim();
  try {
    const [episode, episodes] = await Promise.all([getEpisode(pageId), listEpisodes()]);
    const existingTitles = episodes.filter((e) => e.id !== pageId).map((e) => e.title);
    const draft = await generateKonti({ episode, note, existingTitles, system: systemFrom(formData.get('settings')) });
    return { draft, at: Date.now() };
  } catch (e) {
    return { error: e.message };
  }
}

/** 고친 콘티를 노션 본문 끝에 추가하고 상태를 "콘티"로 */
export async function saveKonti(formData) {
  await requireAuth();
  const pageId = String(formData.get('pageId') || '');
  const body = String(formData.get('text') || '').trim();
  let meta = {};
  try { meta = JSON.parse(String(formData.get('meta') || '{}')); } catch { /* 무시 */ }
  if (!body) go(`/studio/ep/${pageId}`, '저장할 콘티가 없어요.');

  let msg;
  try {
    const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
    await appendText(pageId, `---\n# 콘티 · 뚜구리 스튜디오 (${stamp})\n${body}`);
    await updatePage(pageId, { ...topicProps(meta), [P.status]: status('콘티') });
    msg = '콘티를 노션에 저장했어요. 기존 본문은 그대로 두고 아래에 추가했어요.';
  } catch (e) {
    msg = `저장 실패: ${e.message}`;
  }
  go(`/studio/ep/${pageId}`, msg);
}

/** 제작 상태 변경 */
export async function setStatus(formData) {
  await requireAuth();
  const pageId = String(formData.get('pageId') || '');
  const next = String(formData.get('status') || '');
  if (!OPTIONS.status.includes(next)) go(`/studio/ep/${pageId}`, '알 수 없는 상태예요.');
  let msg;
  try {
    await updatePage(pageId, { [P.status]: status(next) });
    msg = `제작 상태를 “${next}”(으)로 바꿨어요.`;
  } catch (e) {
    msg = `변경 실패: ${e.message}`;
  }
  go(`/studio/ep/${pageId}`, msg);
}
