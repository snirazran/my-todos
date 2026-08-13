export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getAreaOptions, getPactView } from '@/lib/pact/engine';

export async function GET(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const timezone = url.searchParams.get('timezone') || 'UTC';
  const categoryId = url.searchParams.get('categoryId');

  try {
    await connectMongo();
    if (categoryId) {
      const options = await getAreaOptions({ userId, categoryId, timezone });
      return NextResponse.json({ options });
    }
    const view = await getPactView({ userId, timezone });
    return NextResponse.json(view);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load' },
      { status: 500 },
    );
  }
}

export async function PATCH() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await connectMongo();
  await UserModel.updateOne(
    { _id: userId },
    { $set: { 'quests.pactStreak.introSeen': true } },
  );
  return NextResponse.json({ ok: true });
}
