import UserModel from '@/lib/models/User';
import LeapWeekModel, { type LeapWeekDoc } from '@/lib/models/LeapWeek';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { bumpQuestMetric } from '@/lib/quests/metrics';
import { buildRewardCatalog } from '@/lib/quests/engine';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import { emptyGrant, grantLeapRewards, mergeGrant } from './rewards';
import { payMark } from './marks';
import { clampLeague } from './state';
import type { LeapContext } from './sync';
import {
  groupHabits,
  hopKeyDate,
  hopKeyGroup,
  lastScheduledBefore,
  markTargets,
  marksMet,
} from './week';
import {
  type BonusRewards,
  type LeapConfigView,
  type LeapGrantSummary,
  type LeapHopResult,
  type LeapMarkId,
} from './types';

type DailyField = 'hopsPaidByDay' | 'luckyByDay' | 'comebacksByDay';

async function claimDailySlot(
  weekDocId: LeapWeekDoc['_id'],
  field: DailyField,
  dayKey: string,
  cap: number,
) {
  if (cap <= 0) return false;
  const path = `${field}.${dayKey}`;
  const res = await LeapWeekModel.updateOne(
    {
      _id: weekDocId,
      $or: [{ [path]: { $exists: false } }, { [path]: { $lt: cap } }],
    },
    { $inc: { [path]: 1 } },
  );
  return res.modifiedCount === 1;
}

function pickLuckyDrop(config: LeapConfigView): BonusRewards | null {
  const total = config.luckyDrops.reduce(
    (sum, drop) => sum + Math.max(0, drop.weight),
    0,
  );
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const drop of config.luckyDrops) {
    roll -= Math.max(0, drop.weight);
    if (roll < 0) return drop.rewards;
  }
  return config.luckyDrops[config.luckyDrops.length - 1]?.rewards ?? null;
}

