import { NextResponse } from 'next/server';
import { runSync } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vercel Cron 이 매일 호출한다. CRON_SECRET 이 맞는 요청만 실행.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const summary = await runSync();
    return NextResponse.json({ ok: true, at: new Date().toISOString(), ...summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
