'use server';

import { requireAuth } from '@/lib/auth';
import { generateJSON } from '@/lib/ai';
import { listEpisodes, createEpisode, P, title, num, status, select } from '@/lib/notion';

/**
 * 작업실 초안 생성. 프롬프트는 브라우저의 설정·원문으로 만든다(수동 복사용과 동일).
 * 결과는 바로 적용하지 않고 초안으로만 돌려준다.
 */
export async function aiDraft(prompt) {
  await requireAuth();
  const text = String(prompt || '');
  if (!text.trim()) return { error: '프롬프트가 비어 있어요.' };
  if (text.length > 40000) return { error: '프롬프트가 너무 길어요.' };
  try {
    const output = await generateJSON({
      system: '너는 인스타툰 제작 보조다. 요청한 JSON 형식만 출력한다. 모든 답은 한국어로 쓴다.',
      prompt: text,
      temperature: 0.8,
    });
    return { output };
  } catch (e) {
    return { error: e.message };
  }
}

/** 작업실에서 저장한 메모를 노션 "아이디어" 행으로도 남긴다 */
export async function addNotionMemo(memo) {
  await requireAuth();
  const text = String(memo || '').trim();
  if (!text) return { error: '메모가 비어 있어요.' };
  try {
    const episodes = await listEpisodes();
    const ep = await createEpisode({
      [P.title]: title(text.slice(0, 200)),
      [P.number]: num(Math.max(0, ...episodes.map((e) => e.number || 0)) + 1),
      [P.status]: status('아이디어'),
      [P.origin]: select('실제 경험'),
    });
    return { id: ep.id };
  } catch (e) {
    return { error: e.message };
  }
}
