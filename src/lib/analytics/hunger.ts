import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function recordHungerStarted(args: {
  userId: string;
  previousHunger: number | undefined;
  nextHunger: number;
  isPremium: boolean;
  dayKey: string;
}) {
  if (typeof args.previousHunger === 'number' && args.previousHunger <= 0) return;
  if (args.nextHunger > 0) return;
  await recordAnalyticsEvent({
    userId: args.userId,
    name: 'hunger_started',
    externalId: `hunger_started:${args.userId}:${args.dayKey}`,
    properties: {
      is_premium: args.isPremium,
      day_key: args.dayKey,
    },
  });
}

export async function recordHungerResolved(args: {
  userId: string;
  method: 'refund';
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
