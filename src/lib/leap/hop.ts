import UserModel from '@/lib/models/User';
import LeapWeekModel from '@/lib/models/LeapWeek';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { bumpQuestMetric } from '@/lib/quests/metrics';
import { buildRewardCatalog } from '@/lib/quests/engine';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import { grantLeapRewards } from './rewards';
import { recordMark } from './marks';
import { clampLeague } from './state';
import type { LeapContext } from './sync';
import {
  hopKeyDate,
  lineGoal,
  markTargets,
  marksMet,
  targetBasis,
} from './week';
import type {
  LeapGrantSummary,
  LeapHopResult,
  LeapMarkId,
} from './types';

export function weekTargets(
  ctx: Pick<LeapContext, 'config' | 'ledger' | 'weekDoc' | 'state'>,
) {
  return markTargets(
    ctx.config,
    targetBasis(ctx.ledger.scheduled, ctx.weekDoc.scheduledCap),
    ctx.ledger.scheduledDays,
    clampLeague(ctx.config, ctx.weekDoc.league ?? ctx.state.league),
  );
}

export function meterFor(
  ctx: Pick<LeapContext, 'config' | 'ledger' | 'weekDoc' | 'state'>,
  reached: LeapMarkId[],
): LeapHopResult['meter'] {
  const targets = weekTargets(ctx);
  const leap = targets.find((mark) => mark.id === 'leap');
  const hold = targets.find((mark) => mark.id === 'hold');
  const { hops, activeDays } = ctx.ledger;
  const goal = (mark: typeof leap, id: LeapMarkId) =>
    !mark || !mark.available
      ? 0
      : reached.includes(id)
        ? mark.target
        : lineGoal(mark, hops, activeDays);
  return {
    hops,
    target: goal(leap, 'leap'),
    holdTarget: goal(hold, 'hold'),
    reached,
  };
}

export async function creditHops(
  ctx: LeapContext,
): Promise<LeapHopResult | null> {
  const { userId, config, isPremium, todayKey, currentWeek, weekDoc, ledger } =
    ctx;
  const known = new Set(weekDoc.hopKeys ?? []);
  const fresh = ledger.doneKeys
    .filter((key) => !known.has(key))
    .sort((a, b) => hopKeyDate(a).localeCompare(hopKeyDate(b)));

  const league = clampLeague(config, weekDoc.league ?? ctx.state.league);
  let hopCount = 0;
  let firstGift: LeapGrantSummary | null = null;

  for (const key of fresh) {
    const claimed = await LeapWeekModel.updateOne(
      { _id: weekDoc._id, hopKeys: { $ne: key } },
      { $addToSet: { hopKeys: key } },
    );
    if (claimed.modifiedCount === 0) continue;
    known.add(key);
    hopCount += 1;

    if (!ctx.state.firstGiftDone && config.firstHopRewards.length) {
      const flipped = await UserModel.updateOne(
        { _id: userId, 'quests.leap.luck.firstDone': { $ne: true } },
        { $set: { 'quests.leap.luck.firstDone': true } },
      );
      ctx.state.firstGiftDone = true;
      if (flipped.modifiedCount === 1) {
        firstGift = await grantLeapRewards({
          userId,
          rewards: config.firstHopRewards,
          occurrenceKey: `leap:first:${userId}`,
          dayKey: todayKey,
          isPremium,
          meta: { first: true },
        });
        void recordAnalyticsEvent({
          userId,
          name: 'leap_first_gift',
          properties: {
            fly_amount: firstGift.fliesGranted,
            items: firstGift.grantedItemIds.length,
          },
        }).catch(() => {});
      }
    }
  }

  if (hopCount > 0 && typeof weekDoc.scheduledCap !== 'number' && ledger.scheduled > 0) {
    await LeapWeekModel.updateOne(
      { _id: weekDoc._id, scheduledCap: { $exists: false } },
      { $set: { scheduledCap: ledger.scheduled } },
    );
    weekDoc.scheduledCap = ledger.scheduled;
  }

  const reached = new Set<LeapMarkId>(weekDoc.marks ?? []);
  const newMarks: LeapMarkId[] = [];
  const met = marksMet(weekTargets(ctx), ledger.hops, ledger.activeDays);
  for (const id of met) {
    if (reached.has(id)) continue;
    const recorded = await recordMark({
      userId,
      weekDocId: weekDoc._id,
      weekKey: currentWeek,
      id,
      league,
      hops: ledger.hops,
      scheduled: ledger.scheduled,
    });
    reached.add(id);
    if (recorded) {
      newMarks.push(id);
      if (id === 'leap') weekDoc.landedAt = new Date();
    }
  }

  if (hopCount === 0 && newMarks.length === 0) return null;

  weekDoc.hopKeys = Array.from(known);
  weekDoc.marks = Array.from(reached);

  const firstItems = firstGift?.grantedItemIds ?? [];
  if (firstGift && (firstGift.fliesGranted > 0 || firstItems.length)) {
    await LeapWeekModel.updateOne(
      { _id: weekDoc._id },
      {
        $inc: { fliesGranted: firstGift.fliesGranted },
        ...(firstItems.length
          ? { $push: { grantedItemIds: { $each: firstItems } } }
          : {}),
      },
    );
  }

  const joined = ctx.state.hopsTotal === 0 && hopCount > 0;
  const join = joined
    ? {
        weekKey: currentWeek,
        giftIds: firstItems.filter((id) => id.startsWith('gift_box')),
      }
    : null;
  if (hopCount > 0 || join) {
    await UserModel.updateOne(
      { _id: userId },
      {
        ...(join ? { $set: { 'quests.leap.pendingJoin': join } } : {}),
        ...(hopCount > 0 ? { $inc: { 'quests.leap.hopsTotal': hopCount } } : {}),
      },
    );
  }
  ctx.state.hopsTotal += hopCount;
  if (join) ctx.state.pendingJoin = join;

  if (hopCount > 0) {
    await bumpQuestMetric({
      userId,
      metric: 'focus_tag_linked',
      amount: hopCount,
      timezone: ctx.timezone,
    }).catch(() => {});
  }

  const catalog = firstItems.length
    ? buildRewardCatalog(await getFullCatalog(), [
        firstItems.map((itemId) => ({ type: 'ITEM' as const, itemId })),
      ])
    : {};

  return {
    hops: hopCount,
    landed: newMarks.includes('leap'),
    marks: newMarks,
    firstGift,
    grantedItemIds: firstItems,
    meter: meterFor(ctx, Array.from(reached)),
    league: ctx.state.league,
    leagueLabel: config.leagues[clampLeague(config, ctx.state.league)]?.label ?? 'Lily',
    nextLeagueLabel: config.leagues[ctx.state.league + 1]?.label ?? null,
    weekKey: currentWeek,
    joined,
    isPremium,
    catalog,
  };
}
