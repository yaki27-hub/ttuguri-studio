import { createHash, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

export const COOKIE = 'ttg_session';

/** 비밀번호에서 만든 세션 값. 비밀번호 자체는 쿠키에 저장하지 않는다. */
export function sessionValue(password = process.env.DASHBOARD_PASSWORD) {
  return createHash('sha256').update(`ttuguri-studio:${password || ''}`).digest('hex');
}

export function passwordMatches(input) {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(sessionValue(input));
  const b = Buffer.from(sessionValue(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAuthed() {
  if (!process.env.DASHBOARD_PASSWORD) return false;
  const jar = await cookies();
  return jar.get(COOKIE)?.value === sessionValue();
}

export async function requireAuth() {
  if (!(await isAuthed())) throw new Error('로그인이 필요합니다.');
}
