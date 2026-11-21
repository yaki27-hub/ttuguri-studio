import { isAuthed } from '@/lib/auth';
import { envStatus } from '@/lib/env-status';
import Login from '../../Login';
import Nav from '../../Nav';
import TrendsClient from './TrendsClient';
import { getChannel } from '@/lib/channel-server';
import { igAccount } from '@/lib/channel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function TrendsPage() {
  if (!(await isAuthed())) return <Login />;
  return (
    <main className="wrap wide">
      <Nav active="trends" />
      <TrendsClient igReady={envStatus().instagram.ready || Boolean(igAccount('card').token && igAccount('card').userId)} channel={await getChannel()} />
    </main>
  );
}
