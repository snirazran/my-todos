import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import QuestSeasonModel from '@/lib/models/QuestSeason';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';
import {
  getCurrentUserSeasonDay,
  getUserQuestSeasonState,
  getSeasonDayCount,
  grantRewardsToUser,
  normalizeSeasonDayRewards,
  pruneQuestSeasonProgress,
} from '@/lib/quests/seasons';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const seasonId =
      typeof body?.seasonId === 'string' && body.seasonId.trim()
        ? body.seasonId.trim()
        : '';
    const timezone = body?.timezone || 'UTC';
    if (!seasonId) {
      return NextResponse.json({ error: 'Missing season id' }, { status: 400 });
    }

    await connectMongo();
    const now = new Date();
    const [season, user] = await Promise.all([
      QuestSeasonModel.findOne({
        seasonId,
        isActive: true,
        startsAt: { $lte: now },
        endsAt: { $gt: now },
      }),
      UserModel.findById(userId),
    ]);

    if (!season) {
      return NextResponse.json({ error: 'Season not found' }, { status: 404 });
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const today = getZonedToday(timezone);
    const progressFlies =
      user.wardrobe?.flyDaily?.date === today
        ? user.wardrobe.flyDaily.earned ?? 0
        : 0;
    if (progressFlies < season.dailyTargetFlies) {
      return NextResponse.json(
        { error: 'Season goal is not complete yet' },
        { status: 400 },
      );
    }

    const questsState = pruneQuestSeasonProgress(user.quests, season.seasonId);
    const seasonState = getUserQuestSeasonState(
      { quests: questsState },
      season.seasonId,
    );
    const claimedDays = seasonState.claimedDays;
    if (seasonState.lastClaimedYmd === today) {
      return NextResponse.json(
        { error: 'Season reward already claimed today' },
        { status: 400 },
      );
    }
    const dayCount = getSeasonDayCount(season.startsAt, season.endsAt);
    const day = getCurrentUserSeasonDay(dayCount, claimedDays);
    const completedSeasonDays = new Set(
      claimedDays
        .filter((claimedDay: unknown): claimedDay is number => typeof claimedDay === 'number')
        .map((claimedDay: number) => Math.floor(claimedDay))
        .filter((claimedDay: number) => claimedDay >= 1 && claimedDay <= dayCount),
    );
    if (completedSeasonDays.size >= dayCount) {
      return NextResponse.json(
        { error: 'Season is already complete' },
        { status: 400 },
      );
    }
    if (claimedDays.includes(day)) {
      return NextResponse.json(
        { error: 'Season reward already claimed' },
        { status: 400 },
      );
    }

    const dayReward = normalizeSeasonDayRewards(season.dayRewards).find(
      (entry) => entry.day === day,
    );
    const premiumUntil = user.premiumUntil
      ? new Date(user.premiumUntil).getTime()
      : 0;
    const isPremium = premiumUntil > Date.now();
    const rewards = [
      ...(dayReward?.freeRewards ?? []),
      ...(isPremium ? (dayReward?.premiumRewards ?? []) : []),
    ];
    if (rewards.length === 0) {
      return NextResponse.json(
        { error: 'No reward configured for today' },
        { status: 400 },
      );
    }

    const rewardSummary = grantRewardsToUser(user, rewards);
    questsState.seasons[season.seasonId] = {
      ...seasonState,
      claimedDays: [...claimedDays, day],
      lastClaimedYmd: today,
    };
    user.quests = questsState;
    user.markModified('quests');
    user.markModified('wardrobe');
    await user.save();

    return NextResponse.json({ ok: true, rewardSummary, claimedDay: day });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not claim season reward',
      },
      { status: 400 },
    );
  }
}
