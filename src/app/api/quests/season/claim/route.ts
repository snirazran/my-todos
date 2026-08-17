import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';
import {
  accrueSeasonSteps,
  findClaimableSeason,
  findRunningSeason,
  getUserQuestSeasonState,
  grantRewardsToUser,
  pruneQuestSeasonProgress,
  readSeasonPassConfig,
  readSeasonTierRewards,
  seasonTierFromSteps,
  tasksCompletedToday,
  unclaimedSeasonTiers,
} from '@/lib/quests/seasons';
import {
  grantShields,
  loadShieldConfig,
  readShieldState,
  setShieldStateOn,
} from '@/lib/shields/engine';
import { recordDoubleableClaim } from '@/lib/rewards/adDouble';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import type { QuestRewards, SeasonLane } from '@/lib/quests/types';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const body = await req.json().catch(() => ({}));
    const seasonId =
      typeof body?.seasonId === 'string' && body.seasonId.trim()
        ? body.seasonId.trim()
        : '';
    const timezone = body?.timezone || 'UTC';
    const requestedTier = Number.isFinite(Number(body?.tier))
      ? Math.floor(Number(body.tier))
      : null;
    const requestedLane: SeasonLane | null =
      body?.lane === 'free' || body?.lane === 'plus' ? body.lane : null;

    if (!seasonId) {
      return NextResponse.json({ error: 'Missing season id' }, { status: 400 });
    }

    await connectMongo();
    const now = new Date();
    const [season, user, runningSeason] = await Promise.all([
      findClaimableSeason(seasonId, now),
      UserModel.findById(userId),
      findRunningSeason(now),
    ]);

    if (!season) {
      return NextResponse.json(
        { error: 'This season is no longer available' },
        { status: 404 },
      );
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const today = getZonedToday(timezone);
    const config = readSeasonPassConfig(season);
    const rewardsByTier = readSeasonTierRewards(season);
    const questsState = pruneQuestSeasonProgress(user.quests, [
      season.seasonId,
      runningSeason?.seasonId,
    ]);

    const stored = getUserQuestSeasonState(
      { quests: questsState },
      season.seasonId,
      config.tierCount,
    );
    // Fold in anything earned since the last read so a claim never races the
    // board into showing a tier the server has not banked yet.
    const stillClimbing =
      season.endsAt.getTime() > now.getTime() || config.graceMode === 'climb';
    const { state } = accrueSeasonSteps({
      state: stored,
      config,
      tasksToday: tasksCompletedToday(user, today),
      todayKey: today,
      seasonRunning: stillClimbing,
    });

    const isPremium = new Date(user.premiumUntil ?? 0).getTime() > Date.now();
    const tier = seasonTierFromSteps(state.steps, config);

    const pendingFree = unclaimedSeasonTiers(
      tier,
      state.claimedFreeTiers,
      rewardsByTier,
      'free',
    );
    const pendingPlus = isPremium
      ? unclaimedSeasonTiers(
          tier,
          state.claimedPlusTiers,
          rewardsByTier,
          'plus',
        )
      : [];

    // No tier/lane means "collect everything waiting" — the strip and the
    // banner both claim that way; the board claims one card at a time.
    const takeFree =
      requestedTier === null
        ? pendingFree
        : requestedLane === 'plus'
          ? []
          : pendingFree.filter((entry) => entry === requestedTier);
    const takePlus =
      requestedTier === null
        ? pendingPlus
        : requestedLane === 'free'
          ? []
          : pendingPlus.filter((entry) => entry === requestedTier);

    if (takeFree.length === 0 && takePlus.length === 0) {
      const reason =
        requestedTier !== null && requestedTier > tier
          ? 'That tier is still locked'
          : requestedLane === 'plus' && !isPremium
            ? 'Plus rewards need Frog Plus'
            : 'Nothing left to claim here';
      return NextResponse.json({ error: reason }, { status: 400 });
    }

    const rewards: QuestRewards = [];
    const rewardByTier = new Map(rewardsByTier.map((e) => [e.tier, e]));
    for (const entry of takeFree) {
      rewards.push(...(rewardByTier.get(entry)?.freeRewards ?? []));
    }
    for (const entry of takePlus) {
      rewards.push(...(rewardByTier.get(entry)?.premiumRewards ?? []));
    }

    const rewardSummary = grantRewardsToUser(user, rewards);

    let shieldsGranted = 0;
    let nextShieldState: ReturnType<typeof readShieldState> | null = null;
    if (rewardSummary.shieldsRequested > 0) {
      const shieldConfig = await loadShieldConfig();
      const before = readShieldState(user);
      nextShieldState = grantShields(
        before,
        shieldConfig,
        isPremium,
        rewardSummary.shieldsRequested,
      );
      shieldsGranted = Math.max(0, nextShieldState.count - before.count);
    }

    questsState.seasons[season.seasonId] = {
      ...state,
      claimedFreeTiers: [...state.claimedFreeTiers, ...takeFree].sort(
        (a, b) => a - b,
      ),
      claimedPlusTiers: [...state.claimedPlusTiers, ...takePlus].sort(
        (a, b) => a - b,
      ),
    };
    user.quests = questsState;
    if (nextShieldState) setShieldStateOn(user, nextShieldState);

    const claimedTiers = Array.from(
      new Set([...takeFree, ...takePlus]),
    ).sort((a, b) => a - b);
    const summary = { ...rewardSummary, shieldsGranted };
    recordDoubleableClaim(user, summary as any);

    user.markModified('quests');
    user.markModified('wardrobe');
    await user.save();

    await recordAnalyticsEvent({
      userId,
      name: 'season_reward_claimed',
      properties: {
        season_id: season.seasonId,
        season_tier: claimedTiers[claimedTiers.length - 1],
        season_tiers_claimed: claimedTiers.length,
        free_lanes_claimed: takeFree.length,
        plus_lanes_claimed: takePlus.length,
        fly_amount: rewardSummary.fliesGranted,
        reward_amount: rewardSummary.fliesGranted,
        item_count: rewardSummary.grantedItemIds.length,
        reward_count: rewardSummary.grantedItemIds.length,
        reward_type:
          rewardSummary.grantedItemIds.length > 0 &&
          rewardSummary.fliesGranted > 0
            ? 'mixed'
            : rewardSummary.grantedItemIds.length > 0
              ? 'item'
              : 'flies',
        premium_reward_included: takePlus.length > 0,
        is_premium: isPremium,
        in_grace_window: season.endsAt.getTime() <= now.getTime(),
      },
    });
    if (rewardSummary.fliesGranted > 0) {
      await recordAnalyticsEvent({
        userId,
        name: 'fly_earned',
        properties: {
          source: 'season',
          fly_amount: rewardSummary.fliesGranted,
          is_premium: isPremium,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      rewardSummary: summary,
      claimedTiers,
      claimedFreeTiers: takeFree,
      claimedPlusTiers: takePlus,
    });
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
