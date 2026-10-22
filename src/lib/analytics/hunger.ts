import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { HUNGRY_MOOD_THRESHOLD, MAX_HUNGER_MS } from '@/lib/hungerLogic';

const HUNGRY_AT_MS = HUNGRY_MOOD_THRESHOLD * MAX_HUNGER_MS;

export async function recordHungerStarted(args: {
  userId: string;
  previousHunger: number | undefined;
  nextHunger: number;
  isPremium: boolean;
  dayKey: string;
}) {
  if (typeof args.previousHunger === 'number' && args.previousHunger <= HUNGRY_AT_MS) return;
  if (args.nextHunger > HUNGRY_AT_MS) return;
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

export async function recordHungerFed(args: {
  userId: string;
  method: 'task' | 'focus';
  hungerBefore: number;
  hungerAfter: number;
  isPremium: boolean;
}) {
  if (args.hungerBefore > HUNGRY_AT_MS || args.hungerAfter <= HUNGRY_AT_MS) return;
  await recordHungerResolved({ userId: args.userId, method: args.method, isPremium: args.isPremium });
}

export async function recordHungerResolved(args: {
  userId: string;
  method: 'refund' | 'task' | 'focus';
  flies?: number;
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
