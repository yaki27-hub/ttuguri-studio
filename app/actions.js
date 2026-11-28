'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE, passwordMatches, sessionValue, requireAuth } from '@/lib/auth';
import { fetchInsights } from '@/lib/instagram';
import { listEpisodes, updatePage, P, num, rich, url, date, select } from '@/lib/notion';
import { metricProperties, runSync, kstDate, mediaIdsOf, shortcode } from '@/lib/sync';

const back = (msg) => redirect(`/stats?msg=${encodeURIComponent(msg)}`);

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

/** 게시물과 노션 에피소드의 연결을 해제한다. 같은 편에 다른 게시물이 묶여 있으면 이 게시물만 뺀다. */
export async function unlinkEpisode(formData) {
  await requireAuth();
  const pageId = String(formData.get('pageId') || '');
  const timestamp = String(formData.get('timestamp') || '');
  const mediaId = String(formData.get('mediaId') || '');
  const permalink = String(formData.get('permalink') || '');
  if (!pageId) back('해제할 에피소드를 찾지 못했어요.');

  let msg;
  try {
    const episode = (await listEpisodes()).find((e) => e.id === pageId);
    const rest = mediaIdsOf(episode).filter((id) => id !== mediaId);
    if (mediaId && rest.length) {
      // 묶음에서 이 게시물만 빼고, 남은 게시물로 합계를 다시 계산한다
      const posts = [];
      for (const id of rest) posts.push({ id, insights: await fetchInsights({ id }) });
      const keepLink = episode?.link && shortcode(episode.link) !== shortcode(permalink);
      const props = metricProperties(posts, { ...episode, link: keepLink ? episode.link : '', uploaded: episode?.uploaded });
      props[P.mediaId] = rich(rest.join(','));
      if (!keepLink) props[P.link] = url(null);
      await updatePage(pageId, props);
      msg = `“${episode?.title || '에피소드'}”에서 이 게시물만 뺐어요. 남은 ${rest.length}개로 성과를 다시 계산했어요.`;
    } else {
      const props = {
        [P.mediaId]: rich(''),
        [P.link]: url(null),
        [P.views]: num(null),
        [P.reach]: num(null),
        [P.likes]: num(null),
        [P.comments]: num(null),
        [P.shares]: num(null),
        [P.saved]: num(null),
        [P.syncedAt]: date(null),
        [P.syncState]: select('대기'),
      };
      // 업로드일은 연결할 때 자동으로 채운 값과 같을 때만 지운다 (직접 입력한 날짜는 보존)
      if (timestamp && episode?.uploaded === kstDate(timestamp)) props[P.uploaded] = date(null);
      await updatePage(pageId, props);
      msg = `“${episode?.title || '에피소드'}” 연결을 해제했어요.`;
    }
  } catch (e) {
    msg = `해제 실패: ${e.message}`;
  }
  back(msg);
}

/**
 * 게시물을 노션 에피소드에 연결하고 바로 성과를 기록한다.
 * 이미 다른 게시물(피드 또는 릴스)이 연결된 편이면 같은 편으로 묶고 합계를 기록한다.
 */
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
    const others = mediaIdsOf(episode).filter((id) => id !== post.id);
    const posts = [post];
    for (const id of others) posts.push({ id, insights: await fetchInsights({ id }) });
    await updatePage(pageId, metricProperties(posts, episode));
    msg = others.length
      ? `“${episode?.title || '에피소드'}”에 같은 편으로 묶었어요 (게시물 ${posts.length}개 합계 기록).`
      : `“${episode?.title || '에피소드'}”에 연결하고 성과를 기록했어요.`;
  } catch (e) {
    msg = `연결 실패: ${e.message}`;
  }
  back(msg);
}
