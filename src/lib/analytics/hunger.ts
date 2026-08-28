import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function recordHungerBite(args: {
  userId: string;
  previousStolen: number;
  nextStolen: number;
  isPremium: boolean;
  dayKey: string;
}) {
  if (args.previousStolen > 0 || args.nextStolen <= 0) return;
  await recordAnalyticsEvent({
    userId: args.userId,
    name: 'hunger_started',
    externalId: `hunger_started:${args.userId}:${args.dayKey}`,
    properties: {
      fly_amount: args.nextStolen,
      is_premium: args.isPremium,
      day_key: args.dayKey,
    },
  });
}

export async function recordHungerResolved(args: {
  userId: string;
  method: 'accepted' | 'ad_recovery';
  flies: number;
  isPremium: boolean;
}) {
  await recordAnalyticsEvent({
    userId: args.userId,
    name: 'hunger_resolved',
    properties: {
      method: args.method,
      fly_amount: args.flies,
      is_premium: args.isPremium,
    },
  });
}
