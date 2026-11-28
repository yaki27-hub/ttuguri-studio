import { NextResponse } from 'next/server';
import { runDailyReport } from '@/lib/dailyReports';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Vercel Cron 이 매일 아침 7시(한국)에 호출한다. CRON_SECRET 이 맞는 요청만 실행.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const r = await runDailyReport({ via: 'auto' });
    return NextResponse.json({ ok: true, date: r.date, ideas: r.report.ideas.length, observations: r.report.observations.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
