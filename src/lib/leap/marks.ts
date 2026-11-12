import LeapWeekModel, { type LeapWeekDoc } from '@/lib/models/LeapWeek';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import type { LeapMarkId } from './types';

export async function recordMark(args: {
  userId: string;
  weekDocId: LeapWeekDoc['_id'];
  weekKey: string;
  id: LeapMarkId;
  league: number;
  hops: number;
  scheduled: number;
}): Promise<boolean> {
  const claimed = await LeapWeekModel.updateOne(
    { _id: args.weekDocId, marks: { $ne: args.id } },
    {
      $addToSet: { marks: args.id },
      ...(args.id === 'leap' ? { $set: { landedAt: new Date() } } : {}),
    },
  );
  if (claimed.modifiedCount === 0) return false;
  void recordAnalyticsEvent({
    userId: args.userId,
    name: args.id === 'hold' ? 'leap_hold_reached' : 'leap_landed',
    properties: {
      mark: args.id,
      week_key: args.weekKey,
      hops: args.hops,
      scheduled: args.scheduled,
      league: args.league,
    },
  }).catch(() => {});
  return true;
}
