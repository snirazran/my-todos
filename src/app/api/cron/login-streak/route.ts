export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import { runLoginStreakSweep } from '@/lib/streak/sweep';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectMongo();
  const results = await runLoginStreakSweep();
  return NextResponse.json(results);
}
