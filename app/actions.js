'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, passwordMatches, sessionValue, requireAuth } from '@/lib/auth';
import { fetchInsights } from '@/lib/instagram';
import { listEpisodes, updatePage } from '@/lib/notion';
import { metricProperties, runSync } from '@/lib/sync';

const back = (msg) => redirect(`/?msg=${encodeURIComponent(msg)}`);

export async function login(formData) {
  if (!passwordMatches(String(formData.get('password') || ''))) {
    redirect('/?error=1');
  }
  const jar = await cookies();
  jar.set(COOKIE, sessionValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect('/');
}

export async function logout() {
  const jar = await cookies();
  jar.delete(COOKIE);
  redirect('/');
}

/** "지금 노션에 동기화" 버튼 */
export async function syncNow() {
  await requireAuth();
  let msg;
  try {
    const s = await runSync();
    msg = `동기화 완료 · 노션 ${s.updated}건 업데이트 · 미연결 ${s.unmatched.length}건` +
      (s.errors.length ? ` · 오류 ${s.errors.length}건` : '');
  } catch (e) {
    msg = `동기화 실패: ${e.message}`;
  }
  back(msg);
}

/** 게시물을 노션 에피소드에 연결하고 바로 성과를 기록한다 */
export async function linkEpisode(formData) {
  await requireAuth();
  const pageId = String(formData.get('pageId') || '');
  const post = {
    id: String(formData.get('mediaId') || ''),
    permalink: String(formData.get('permalink') || ''),
    timestamp: String(formData.get('timestamp') || ''),
  };
  if (!pageId || !post.id) back('연결할 에피소드를 선택해 주세요.');

  let msg;
  try {
    const episode = (await listEpisodes()).find((e) => e.id === pageId);
    post.insights = await fetchInsights(post);
    await updatePage(pageId, metricProperties(post, episode));
    msg = `“${episode?.title || '에피소드'}”에 연결하고 성과를 기록했어요.`;
  } catch (e) {
    msg = `연결 실패: ${e.message}`;
  }
  back(msg);
}
