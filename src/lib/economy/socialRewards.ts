import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { economyWeekKey } from './guards';
import { loadFlyEconomyConfig } from './config';
import { countPaidOccurrencesInRange } from './ledger';
import { shiftYMD } from '@/lib/weekStart';

export type DuoWeekAward = {
  userId: string;
  bondId: string;
  weekKey: string;
  giftItemId: string;
};

type DuoWeekState = {
  weekKey?: string;
  count?: number;
  bondIds?: string[];
};

/**
 * Duo Week: enough shared completions with the SAME buddy inside one week earns
 * both sides a gift. Capped per user per week as well as per pair, so running
 * several bonds at once doesn't multiply it — the reward is for keeping one
 * partnership alive, not for collecting partners.
 */
export async function creditDuoWeek(args: {
  userId: string;
  bondId: string;
  dayKey: string;
}): Promise<DuoWeekAward | null> {
  const config = await loadFlyEconomyConfig();
  const required = Math.max(0, config.buddy.duoWeekTasks);
  const giftItemId = config.buddy.duoWeekGiftItemId;
  if (!required || !giftItemId || config.buddy.duoWeekPerWeek <= 0) return null;

  const weekKey = economyWeekKey(args.dayKey);
  const weekEnd = shiftYMD(weekKey, 6);

  await connectMongo();
  const user = await UserModel.findById(args.userId)
    .select('duoWeekGift')
    .lean<{ duoWeekGift?: DuoWeekState } | null>();
  if (!user) return null;

  const state = user.duoWeekGift ?? {};
  const sameWeek = state.weekKey === weekKey;
  const given = sameWeek ? state.count ?? 0 : 0;
  const bondIds = sameWeek ? state.bondIds ?? [] : [];
  if (given >= config.buddy.duoWeekPerWeek) return null;
  if (bondIds.includes(args.bondId)) return null;

  const payouts = await countPaidOccurrencesInRange(
    args.userId,
    weekKey,
    weekEnd,
    'buddy',
    { bondId: args.bondId },
  );
  if (payouts < required) return null;

  // The guard is written with the same filter it was read under, so two
  // completions landing together can only ever mint one gift.
  const applied = await UserModel.updateOne(
    {
      _id: args.userId,
      $or: [
        { 'duoWeekGift.weekKey': { $ne: weekKey } },
        { 'duoWeekGift.bondIds': { $nin: [args.bondId] } },
      ],
    },
    {
      $set: {
        duoWeekGift: {
          weekKey,
          count: given + 1,
          bondIds: [...bondIds, args.bondId],
        },
      },
      $inc: { [`wardrobe.inventory.${giftItemId}`]: 1 },
      $addToSet: { 'wardrobe.unseenItems': giftItemId },
    },
  );
  if (applied.modifiedCount === 0) return null;

  void recordAnalyticsEvent({
    userId: args.userId,
    name: 'buddy_duo_week',
    properties: { gift_item_id: giftItemId, day_key: args.dayKey },
  }).catch(() => {});

  return { userId: args.userId, bondId: args.bondId, weekKey, giftItemId };
}
