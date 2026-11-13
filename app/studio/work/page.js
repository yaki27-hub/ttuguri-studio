import { isAuthed } from '@/lib/auth';
import { envStatus } from '@/lib/env-status';
import Login from '../../Login';
import Nav from '../../Nav';
import WorkHome from './_c/WorkHome';

export const dynamic = 'force-dynamic';

export default async function WorkPage() {
  if (!(await isAuthed())) return <Login />;
  return (
    <main className="wrap narrow">
      <Nav active="work" />
      <WorkHome notionReady={envStatus().notion.ready} aiReady={envStatus().ai.ready} />
    </main>
  );
}
