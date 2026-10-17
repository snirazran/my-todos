import UserModel from '@/lib/models/User';
import type { NotificationPrefs } from '@/lib/types/UserDoc';
import { previousDayKey } from '@/lib/quests/streak';
import {
  applyShieldCoverage,
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
import type { TaskStreakAtRisk } from '@/lib/streak/types';
import {
  rotateIndex,
  shortTaskText,
  type CopyCursors,
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
      ? ' Otherwise your last Lily Pad covers the day.'
      : ` Otherwise a Lily Pad covers the day. You have ${n}.`,
  (n) =>
    n === 1
      ? ' If not, your only Lily Pad steps in.'
      : ` If not, one of your ${n} Lily Pads steps in.`,
  () => ' A Lily Pad would cover the day, but why spend one?',
  (n) =>
    n === 1
      ? ' Skip tonight and your last Lily Pad gets used.'
      : ` Skip tonight and a Lily Pad gets used. You have ${n}.`,
];

const SHIELD_NOTES_NONE: string[] = [
  ' No Lily Pads left to cover the day.',
  ' There is no Lily Pad left to cover a miss.',
  ' No Lily Pads in reserve, so this one counts.',
  " You're out of Lily Pads, so tonight really counts.",
];

const SAVER_MULTI_TITLES: ((n: number) => string)[] = [
  (n) => `${n} streaks end at midnight`,
  (n) => `${n} streaks need you tonight`,
  (n) => `Midnight is coming for ${n} streaks`,
  (n) => `${n} streaks, one evening to save them`,
];

const SAVER_MULTI_BODIES: ((list: string, one: boolean) => string)[] = [
  (list, one) => `${list} ${one ? 'needs' : 'need'} a tick tonight.`,
  (list, one) => `${list} ${one ? 'is' : 'are'} waiting on a tick.`,
  (list) => `Still to tick: ${list}.`,
  (list, one) => `${list} ${one ? 'is' : 'are'} one tick from safe.`,
];

const SAVER_HABIT_TITLES: ((text: string, count: number) => string)[] = [
  (text, count) => `Your ${count}-day "${text}" streak ends tonight`,
  (text, count) => `${count} days of "${text}" end at midnight`,
  (text, count) => `Midnight ends ${count} days of "${text}"`,
  (text, count) => `Save ${count} days of "${text}" tonight`,
];

const SAVER_HABIT_CLOSERS: string[] = [
  'One tick saves it.',
  'Tick it off and it survives the night.',
  "It only needs one tick. I'd hate to see it go.",
  'Tick it off and it lives to see tomorrow.',
];

const SAVER_LOGIN_TITLES: ((n: number) => string)[] = [
  (n) => `Your ${n}-day streak ends at midnight`,
  (n) => `Midnight is coming for ${n} days`,
  (n) => `${n} days on the line tonight`,
  (n) => `Save your ${n}-day streak tonight`,
];

const SAVER_LOGIN_CLOSERS: string[] = [
  'One finished task saves it. Any task.',
  'Finish anything today and it carries on.',
  "One small task keeps it alive. I'd pick the smallest.",
  'Tick off one thing and it survives. Even a tiny thing.',
];

const FREEZE_TITLES: ((n: number) => string)[] = [
  (n) => `A Lily Pad saved your ${n}-day streak`,
  (n) => `Your ${n}-day streak survived the night`,
  (n) => `${n} days, saved by a Lily Pad`,
  (n) => `Close call: your ${n}-day streak is safe`,
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

/**
 * One evening message for everything expiring tonight. Names what is actually
 * at stake rather than saying "your streak" — specific, countable copy is what
 * makes a loss-framed reminder land instead of reading as nagging.
 */
function buildSaverMessage(args: {
  loginCount: number;
  habits: TaskStreakAtRisk[];
  shields: number;
  cursors: CopyCursors;
  writes: Record<string, number>;
}): { title: string; body: string } {
  const { loginCount, habits, shields, cursors, writes } = args;
  const total = habits.length + (loginCount > 0 ? 1 : 0);
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

  if (total > 1) {
    const title = nextOption(
      'saver_multi_title',
      SAVER_MULTI_TITLES,
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
    return { title, body: `${body}${shieldNote}` };
  }

  if (habits.length === 1) {
    const h = habits[0];
    const title = nextOption(
      'saver_habit_title',
      SAVER_HABIT_TITLES,
      cursors,
      writes,
    )(shortTaskText(h.text, 20) ?? h.text, h.count);
    const closer = nextOption(
      'saver_habit_close',
      SAVER_HABIT_CLOSERS,
      cursors,
      writes,
    );
    return { title, body: `${closer}${shieldNote}` };
  }

  const title = nextOption(
    'saver_login_title',
    SAVER_LOGIN_TITLES,
    cursors,
    writes,
  )(loginCount);
  const closer = nextOption(
    'saver_login_close',
    SAVER_LOGIN_CLOSERS,
    cursors,
    writes,
  );
  return { title, body: `${closer}${shieldNote}` };
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
    .select('_id quests notificationPrefs')
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
      }
    }

    const hasTokens = (prefs?.fcmTokens?.length ?? 0) > 0;
    if (!hasTokens || prefs?.enabled === false) continue;

    const morningSlot = prefs?.morningSlot ?? 9;
    const eveningSlot = prefs?.eveningSlot ?? 21;

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
      const title = nextOption(
        'freeze_title',
        FREEZE_TITLES,
        cursors,
        writes,
      )(state.count);
      const body =
        shieldState.count > 0
          ? nextOption('freeze_body_left', FREEZE_BODIES_LEFT, cursors, writes)(
              shieldState.count,
              shieldState.count === 1 ? '' : 's',
            )
          : nextOption('freeze_body_none', FREEZE_BODIES_NONE, cursors, writes);

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
          title,
          body,
          type: 'streak_freeze_used',
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

      if (loginAtRisk > 0 || habitsAtRisk.length > 0) {
        const cursors: CopyCursors = { ...(prefs?.copyCursor ?? {}) };
        const writes: Record<string, number> = {};
        const message = buildSaverMessage({
          loginCount: loginAtRisk,
          habits: habitsAtRisk,
          shields: shieldState.count,
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
          });
          results.saverPush += 1;
        }
      }
    }
  }

  return results;
}
