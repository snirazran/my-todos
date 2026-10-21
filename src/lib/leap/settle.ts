import UserModel from '@/lib/models/User';
import LeapWeekModel, { type LeapWeekDoc } from '@/lib/models/LeapWeek';
import type { TaskDoc } from '@/lib/models/Task';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import {
  canRescue,
  consumeShield,
  loadShieldConfig,
  persistShieldState,
  readShieldState,
} from '@/lib/shields/engine';
import { shiftYMD, type WeekStartDay } from '@/lib/weekStart';
import { emptyGrant, grantLeapRewards, mergeGrant } from './rewards';
import { payMark } from './marks';
import { clampLeague, leagueMultiplier, readLeapState, type LeapState } from './state';
import {
  markTargets,
  marksMet,
  readLeapWeek,
  targetBasis,
  weekKeyFor,
} from './week';
import type {
  LeapConfigView,
  LeapGrantSummary,
  LeapMarkId,
  LeapWeekOutcome,
  LeapWeekResult,
} from './types';

const MAX_WEEKS_PER_SETTLE = 26;
const PLAYED_OUTCOMES: LeapWeekOutcome[] = ['up', 'top', 'stay', 'covered', 'down'];

async function payReach(args: {
  userId: string;
  config: LeapConfigView;
  state: LeapState;
  isPremium: boolean;
  dayKey: string;
  grant: LeapGrantSummary;
}) {
  const { userId, config, state, isPremium, dayKey, grant } = args;
  for (let index = state.bestLeague + 1; index <= state.league; index += 1) {
    const league = config.leagues[index];
    if (!league) continue;
    mergeGrant(
      grant,
      await grantLeapRewards({
        userId,
        rewards: league.reachRewards,
        occurrenceKey: `leap:reach:${index}`,
        dayKey,
        isPremium: false,
        flyMultiplier: 1,
        meta: { league: league.label },
      }),
    );
    if (isPremium && state.plusPaidThrough === index - 1) {
      mergeGrant(
        grant,
        await grantLeapRewards({
          userId,
          rewards: league.plusReachRewards,
          occurrenceKey: `leap:reachplus:${index}`,
          dayKey,
          isPremium: false,
          flyMultiplier: 1,
          meta: { league: league.label, plus: true },
          plusOnly: true,
        }),
      );
      state.plusPaidThrough = index;
    }
    state.bestLeague = index;
    void recordAnalyticsEvent({
      userId,
      name: 'leap_lily_reached',
      properties: { lily: league.label, league: index, is_premium: isPremium },
    }).catch(() => {});
  }
}

export async function payPlusBacklog(args: {
  userId: string;
  config: LeapConfigView;
  state: LeapState;
  dayKey: string;
}): Promise<LeapGrantSummary | null> {
  const { userId, config, state, dayKey } = args;
  if (state.plusPaidThrough >= state.bestLeague) return null;
  const claimed = await UserModel.updateOne(
    { _id: userId, 'quests.leap.plusPaidThrough': state.plusPaidThrough },
    { $set: { 'quests.leap.plusPaidThrough': state.bestLeague } },
  );
  if (claimed.modifiedCount === 0) return null;
  const grant = emptyGrant();
  for (let index = state.plusPaidThrough + 1; index <= state.bestLeague; index += 1) {
    const league = config.leagues[index];
    if (!league) continue;
    mergeGrant(
      grant,
      await grantLeapRewards({
        userId,
        rewards: league.plusReachRewards,
        occurrenceKey: `leap:reachplus:${index}`,
        dayKey,
        isPremium: false,
        flyMultiplier: 1,
        meta: { league: league.label, plus: true, backlog: true },
        plusOnly: true,
      }),
    );
  }
  state.plusPaidThrough = state.bestLeague;
  return grant;
}

