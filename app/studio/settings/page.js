import { isAuthed } from '@/lib/auth';
import { envStatus } from '@/lib/env-status';
import Login from '../../Login';
import Nav from '../../Nav';
import SettingsClient from '../work/_c/SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  if (!(await isAuthed())) return <Login />;
  return (
    <main className="wrap narrow">
      <Nav active="settings" />
      <SettingsClient env={envStatus()} />
    </main>
  );
}
