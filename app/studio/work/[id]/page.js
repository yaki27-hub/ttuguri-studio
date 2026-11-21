import { isAuthed } from '@/lib/auth';
import { envStatus } from '@/lib/env-status';
import Login from '../../../Login';
import Nav from '../../../Nav';
import Workspace from '../_c/Workspace';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function WorkspacePage({ params }) {
  const { id } = await params;
  if (!(await isAuthed())) return <Login />;
  return (
    <>
      <Nav active="work" mobile={false} />
      <Workspace id={id} aiReady={envStatus().ai.ready} imageReady={envStatus().image.ready} />
    </>
  );
}
