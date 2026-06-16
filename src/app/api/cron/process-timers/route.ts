export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import { processDueFrogodoroTimers } from '@/lib/frogodoroTimerProcessor';

const CRON_SECRET = process.env.CRON_SECRET;

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

async function handler(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return unauthorized();
  }

  await connectMongo();
  return NextResponse.json(await processDueFrogodoroTimers());
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
