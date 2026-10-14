export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getLeapView } from '@/lib/leap/view';

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const timezone = new URL(req.url).searchParams.get('timezone') || 'UTC';
  try {
    await connectMongo();
    const { view } = await getLeapView({ userId, timezone });
    return NextResponse.json(view);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  await connectMongo();
  const set: Record<string, unknown> = {};
  if (body.resultSeen === true) set['quests.leap.pendingResult'] = null;
  if (body.joinSeen === true) set['quests.leap.pendingJoin'] = null;
  if (Object.keys(set).length) {
    await UserModel.updateOne(
      { _id: userId, 'quests.leap.v': 2 },
      { $set: set },
    );
  }
  return NextResponse.json({ ok: true });
}
