import LeapWeekModel, { type LeapWeekDoc } from '@/lib/models/LeapWeek';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { grantLeapRewards } from './rewards';
import { clampLeague } from './state';
import type {
  BonusRewards,
  LeapConfigView,
  LeapGrantSummary,
  LeapMarkId,
} from './types';

export function markRewards(
  config: LeapConfigView,
  id: LeapMarkId,
  league: number,
  isPremium = false,
): BonusRewards {
  const mark = config.marks[id];
  const entry = id === 'leap' ? config.leagues[clampLeague(config, league)] : null;
  return [
    ...(mark.flies > 0 ? [{ type: 'FLIES' as const, amount: mark.flies }] : []),
    ...(entry?.weekRewards ?? []),
    ...(isPremium ? entry?.plusWeekRewards ?? [] : []),
  ];
}

export async function payMark(args: {
  userId: string;
  weekDocId: LeapWeekDoc['_id'];
  weekKey: string;
  id: LeapMarkId;
  config: LeapConfigView;
  league: number;
  multiplier: number;
  isPremium: boolean;
  dayKey: string;
  hops: number;
  scheduled: number;
}): Promise<(LeapGrantSummary & { id: LeapMarkId }) | null> {
  const claimed = await LeapWeekModel.updateOne(
    { _id: args.weekDocId, marks: { $ne: args.id } },
    { $addToSet: { marks: args.id } },
  );
  if (claimed.modifiedCount === 0) return null;
  const grant = await grantLeapRewards({
    userId: args.userId,
    rewards: markRewards(args.config, args.id, args.league, args.isPremium),
    occurrenceKey: `leap:mark:${args.weekKey}:${args.id}`,
    dayKey: args.dayKey,
    isPremium: args.isPremium,
    flyMultiplier: args.multiplier,
    meta: { weekKey: args.weekKey, mark: args.id },
  });
  void recordAnalyticsEvent({
    userId: args.userId,
    name: args.id === 'hold' ? 'leap_hold_reached' : 'leap_landed',
    properties: {
      mark: args.id,
      week_key: args.weekKey,
      hops: args.hops,
      scheduled: args.scheduled,
      league: args.league,
      fly_amount: grant.fliesGranted,
    },
  }).catch(() => {});
  return { ...grant, id: args.id };
}
