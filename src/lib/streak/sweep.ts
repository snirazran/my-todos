import UserModel from '@/lib/models/User';
import type { NotificationPrefs } from '@/lib/types/UserDoc';
import { previousDayKey } from '@/lib/quests/streak';
import {
  applyShieldCoverage,
  computeGap,
  loadLoginStreakConfig,
  readLoginStreakState,
  RESCUE_MIN_TASK_STREAK,
  SAVER_MUTE_THRESHOLD,
} from '@/lib/streak/loginStreak';
import {
  applyMonthlyGrant,
  loadShieldConfig,
  readShieldState,
} from '@/lib/shields/engine';
import { isPremiumUser } from '@/lib/quests/engine';
import { findTaskStreaksAtRisk } from '@/lib/streak/taskStreaks';
import { sendStreakPush } from '@/lib/streak/push';
import { recordShieldUsed, recordStreakBroken } from '@/lib/streak/analytics';
import type { TaskStreakAtRisk } from '@/lib/streak/types';
import {
  addressed,
  firstName,
  frogTitle,
  rotateIndex,
  shortTaskText,
  type CopyCursors,
  type Mood,
} from '@/lib/notifications/frogVoice';

const MIN_HOURS_BETWEEN_NOTIFICATIONS = 4;
const SAVER_NAMED_HABITS = 2;

function getCurrentHourInTz(tz: string): number {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).format(new Date());
    return parseInt(formatted, 10);
  } catch {
    return new Date().getUTCHours();
  }
}

function getTodayInTz(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')!.value;
    const m = parts.find((p) => p.type === 'month')!.value;
    const d = parts.find((p) => p.type === 'day')!.value;
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function hoursSince(date: Date | string | undefined | null): number {
  if (!date) return Infinity;
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60);
}

/**
 * Pull the next option out of a copy bucket and record where it resumes, so
 * the evening message does not land in the same words two nights running.
 */
function nextOption<T>(
  bucket: string,
  options: T[],
  cursors: CopyCursors,
  writes: Record<string, number>,
): T {
  const { index, cursor } = rotateIndex(bucket, options.length, cursors);
  cursors[bucket] = cursor;
  writes[`notificationPrefs.copyCursor.${bucket}`] = cursor;
  return options[index];
}

// Lily Pads are not spent from a push — they apply on their own the next
// morning. So the angle is "don't waste one", not "buy your way out".
const SHIELD_NOTES_LEFT: ((n: number) => string)[] = [
  (n) =>
    n === 1
      ? ' Otherwise your last Lily Pad covers it.'
      : ` Otherwise a Lily Pad covers it. You have ${n}.`,
  (n) =>
    n === 1
      ? ' If not, your only Lily Pad steps in.'
      : ` If not, one of your ${n} Lily Pads steps in.`,
  () => ' A Lily Pad would cover it, but why spend one?',
  (n) =>
    n === 1
      ? ' Skip it and your last Lily Pad gets used.'
      : ` Skip it and a Lily Pad gets used. You have ${n}.`,
];

const SHIELD_NOTES_NONE: string[] = [
  ' No Lily Pads left to cover it.',
  ' There is no Lily Pad left to cover a miss.',
  ' No Lily Pads in reserve, so this one counts.',
  " You're out of Lily Pads, so tonight really counts.",
];

const SAVER_MULTI_OPENERS: ((n: number) => string)[] = [
  (n) => `${n} of our streaks end at midnight.`,
  (n) => `${n} of our streaks need you tonight.`,
  (n) => `Midnight is coming for ${n} of our streaks.`,
  (n) => `${n} streaks, one evening to save them.`,
];

const SAVER_MULTI_BODIES: ((list: string, one: boolean) => string)[] = [
  (list, one) => `${list} ${one ? 'needs' : 'need'} a tick tonight.`,
  (list, one) => `${list} ${one ? 'is' : 'are'} waiting on a tick.`,
  (list) => `Still to tick: ${list}.`,
  (list, one) => `${list} ${one ? 'is' : 'are'} one tick from safe.`,
];

const SAVER_HABIT_OPENERS: ((text: string, count: number) => string)[] = [
  (text, count) => `Your ${count}-day "${text}" streak ends at midnight.`,
  (text, count) => `Midnight is coming for ${count} days of "${text}".`,
  (text, count) => `${count} days of "${text}" are riding on tonight.`,
  (text, count) => `"${text}" is on ${count} days and still unticked today.`,
  (text, count) => `Your "${text}" streak is ${count} days old. Tonight decides day ${count + 1}.`,
  (text, count) => `${count} days of "${text}", and the clock is ticking.`,
];