export async function settleLeapWeeks(args: {
  userId: string;
  config: LeapConfigView;
  state: LeapState;
  tasks: TaskDoc[];
  todayKey: string;
  currentWeek: string;
  weekStartsOn: WeekStartDay;
  timezone: string;
  isPremium: boolean;
}): Promise<LeapState> {
  const { userId, config, tasks, currentWeek, weekStartsOn, timezone, isPremium } =
    args;
  const original = args.state;
  const lastWeek = shiftYMD(currentWeek, -7);
  if (!original.settledThrough) return original;
  const anchor = weekKeyFor(original.settledThrough, weekStartsOn);
  if (anchor >= lastWeek) return original;

  let first = shiftYMD(anchor, 7);
  const span = Math.round(
    (Date.parse(`${lastWeek}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) /
      (7 * 86_400_000),
  );
  if (span >= MAX_WEEKS_PER_SETTLE) {
    first = shiftYMD(lastWeek, -7 * (MAX_WEEKS_PER_SETTLE - 1));
  }

  const claim = await UserModel.updateOne(
    { _id: userId, 'quests.leap.settledThrough': original.settledThrough },
    { $set: { 'quests.leap.settledThrough': lastWeek } },
  );
  if (claim.modifiedCount === 0) {
    const fresh = await UserModel.findById(userId).select('quests').lean();
    return readLeapState(fresh) ?? original;
  }

  const state: LeapState = { ...original, settledThrough: lastWeek };
  const top = Math.max(0, config.leagues.length - 1);
  const shieldConfig = await loadShieldConfig();
  const readShields = async () =>
    readShieldState(await UserModel.findById(userId).select('quests').lean());
  const tryCover = async (settleDay: string) => {
    const shields = await readShields();
    if (!canRescue(shields, shieldConfig, 'pact', settleDay)) return false;
    await persistShieldState(userId, consumeShield(shields, 'pact', settleDay));
    return true;
  };
  let result: LeapWeekResult | null = null;
  let weeksSettled = 0;
  const weekDocs = await LeapWeekModel.find({
    userId,
    weekKey: { $gte: first, $lte: lastWeek },
  }).lean<LeapWeekDoc[]>();
  const docByWeek = new Map(weekDocs.map((doc) => [doc.weekKey, doc]));
  let played = await LeapWeekModel.countDocuments({
    userId,
    weekKey: { $lt: first },
    outcome: { $in: PLAYED_OUTCOMES },
  });

  for (let week = first; week <= lastWeek; week = shiftYMD(week, 7)) {
    const settleDay = shiftYMD(week, 7);
    const existing = docByWeek.get(week) ?? null;
    const ledger = readLeapWeek({
      tasks,
      weekKey: week,
      weekStartsOn,
      todayKey: settleDay,
      timezone,
      bankedKeys: existing?.hopKeys ?? [],
    });
    if (ledger.scheduled === 0 && !existing && state.league === 0) continue;

    const multiplier = existing?.multiplier ?? leagueMultiplier(config, state.league);
    const weekDoc =
      existing ??
      (await LeapWeekModel.findOneAndUpdate(
        { userId, weekKey: week },
        { $setOnInsert: { multiplier, league: state.league } },
        { upsert: true, new: true },
      ).lean<LeapWeekDoc>());

    const grant = emptyGrant();
    const targets = markTargets(
      config,
      targetBasis(ledger.scheduled, weekDoc?.scheduledCap),
      ledger.scheduledDays,
      clampLeague(config, weekDoc?.league ?? state.league),
    );
    const met = marksMet(targets, ledger.hops, ledger.activeDays);
    const noStayLine = !targets.find((mark) => mark.id === 'hold')?.available;
    const paidMarks = new Set<LeapMarkId>(weekDoc?.marks ?? []);
    for (const id of met) {
      if (paidMarks.has(id) || !weekDoc?._id) continue;
      const paid = await payMark({
        userId,
        weekDocId: weekDoc._id,
        weekKey: week,
        id,
        config,
        league: weekDoc.league ?? state.league,
        multiplier,
        isPremium,
        dayKey: args.todayKey,
        hops: ledger.hops,
        scheduled: ledger.scheduled,
      });
      if (paid) mergeGrant(grant, paid);
    }
    const reached = new Set<LeapMarkId>([...Array.from(paidMarks), ...met]);
    const leagueBefore = state.league;
    const bestBefore = state.bestLeague;

    let outcome: LeapWeekOutcome;
    if (reached.has('leap')) {
      state.landed += 1;
      if (state.league < top) {
        state.league += 1;
        outcome = 'up';
      } else {
        outcome = 'top';
      }
    } else if (reached.has('hold')) {
      outcome = 'stay';
    } else if (state.league === 0 || noStayLine) {
      outcome = ledger.hops > 0 ? 'stay' : 'quiet';
    } else if (
      state.coveredWeek !== shiftYMD(week, -7) &&
      (await tryCover(settleDay))
    ) {
      state.coveredWeek = week;
      outcome = 'covered';
    } else {
      state.league -= 1;
      outcome = 'down';
    }

    if (state.league > state.bestLeague) {
      await payReach({
        userId,
        config,
        state,
        isPremium,
        dayKey: args.todayKey,
        grant,
      });
    }

    if (weekDoc?._id) {
      await LeapWeekModel.updateOne(
        { _id: weekDoc._id },
        {
          $set: {
            scheduled: ledger.scheduled,
            hops: ledger.hops,
            activeDays: ledger.activeDays,
            outcome,
            leagueAfter: state.league,
            settledAt: new Date(),
          },
          $inc: { fliesGranted: grant.fliesGranted },
          ...(grant.grantedItemIds.length
            ? { $push: { grantedItemIds: { $each: grant.grantedItemIds } } }
            : {}),
        },
      );
    }

    if (ledger.scheduled > 0) {
      void recordAnalyticsEvent({
        userId,
        name: 'leap_week_settled',
        properties: {
          outcome,
          hops: ledger.hops,
          scheduled: ledger.scheduled,
          league_before: leagueBefore,
          league_after: state.league,
          is_premium: isPremium,
        },
      }).catch(() => {});
    }

    weeksSettled += 1;
    if (outcome === 'quiet') continue;
    const firstWeek = played === 0;
    played += 1;
    result = {
      weekKey: week,
      outcome,
      hops: ledger.hops,
      scheduled: ledger.scheduled,
      leagueBefore,
      leagueAfter: state.league,
      newBest: state.bestLeague > bestBefore,
      fliesGranted: (weekDoc?.fliesGranted ?? 0) + grant.fliesGranted,
      grantedItemIds: [...(weekDoc?.grantedItemIds ?? []), ...grant.grantedItemIds],
      shieldsLeft: 0,
      weeksSettled,
      firstWeek,
    };
  }

  if (result) {
    result.weeksSettled = weeksSettled;
    result.shieldsLeft = (await readShields()).count;
    state.pendingResult = result;
  }

  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        'quests.leap.league': state.league,
        'quests.leap.bestLeague': state.bestLeague,
        'quests.leap.plusPaidThrough': state.plusPaidThrough,
        'quests.leap.landed': state.landed,
        'quests.leap.coveredWeek': state.coveredWeek,
        'quests.leap.pendingResult': state.pendingResult,
      },
    },
  );

  return state;
}
