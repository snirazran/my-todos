import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import AnalyticsEventModel from '@/lib/models/AnalyticsEvent';
import FriendshipModel from '@/lib/models/Friendship';
import UserModel from '@/lib/models/User';
import { CHANNEL_LABELS, type UserAcquisition } from '@/lib/attribution/classify';
import { channelKeyFor, channelLabel, pathFor } from '@/lib/analytics/report/acquisition';

export const dynamic = 'force-dynamic';

const EVENT_LIMIT = 600;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await connectMongo();
  const user = await UserModel.findById(id)
    .select('_id name email createdAt isGuest premiumUntil plusSubscription acquisition wardrobe.flies quests.loginStreak.count onboardingCompleted')
    .lean<{
      _id: unknown;
      name?: string;
      email?: string;
      createdAt?: Date;
      isGuest?: boolean;
      premiumUntil?: Date;
      plusSubscription?: { periodType?: string; store?: string; plan?: string };
      acquisition?: UserAcquisition;
      wardrobe?: { flies?: number };
      quests?: { loginStreak?: { count?: number } };
      onboardingCompleted?: boolean;
    } | null>();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const userId = String(user._id);
  const anonymousIds = await AnalyticsEventModel.distinct('anonymousId', {
    userId,
    anonymousId: { $exists: true },
  });
  const filter = {
    $or: [
      { userId },
      ...(anonymousIds.length ? [{ userId: { $in: anonymousIds.map((value) => `anonymous:${value}`) } }] : []),
    ],
  };

  const [events, total, friends, nameRows] = await Promise.all([
    AnalyticsEventModel.find(filter)
      .select('userId name category platform properties occurredAt source')
      .sort({ occurredAt: 1 })
      .limit(EVENT_LIMIT)
      .lean(),
    AnalyticsEventModel.countDocuments(filter),
    FriendshipModel.countDocuments({ $or: [{ userA: userId }, { userB: userId }] }),
    AnalyticsEventModel.aggregate<{ _id: string; count: number; last: Date }>([
      { $match: { userId } },
      { $group: { _id: '$name', count: { $sum: 1 }, last: { $max: '$occurredAt' } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const now = new Date();
  const acquisition = user.acquisition;
  const channel = channelKeyFor(acquisition);

  return NextResponse.json(
    {
      profile: {
        id: userId,
        name: user.name ?? '',
        email: user.email ?? '',
        createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
        tier: user.isGuest
          ? 'Guest'
          : user.premiumUntil && new Date(user.premiumUntil) > now
            ? user.plusSubscription?.periodType === 'trial'
              ? 'Plus (trial)'
              : 'Plus'
            : 'Free',
        onboarded: !!user.onboardingCompleted,
        flies: user.wardrobe?.flies ?? 0,
        streak: user.quests?.loginStreak?.count ?? 0,
        friends,
      },
      source: {
        channel,
        channelLabel: channelLabel(channel),
        path: pathFor(acquisition).map((segment) => segment.label),
        paid: !!acquisition?.paid,
        resolvedBy: acquisition?.resolvedBy ?? null,
        status: acquisition?.status ?? null,
        platform: acquisition?.platform ?? null,
        network: acquisition?.network ?? null,
        touch: acquisition?.touch ?? null,
        known: Object.keys(CHANNEL_LABELS).includes(channel),
      },
      totals: nameRows.map((row) => ({
        event: row._id,
        count: row.count,
        last: new Date(row.last).toISOString(),
      })),
      timeline: events.map((event) => ({
        at: new Date(event.occurredAt).toISOString(),
        event: event.name,
        category: event.category,
        platform: event.platform,
        beforeSignup: event.userId !== userId,
        properties: event.properties ?? {},
      })),
      truncated: total > EVENT_LIMIT,
      totalEvents: total,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