export function meterFor(
  ctx: Pick<LeapContext, 'config' | 'ledger'>,
  reached: LeapMarkId[],
): LeapHopResult['meter'] {
  const targets = markTargets(
    ctx.config,
    ctx.ledger.scheduled,
    ctx.ledger.scheduledDays,
  );
  const leap = targets.find((mark) => mark.id === 'leap');
  const hold = targets.find((mark) => mark.id === 'hold');
  return {
    hops: ctx.ledger.hops,
    target: leap?.available ? leap.target : Math.max(ctx.ledger.scheduled, 1),
    holdTarget: hold?.available ? hold.target : 0,
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

  const multiplier = Math.max(1, weekDoc.multiplier ?? 1);
  const league = clampLeague(config, weekDoc.league ?? ctx.state.league);
  const total = emptyGrant();
  let hopCount = 0;
  let hopFlies = 0;
  let comebackFlies = 0;
  let lucky: (LeapGrantSummary & { first: boolean }) | null = null;
  let sinceDrop = ctx.state.luck.sinceDrop;
  const groups = fresh.length ? groupHabits(ctx.tasks) : [];

  for (const key of fresh) {
    const claimed = await LeapWeekModel.updateOne(
      { _id: weekDoc._id, hopKeys: { $ne: key } },
      { $addToSet: { hopKeys: key } },
    );
    if (claimed.modifiedCount === 0) continue;
    known.add(key);
    hopCount += 1;
    const date = hopKeyDate(key);

    if (
      config.hopFlies > 0 &&
      (await claimDailySlot(weekDoc._id, 'hopsPaidByDay', todayKey, config.hopsPaidPerDay))
    ) {
      const grant = await grantLeapRewards({
        userId,
        rewards: [{ type: 'FLIES', amount: config.hopFlies }],
        occurrenceKey: `leap:hop:${currentWeek}:${key}`,
        dayKey: todayKey,
        isPremium,
        flyMultiplier: multiplier,
        meta: { hop: key },
      });
      hopFlies += grant.fliesGranted;
      mergeGrant(total, grant);
    }

    if (config.comebackFlies > 0 && date === todayKey) {
      const group = groups.find((entry) => entry.key === hopKeyGroup(key));
      const before = group
        ? lastScheduledBefore(
            group.sibs,
            date,
            ctx.timezone,
            config.comebackLookbackDays,
          )
        : null;
      if (
        before &&
        !before.done &&
        (await claimDailySlot(weekDoc._id, 'comebacksByDay', todayKey, config.comebacksPerDay))
      ) {
        const grant = await grantLeapRewards({
          userId,
          rewards: [{ type: 'FLIES', amount: config.comebackFlies }],
          occurrenceKey: `leap:comeback:${todayKey}:${key}`,
          dayKey: todayKey,
          isPremium,
          flyMultiplier: multiplier,
          meta: { comeback: key },
        });
        comebackFlies += grant.fliesGranted;
        mergeGrant(total, grant);
        void recordAnalyticsEvent({
          userId,
          name: 'leap_comeback',
          properties: { fly_amount: grant.fliesGranted },
        }).catch(() => {});
      }
    }

    let drop: BonusRewards | null = null;
    let first = false;
    if (!ctx.state.luck.firstDone && config.firstHopRewards.length) {
      const flipped = await UserModel.updateOne(
        { _id: userId, 'quests.leap.luck.firstDone': { $ne: true } },
        { $set: { 'quests.leap.luck.firstDone': true } },
      );
      ctx.state.luck.firstDone = true;
      if (flipped.modifiedCount === 1) {
        drop = config.firstHopRewards;
        first = true;
      }
    } else {
      sinceDrop += 1;
      const pity = config.luckyPityHops > 0 && sinceDrop >= config.luckyPityHops;
      const rolled = Math.random() * 100 < config.luckyChancePercent;
      if (
        (pity || rolled) &&
        (await claimDailySlot(weekDoc._id, 'luckyByDay', todayKey, config.luckyDropsPerDay))
      ) {
        drop = pickLuckyDrop(config);
      }
    }
    if (drop && drop.length) {
      sinceDrop = 0;
      const grant = await grantLeapRewards({
        userId,
        rewards: drop,
        occurrenceKey: `leap:lucky:${currentWeek}:${key}`,
        dayKey: todayKey,
        isPremium,
        flyMultiplier: multiplier,
        meta: { lucky: key, first },
      });
      mergeGrant(total, grant);
      lucky = lucky
        ? { ...mergeGrant(lucky, grant), first: lucky.first || first }
        : { ...grant, first };
      void recordAnalyticsEvent({
        userId,
        name: 'leap_lucky_drop',
        properties: {
          first,
          fly_amount: grant.fliesGranted,
          items: grant.grantedItemIds.length,
          shields: grant.shieldsGranted,
        },
      }).catch(() => {});
    }
  }

  const reached = new Set<LeapMarkId>(weekDoc.marks ?? []);
  const marks: LeapHopResult['marks'] = [];
  const met = marksMet(
    markTargets(config, ledger.scheduled, ledger.scheduledDays),
    ledger.hops,
    ledger.activeDays,
  );
  for (const id of met) {
    if (reached.has(id)) continue;
    const paid = await payMark({
      userId,
      weekDocId: weekDoc._id,
      weekKey: currentWeek,
      id,
      config,
      league,
      multiplier,
      isPremium,
      dayKey: todayKey,
      hops: ledger.hops,
      scheduled: ledger.scheduled,
    });
    reached.add(id);
    if (paid) {
      marks.push(paid);
      mergeGrant(total, paid);
    }
  }

  if (hopCount === 0 && marks.length === 0) return null;

  await LeapWeekModel.updateOne(
    { _id: weekDoc._id },
    {
      $inc: { fliesGranted: total.fliesGranted },
      ...(total.grantedItemIds.length
        ? { $push: { grantedItemIds: { $each: total.grantedItemIds } } }
        : {}),
    },
  );
  weekDoc.hopKeys = Array.from(known);
  weekDoc.marks = Array.from(reached);
  weekDoc.fliesGranted = (weekDoc.fliesGranted ?? 0) + total.fliesGranted;
  weekDoc.grantedItemIds = [
    ...(weekDoc.grantedItemIds ?? []),
    ...total.grantedItemIds,
  ];

  const inc: Record<string, number> = {};
  if (hopCount > 0) inc['quests.leap.hopsTotal'] = hopCount;
  if (!isPremium && total.fliesGranted > 0) {
    inc['quests.leap.forgoneFlies'] = total.fliesGranted;
  }
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: { 'quests.leap.luck.sinceDrop': sinceDrop },
      ...(Object.keys(inc).length ? { $inc: inc } : {}),
    },
  );
  ctx.state.luck.sinceDrop = sinceDrop;
  ctx.state.hopsTotal += hopCount;
  if (!isPremium) ctx.state.forgoneFlies += total.fliesGranted;

  if (hopCount > 0) {
    await bumpQuestMetric({
      userId,
      metric: 'focus_tag_linked',
      amount: hopCount,
      timezone: ctx.timezone,
    }).catch(() => {});
  }

  const itemIds = Array.from(
    new Set([...total.grantedItemIds, ...total.grantedBackgroundIds]),
  );
  const catalog = itemIds.length
    ? buildRewardCatalog(await getFullCatalog(), [
        itemIds.map((itemId) => ({ type: 'ITEM' as const, itemId })),
      ])
    : {};

  const balance =
    total.fliesGranted > 0
      ? await UserModel.findById(userId).select('wardrobe.flies').lean<any>()
      : null;

  const reachedList = Array.from(reached);
  return {
    balanceAfter:
      typeof balance?.wardrobe?.flies === 'number'
        ? balance.wardrobe.flies
        : undefined,
    hops: hopCount,
    hopFlies,
    comebackFlies,
    lucky,
    marks,
    fliesGranted: total.fliesGranted,
    grantedItemIds: total.grantedItemIds,
    grantedBackgroundIds: total.grantedBackgroundIds,
    shieldsGranted: total.shieldsGranted,
    meter: meterFor(ctx, reachedList),
    league: ctx.state.league,
    leagueLabel: config.leagues[clampLeague(config, ctx.state.league)]?.label ?? 'Lily',
    nextLeagueLabel: config.leagues[ctx.state.league + 1]?.label ?? null,
    isPremium,
    catalog,
  };
}
