export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { getZonedToday } from '@/lib/utils';
import { readOverflowJar } from '@/lib/economy/overflowJar';
import { resolveEconomyTimezone } from '@/lib/economy/guards';

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();
    const tz = await resolveEconomyTimezone(
      userId,
      req.nextUrl.searchParams.get('timezone'),
    );
    return NextResponse.json(await readOverflowJar(userId, getZonedToday(tz)));
  } catch (error) {
    console.error('Overflow jar read failed:', error);
    return NextResponse.json({ error: 'Jar read failed' }, { status: 500 });
  }
}
