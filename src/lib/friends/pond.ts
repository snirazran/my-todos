import type { FlyEconomyConfig } from '@/lib/economy/defaults';
import { FLY_ECONOMY_DEFAULTS } from '@/lib/economy/defaults';

export type PondState = {
  /** The day `credited` belongs to. */
  date: string;
  credited: Record<string, number>;
  /** The day before, kept claimable until it expires. */
  prevDate?: string;
  prevCredited?: Record<string, number>;
  /** What each friend had generated on `prevDate`, snapshotted before it rolled. */
  prevGenerated?: Record<string, number>;
  lastClaim?: { amount: number; doubled: boolean };
  /** Monday-anchored week the social bonus is tracked against. */
  weekKey?: string;
  weekDays?: string[];
  weekFriends?: string[];
  weekBonusGiven?: boolean;
};

/**
 * Flies a friend's day of work generates for you. Driven by tasks completed,
 * not by flies earned: their income is capped and streak-weighted, and mirroring
 * that would make a friend's Plus status or streak leak into your wallet.
 * Nothing is taken from them — the pond is generated, never transferred.
 */
export function pondFliesFrom(
  friendTasksToday: number,
  config: FlyEconomyConfig = FLY_ECONOMY_DEFAULTS,
): number {
  const per = Math.max(1, config.friendsPond.tasksPerGeneration);
  const generated =
    Math.floor(Math.max(0, friendTasksToday) / per) *
    config.friendsPond.fliesPerGeneration;
  return Math.min(config.friendsPond.perFriendDailyCap, generated);
}

export function pondDailyCap(
  config: FlyEconomyConfig,
  premium: boolean,
): number {
  return premium
    ? config.friendsPond.dailyCapPlus
    : config.friendsPond.dailyCapFree;
}

/** Days of history the expiry window covers, today included. */
export function pondWindowDays(config: FlyEconomyConfig): number {
  return Math.max(1, Math.ceil(config.friendsPond.expiryHours / 24));
}

/**
 * Roll the state onto `today`, snapshotting what was generated on the day that
 * just closed so it stays claimable for its remaining hours. Anything older
 * than the window is dropped — unclaimed flies vanish rather than pile up into
 * one month-sized purchase.
 */
export function rollPond(
  state: PondState | undefined,
  today: string,
  generatedYesterday: Record<string, number>,
  config: FlyEconomyConfig = FLY_ECONOMY_DEFAULTS,
): PondState {
  const empty: PondState = { date: today, credited: {} };
  if (!state) return empty;
  if (state.date === today) return { ...state, credited: state.credited ?? {} };

  const windowDays = pondWindowDays(config);
  const keepsPrevious =
    windowDays > 1 && daysApart(state.date, today) < windowDays;

  return {
    date: today,
    credited: {},
    ...(keepsPrevious
      ? {
          prevDate: state.date,
          prevCredited: state.credited ?? {},
          prevGenerated: generatedYesterday,
        }
      : {}),
    weekKey: state.weekKey,
    weekDays: state.weekDays,
    weekFriends: state.weekFriends,
    weekBonusGiven: state.weekBonusGiven,
  };
}

function daysApart(from: string, to: string): number {
  if (!from || !to) return Number.POSITIVE_INFINITY;
  return Math.abs(
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86_400_000,
    ),
  );
}

export type PondOwed = {
  friendId: string;
  /** Flies still claimable from this friend, today and inside the window. */
  amount: number;
  today: number;
  carried: number;
};

/** What each friend still owes, today's generation plus anything unexpired. */
export function pondOwed(
  state: PondState,
  generatedToday: Record<string, number>,
): PondOwed[] {
  const friendIds = new Set([
    ...Object.keys(generatedToday),
    ...Object.keys(state.prevGenerated ?? {}),
  ]);

  return Array.from(friendIds).map((friendId) => {
    const today = Math.max(
      0,
      (generatedToday[friendId] ?? 0) - (state.credited?.[friendId] ?? 0),
    );
    const carried = Math.max(
      0,
      (state.prevGenerated?.[friendId] ?? 0) -
        (state.prevCredited?.[friendId] ?? 0),
    );
    return { friendId, amount: today + carried, today, carried };
  });
}

export type PondGate = {
  required: number;
  done: number;
  open: boolean;
};

/**
 * The claim gate turns a social pull into self-activation: the pond only opens
 * once you have done a few of your own tasks today.
 */
export function pondGate(
  ownTasksToday: number,
  config: FlyEconomyConfig = FLY_ECONOMY_DEFAULTS,
): PondGate {
  const required = Math.max(0, config.friendsPond.claimGateTasks);
  const done = Math.max(0, ownTasksToday);
  return { required, done, open: done >= required };
}