const SAVER_HABIT_CLOSERS: string[] = [
  'One tick keeps it alive.',
  'Tick it and it survives the night.',
  "I'd hate to see it go. One tick saves it.",
  "Tick it and I'll do my victory wiggle.",
  'One tick and it lives to see tomorrow.',
  'One tick and I can stop watching the clock.',
];

const SAVER_LOGIN_OPENERS: ((n: number) => string)[] = [
  (n) => `Our ${n}-day streak ends at midnight.`,
  (n) => `Midnight is coming for our ${n}-day streak.`,
  (n) => `${n} days in a row, and tonight decides day ${n + 1}.`,
  (n) => `Our streak is ${n} days old, and nothing's ticked yet today.`,
  (n) => `The clock is eyeing our ${n}-day streak.`,
  (n) => `${n} days strong. I'd love to see ${n + 1}.`,
];

const SAVER_LOGIN_CLOSERS: string[] = [
  'Finish anything on your list and it carries on.',
  'One finished task saves it. Any task.',
  "Any finished task keeps it going. I'm not picky.",
  'One tick and I can stop staring at the clock.',
  'Tick off one thing and it survives. Even a tiny thing.',
  'Finish one task and we keep going.',
];

const FIRST_STREAK_OPENERS: string[] = [
  'Yesterday was day 1 of our streak. One task today makes it 2.',
  'Day 1 is done. Day 2 just needs one finished task.',
  'You started a streak yesterday. One task today keeps it going.',
  'One task today and our streak hits 2 days.',
  "Day 2 is right here. Finish one task and we're on 2 days.",
  'Yesterday you got us to day 1. Today could be day 2.',
];

const FIRST_STREAK_CLOSERS: string[] = [
  "I'm keeping count.",
  "No pressure. I'm just very excited.",
  'I have a good feeling about this.',
  "I'll be counting.",
];

const FREEZE_OPENERS: ((n: number) => string)[] = [
  (n) => `A Lily Pad saved our ${n}-day streak last night.`,
  (n) => `Our ${n}-day streak survived the night, thanks to a Lily Pad.`,
  (n) => `${n} days, saved by a Lily Pad.`,
  (n) => `Close call. A Lily Pad kept our ${n}-day streak going.`,
];

const FREEZE_BODIES_LEFT: ((n: number, plural: string) => string)[] = [
  (n, s) => `${n} Lily Pad${s} left. One task today keeps the streak rolling.`,
  (n, s) =>
    `${n} Lily Pad${s} left for a rainy day. A task today keeps it that way.`,
  (n, s) =>
    `${n} Lily Pad${s} still in reserve. Finish a task today and keep ${n === 1 ? 'it' : 'them'}.`,
  (n, s) =>
    `No harm done. ${n} Lily Pad${s} left. Today's first task keeps the streak going.`,
];

const FREEZE_BODIES_NONE: string[] = [
  'That was your last Lily Pad. One task today keeps the streak going.',
  "No Lily Pads left, so today's task really counts. Any task will do.",
  'Last Lily Pad used. Finish one task today and the streak carries on.',
  'Nothing left in reserve now. One finished task today keeps it alive.',
];

