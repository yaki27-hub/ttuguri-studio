import { redirect } from 'next/navigation';
import { isAuthed } from '@/lib/auth';
import Login from './Login';

export const dynamic = 'force-dynamic';

/** 첫 화면은 작업. 로그인 전이면 로그인 화면 */
export default async function Home({ searchParams }) {
  const params = await searchParams;
  if (!(await isAuthed())) return <Login error={params?.error} />;
  redirect('/studio/work');
}
