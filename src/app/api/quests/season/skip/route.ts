import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';
import {
  accrueSeasonSteps,
  findRunningSeason,
  getUserQuestSeasonState,
  maxSeasonSteps,
  pruneQuestSeasonProgress,
  readSeasonPassConfig,
  seasonTierFromSteps,
  tasksCompletedToday,
} from '@/lib/quests/seasons';
import { recordFlySpend } from '@/lib/economy/ledger';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

/**
 * Buys the next tier outright. A tier is worth far less than the skip price in
 * flies, so this is a convenience for someone finishing on the last night — and
 * a clean fly sink — never an arbitrage.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const seasonId =
      typeof body?.seasonId === 'string' && body.seasonId.trim()
        ? body.seasonId.trim()
        : '';
    const timezone = body?.timezone || 'UTC';
    const count = Math.max(
      1,
      Math.min(10, Math.floor(Number(body?.count) || 1)),
    );
    if (!seasonId) {
      return NextResponse.json({ error: 'Missing season id' }, { status: 400 });
    }

    await connectMongo();
    const now = new Date();
    const [season, user] = await Promise.all([
      findRunningSeason(now),
      UserModel.findById(userId),
    ]);

    if (!season || season.seasonId !== seasonId) {
      return NextResponse.json(
        { error: 'This season is not running' },
        { status: 404 },
      );
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const config = readSeasonPassConfig(season);
    if (config.tierSkipCost <= 0) {
      return NextResponse.json(
        { error: 'Tier skip is turned off for this season' },
        { status: 400 },
      );
    }

    const today = getZonedToday(timezone);
    const questsState = pruneQuestSeasonProgress(user.quests, [season.seasonId]);
    const stored = getUserQuestSeasonState(
      { quests: questsState },
      season.seasonId,
      config.tierCount,
    );
    const { state } = accrueSeasonSteps({
      state: stored,
      config,
      tasksToday: tasksCompletedToday(user, today),
      todayKey: today,
      seasonRunning: true,
    });

    const ceiling = maxSeasonSteps(config);
    if (state.steps >= ceiling) {
      return NextResponse.json(
        { error: 'You are already at the final tier' },
        { status: 400 },
      );
    }

    const affordableTiers = Math.min(
      count,
      config.tierCount - seasonTierFromSteps(state.steps, config),
    );
    if (affordableTiers <= 0) {
      return NextResponse.json(
        { error: 'You are already at the final tier' },
        { status: 400 },
      );
    }

    const price = config.tierSkipCost * affordableTiers;
    const wardrobe = user.wardrobe;
    const balance = Math.max(0, Math.floor(Number(wardrobe?.flies) || 0));
    if (!wardrobe) {
      return NextResponse.json(
        { error: 'You need more flies' },
        { status: 400 },
      );
    }
    if (balance < price) {
      return NextResponse.json(
        { error: `You need ${price - balance} more flies`, price, balance },
        { status: 400 },
      );
    }

    // A bought tier is a whole tier's worth of steps, so the ladder stays one
    // counter and cannot drift from what the board shows.
    const nextSteps = Math.min(
      ceiling,
      state.steps + affordableTiers * config.stepsPerTier,
    );
    wardrobe.flies = balance - price;
    questsState.seasons[season.seasonId] = {
      ...state,
      steps: nextSteps,
      purchasedTiers: state.purchasedTiers + affordableTiers,
    };
    user.quests = questsState;
    user.markModified('quests');
    user.markModified('wardrobe');
    await user.save();

    const tier = seasonTierFromSteps(nextSteps, config);
    void recordFlySpend({
      userId,
      source: 'season',
      occurrenceKey: `season-skip:${season.seasonId}:${tier}`,
      dayKey: today,
      amount: price,
      balanceAfter: wardrobe.flies,
      meta: { seasonId: season.seasonId, tiers: affordableTiers },
    }).catch(() => {});

    await recordAnalyticsEvent({
      userId,
      name: 'season_tier_purchased',
      properties: {
        season_id: season.seasonId,
        season_tier: tier,
        tier_count: affordableTiers,
        fly_amount: price,
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      tier,
      tiersPurchased: affordableTiers,
      fliesSpent: price,
      flyBalance: wardrobe.flies,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Could not skip tier',
      },
      { status: 400 },
    );
  }
}