function listOf(items: string[], rest: number): string {
  if (rest > 0) return `${items.join(', ')} and ${rest} more`;
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

type StreakPushCopy = { title: string; body: string; mood: Mood };

/**
 * One evening message for everything expiring tonight. Names what is actually
 * at stake rather than saying "your streak" — specific, countable copy is what
 * makes a loss-framed reminder land instead of reading as nagging.
 */
function buildSaverMessage(args: {
  loginCount: number;
  firstStreak: boolean;
  habits: TaskStreakAtRisk[];
  shields: number;
  frog: string;
  name: string | null;
  cursors: CopyCursors;
  writes: Record<string, number>;
}): StreakPushCopy {
  const { loginCount, firstStreak, habits, shields, frog, name, cursors, writes } = args;
  const total = habits.length + (loginCount > 0 ? 1 : 0);

  if (total === 0 && firstStreak) {
    const opener = nextOption('first_streak_open', FIRST_STREAK_OPENERS, cursors, writes);
    const closer = nextOption('first_streak_close', FIRST_STREAK_CLOSERS, cursors, writes);
    return {
      title: frogTitle(frog, 'happy'),
      body: `${addressed(name, opener)} ${closer}`,
      mood: 'happy',
    };
  }

  const named = habits
    .slice(0, SAVER_NAMED_HABITS)
    .map((h) => `"${shortTaskText(h.text, 20) ?? h.text}" (${h.count} days)`);
  const rest = habits.length - Math.min(habits.length, SAVER_NAMED_HABITS);
  const shieldNote =
    shields > 0
      ? nextOption('shield_note_left', SHIELD_NOTES_LEFT, cursors, writes)(
          shields,
        )
      : nextOption('shield_note_none', SHIELD_NOTES_NONE, cursors, writes);
  const title = frogTitle(frog, 'nervous');

  if (total > 1) {
    const opener = nextOption(
      'f_saver_multi_open',
      SAVER_MULTI_OPENERS,
      cursors,
      writes,
    )(total);
    const body =
      named.length > 0
        ? nextOption('saver_multi_body', SAVER_MULTI_BODIES, cursors, writes)(
            listOf(named, rest),
            habits.length === 1,
          )
        : 'Finish a task to keep them all.';
    return { title, body: `${addressed(name, opener)} ${body}${shieldNote}`, mood: 'nervous' };
  }

  if (habits.length === 1) {
    const h = habits[0];
    const opener = nextOption(
      'f_saver_habit_open',
      SAVER_HABIT_OPENERS,
      cursors,
      writes,
    )(shortTaskText(h.text, 20) ?? h.text, h.count);
    const closer = nextOption(
      'f_saver_habit_close',
      SAVER_HABIT_CLOSERS,
      cursors,
      writes,
    );
    return { title, body: `${addressed(name, opener)} ${closer}${shieldNote}`, mood: 'nervous' };
  }

  const opener = nextOption(
    'f_saver_login_open',
    SAVER_LOGIN_OPENERS,
    cursors,
    writes,
  )(loginCount);
  const closer = nextOption(
    'f_saver_login_close',
    SAVER_LOGIN_CLOSERS,
    cursors,
    writes,
  );
  return { title, body: `${addressed(name, opener)} ${closer}${shieldNote}`, mood: 'nervous' };
}

function buildFreezeMessage(args: {
  count: number;
  shields: number;
  frog: string;
  name: string | null;
  cursors: CopyCursors;
  writes: Record<string, number>;
}): StreakPushCopy {
  const { count, shields, frog, name, cursors, writes } = args;
  const opener = nextOption('f_freeze_open', FREEZE_OPENERS, cursors, writes)(count);
  const body =
    shields > 0
      ? nextOption('freeze_body_left', FREEZE_BODIES_LEFT, cursors, writes)(
          shields,
          shields === 1 ? '' : 's',
        )
      : nextOption('freeze_body_none', FREEZE_BODIES_NONE, cursors, writes);
  return {
    title: frogTitle(frog, 'relief'),
    body: `${addressed(name, opener)} ${body}`,
    mood: 'relief',
  };
}

export async function runLoginStreakSweep() {
  const config = await loadLoginStreakConfig();
  if (!config.isActive) {
    return { ok: true, skipped: 'inactive' as const };
  }
  const shieldConfig = await loadShieldConfig();

  const users = await UserModel.find({
    'quests.loginStreak.lastDayKey': { $exists: true, $ne: '' },
  })
    .select('_id name frogName quests notificationPrefs')
    .lean()
    .exec();

  const results = {
    ok: true,
    scanned: users.length,
    covered: 0,
    freezePush: 0,
    saverPush: 0,
  };

  for (const user of users) {
    const userId = (user as any)._id as string;
    const prefs = (user as any).notificationPrefs as
      | NotificationPrefs
      | undefined;
    const tz = prefs?.timezone || 'UTC';
    const todayKey = getTodayInTz(tz);
    const hour = getCurrentHourInTz(tz);
    const yesterdayKey = previousDayKey(todayKey);

    let state = readLoginStreakState(user);
    let shieldState = applyMonthlyGrant(
      readShieldState(user),
      shieldConfig,
      isPremiumUser(user as any),
      todayKey,
    );

    if (state.lastDayKey !== todayKey) {
      const coverage = await applyShieldCoverage({
        userId,
        state,
        shieldState,
        shieldConfig,
        todayKey,
      });
      if (coverage) {
        state = coverage.state;
        shieldState = coverage.shieldState;
        results.covered += 1;
        await recordShieldUsed({
          userId,
          days: coverage.consumed,
          shieldCount: shieldState.count,
          streakLength: state.count,
          isPremium: isPremiumUser(user as any),
        });
      }
    }

    if (state.count >= 2 && computeGap(state.lastDayKey, todayKey) === 1) {
      await recordStreakBroken({
        userId,
        count: state.count,
        lastDayKey: state.lastDayKey,
        longestStreak: state.longestStreak,
        isPremium: isPremiumUser(user as any),
      });
    }

    const hasTokens = (prefs?.fcmTokens?.length ?? 0) > 0;
    if (!hasTokens || prefs?.enabled === false) continue;

    const morningSlot = prefs?.morningSlot ?? 9;
    const eveningSlot = prefs?.eveningSlot ?? 21;
    const frog = ((user as any).frogName as string | undefined) ?? '';
    const name = firstName((user as any).name);

    const lastFrozen =
      state.shieldedDayKeys[state.shieldedDayKeys.length - 1];
    if (
      hour === morningSlot &&
      lastFrozen &&
      lastFrozen >= yesterdayKey &&
      state.notif.freezePushSentForDayKey !== lastFrozen &&
      state.lastDayKey !== todayKey
    ) {
      const cursors: CopyCursors = { ...(prefs?.copyCursor ?? {}) };
      const writes: Record<string, number> = {};
      const message = buildFreezeMessage({
        count: state.count,
        shields: shieldState.count,
        frog,
        name,
        cursors,
        writes,
      });

      const claim = await UserModel.updateOne(
        {
          _id: userId,
          'quests.loginStreak.notif.freezePushSentForDayKey': {
            $ne: lastFrozen,
          },
        },
        {
          $set: {
            'quests.loginStreak.notif.freezePushSentForDayKey': lastFrozen,
            'notificationPrefs.lastNotifiedAt': new Date(),
            ...writes,
          },
        },
      );
      if (claim.modifiedCount === 1) {
        await sendStreakPush(userId, {
          ...message,
          type: 'streak_freeze_used',
          slot: 'morning',
        });
        results.freezePush += 1;
        continue;
      }
    }

    // One evening slot covers every kind of streak loss. Cheap gates first so
    // the habit lookup only runs for users actually eligible for a send.
    if (
      hour === eveningSlot &&
      state.notif.saverIgnoredCount < SAVER_MUTE_THRESHOLD &&
      state.notif.lastSaverSentDayKey !== todayKey &&
      hoursSince(prefs?.lastNotifiedAt) >= MIN_HOURS_BETWEEN_NOTIFICATIONS
    ) {
      const loginAtRisk =
        state.lastDayKey === yesterdayKey && state.count >= config.saverMinStreak
          ? state.count
          : 0;
      const habitsAtRisk = await findTaskStreaksAtRisk({
        userId,
        missedDayKey: todayKey,
        timezone: tz,
        protectedDays: new Set(state.protectedDayKeys),
        minStreak: RESCUE_MIN_TASK_STREAK,
      });

      const firstStreak =
        state.count === 1 && state.lastDayKey === yesterdayKey;

      if (loginAtRisk > 0 || habitsAtRisk.length > 0 || firstStreak) {
        const cursors: CopyCursors = { ...(prefs?.copyCursor ?? {}) };
        const writes: Record<string, number> = {};
        const message = buildSaverMessage({
          loginCount: loginAtRisk,
          firstStreak,
          habits: habitsAtRisk,
          shields: shieldState.count,
          frog,
          name,
          cursors,
          writes,
        });
        const claim = await UserModel.updateOne(
          {
            _id: userId,
            'quests.loginStreak.notif.lastSaverSentDayKey': { $ne: todayKey },
          },
          {
            $set: {
              'quests.loginStreak.notif.lastSaverSentDayKey': todayKey,
              'notificationPrefs.lastNotifiedAt': new Date(),
              ...writes,
            },
          },
        );
        if (claim.modifiedCount === 1) {
          await sendStreakPush(userId, {
            ...message,
            type: 'streak_saver',
            slot: 'evening',
          });
          results.saverPush += 1;
        }
      }
    }
  }

  return results;
}
