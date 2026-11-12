export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { readPlusEarned } from '@/lib/plus/earned';
import { loadRunningSeasonSetProgress } from '@/lib/quests/seasonSets';
import {
  PLUS_PREVIEW_DAYS,
  PLUS_PREVIEW_OFFER_MS,
  plusPreviewState,
  readPlusPreview,
} from '@/lib/plus/preview';

const DAY_MS = 86_400_000;
const FIELDS =
  'createdAt onboardingCompleted premiumUntil plusSubscription plusPreview plusEarned wardrobe.inventory';

type LeanUser = {
  createdAt?: Date;
  onboardingCompleted?: boolean;
  premiumUntil?: Date | null;
  plusSubscription?: unknown;
  plusPreview?: unknown;
  plusEarned?: unknown;
  wardrobe?: { inventory?: Record<string, number> };
};

async function load(userId: string) {
  return UserModel.findById(userId).select(FIELDS).lean<LeanUser | null>();
}

async function respond(user: LeanUser | null) {
  const earned = readPlusEarned(user?.plusEarned);
  return NextResponse.json(
    {
      preview: plusPreviewState(user),
      earned: { flies: earned.flies, rareItems: earned.rareItems },
      seasonSet: await loadRunningSeasonSetProgress(user?.wardrobe?.inventory),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await connectMongo();
  return respond(await load(userId));
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  await connectMongo();
  const user = await load(userId);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const state = plusPreviewState(user);
  const now = Date.now();

  if (action === 'start') {
    if (state.phase !== 'eligible') return respond(user);
    const startedAt = new Date(now);
    const endsAt = new Date(now + PLUS_PREVIEW_DAYS * DAY_MS);
    const result = await UserModel.updateOne(
      { _id: userId, plusPreview: null, premiumUntil: null },
      {
        $set: {
          plusPreview: { startedAt, endsAt },
          premiumUntil: endsAt,
          plusEarned: {
            since: `preview:${startedAt.toISOString()}`,
            flies: 0,
            rareItems: 0,
          },
        },
      },
    );
    if (result.modifiedCount > 0) {
      const created = user.createdAt ? new Date(user.createdAt).getTime() : now;
      await recordAnalyticsEvent({
        userId,
        name: 'plus_preview_started',
        properties: { days: Math.floor((now - created) / DAY_MS) },
      });
    }
    return respond(await load(userId));
  }

  if (action === 'end_seen') {
    const record = readPlusPreview(user.plusPreview);
    if (state.phase !== 'ended' || !record) return respond(user);
    await UserModel.updateOne(
      { _id: userId, 'plusPreview.endSeenAt': null },
      {
        $set: {
          'plusPreview.endSeenAt': new Date(now),
          'plusPreview.offerUntil': new Date(now + PLUS_PREVIEW_OFFER_MS),
        },
      },
    );
    return respond(await load(userId));
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
