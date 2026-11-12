import LeapWeekModel, { type LeapWeekDoc } from '@/lib/models/LeapWeek';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { emptyGrant, grantLeapRewards, mergeGrant } from './rewards';
import { clampLeague } from './state';
import type {
  LeapChestView,
  LeapClaimResult,
  LeapConfigView,
} from './types';

export function chestLeague(
  config: LeapConfigView,
  weekDoc: Pick<LeapWeekDoc, 'league'>,
  fallbackLeague: number,
) {
  return clampLeague(config, weekDoc.league ?? fallbackLeague);
}

export function chestView(args: {
  config: LeapConfigView;
  weekDoc: Pick<
    LeapWeekDoc,
    'league' | 'marks' | 'landedAt' | 'chestClaimedAt' | 'plusChestClaimedAt'
  >;
  fallbackLeague: number;
}): LeapChestView {
  const { config, weekDoc } = args;
  const league = chestLeague(config, weekDoc, args.fallbackLeague);
  const entry = config.leagues[league];
  const landed = (weekDoc.marks ?? []).includes('leap');
  const legacy = landed && !weekDoc.landedAt;
  return {
    league,
    rewards: entry?.weekRewards ?? [],
    plusRewards: entry?.plusWeekRewards ?? [],
    landed,
    claimed: legacy || !!weekDoc.chestClaimedAt,
    plusClaimed: legacy || !!weekDoc.plusChestClaimedAt,
  };
}

export async function claimLeapChest(args: {
  userId: string;
  config: LeapConfigView;
  weekDoc: LeapWeekDoc;
  fallbackLeague: number;
  isPremium: boolean;
  dayKey: string;
  auto?: boolean;
}): Promise<LeapClaimResult> {
  const { userId, config, weekDoc, isPremium, dayKey } = args;
  const result: LeapClaimResult = { ...emptyGrant(), free: false, plus: false };
  if (!weekDoc._id || !weekDoc.landedAt) return result;
  const league = chestLeague(config, weekDoc, args.fallbackLeague);
  const entry = config.leagues[league];
  if (!entry) return result;
  const now = new Date();

  if (!weekDoc.chestClaimedAt) {
    const taken = await LeapWeekModel.updateOne(
      { _id: weekDoc._id, landedAt: { $ne: null }, chestClaimedAt: null },
      { $set: { chestClaimedAt: now } },
    );
    if (taken.modifiedCount === 1) {
      weekDoc.chestClaimedAt = now;
      result.free = true;
      mergeGrant(
        result,
        await grantLeapRewards({
          userId,
          rewards: entry.weekRewards,
          occurrenceKey: `leap:chest:${weekDoc.weekKey}`,
          dayKey,
          isPremium,
          meta: { chest: true, weekKey: weekDoc.weekKey, league: entry.label },
        }),
      );
    }
  }

  if (isPremium && !weekDoc.plusChestClaimedAt) {
    const taken = await LeapWeekModel.updateOne(
      { _id: weekDoc._id, landedAt: { $ne: null }, plusChestClaimedAt: null },
      { $set: { plusChestClaimedAt: now } },
    );
    if (taken.modifiedCount === 1) {
      weekDoc.plusChestClaimedAt = now;
      result.plus = true;
      mergeGrant(
        result,
        await grantLeapRewards({
          userId,
          rewards: entry.plusWeekRewards,
          occurrenceKey: `leap:chestplus:${weekDoc.weekKey}`,
          dayKey,
          isPremium,
          meta: {
            chest: true,
            plus: true,
            weekKey: weekDoc.weekKey,
            league: entry.label,
          },
          plusOnly: true,
        }),
      );
    }
  }

  if (!result.free && !result.plus) return result;

  await LeapWeekModel.updateOne(
    { _id: weekDoc._id },
    {
      $inc: { fliesGranted: result.fliesGranted },
      ...(result.grantedItemIds.length
        ? { $push: { grantedItemIds: { $each: result.grantedItemIds } } }
        : {}),
    },
  );
  weekDoc.fliesGranted = (weekDoc.fliesGranted ?? 0) + result.fliesGranted;
  weekDoc.grantedItemIds = [
    ...(weekDoc.grantedItemIds ?? []),
    ...result.grantedItemIds,
  ];

  void recordAnalyticsEvent({
    userId,
    name: 'leap_chest_claimed',
    properties: {
      week_key: weekDoc.weekKey,
      league,
      fly_amount: result.fliesGranted,
      items: result.grantedItemIds.length,
      plus: result.plus,
      auto: !!args.auto,
      is_premium: isPremium,
    },
  }).catch(() => {});

  if (result.fliesGranted > 0) {
    const balance = await UserModel.findById(userId)
      .select('wardrobe.flies')
      .lean<any>();
    if (typeof balance?.wardrobe?.flies === 'number') {
      result.balanceAfter = balance.wardrobe.flies;
    }
  }
  return result;
}
