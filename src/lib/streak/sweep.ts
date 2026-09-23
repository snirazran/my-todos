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
import { rotateIndex, type CopyCursors } from '@/lib/notifications/frogVoice';

const MIN_HOURS_BETWEEN_NOTIFICATIONS = 4;
const SAVER_NAMED_HABITS = 3;

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
  (n) => ` Otherwise it costs you one of your ${n} Lily Pads.`,
  (n) => ` Otherwise a Lily Pad covers it. You have ${n}.`,
  (n) => ` Skip it and one of your ${n} Lily Pads is spent.`,
  (n) => ` Otherwise a Lily Pad pays for it in the morning. You have ${n}.`,
];

const SHIELD_NOTES_NONE: string[] = [
  ' You have no Lily Pad left to catch it.',
  ' There is no Lily Pad left to cover the miss.',
  ' No Lily Pads left, so nothing catches this one.',
  ' Nothing left in the jar to cover it.',
];

const SAVER_MULTI_TITLES: ((n: number) => string)[] = [
  (n) => `${n} streaks end at midnight`,
  (n) => `${n} streaks are on the line tonight`,
  (n) => `Midnight takes ${n} streaks`,
  (n) => `${n} streaks expire tonight`,
];

const SAVER_HABIT_TITLES: ((text: string, count: number) => string)[] = [
  (text, count) => `${text} — ${count}-day streak ends at midnight`,
  (text, count) => `${text}: ${count} days, ending tonight`,
  (text, count) => `Midnight ends your ${count} days of ${text}`,
  (text, count) => `${text} — ${count} days on the line`,
];

const SAVER_HABIT_CLOSERS: string[] = [
  'Ticking it off saves it.',
  'One tick keeps it alive.',
  'Check it off and it survives the night.',
  'A single tick is all it takes.',
];

const SAVER_LOGIN_TITLES: ((n: number) => string)[] = [
  (n) => `Your ${n}-day streak ends at midnight`,
  (n) => `${n} days, gone at midnight`,
  (n) => `Midnight ends your ${n}-day streak`,
  (n) => `${n} days on the line tonight`,
];

const SAVER_LOGIN_CLOSERS: string[] = [
  'A 30-second check-in saves it.',
  'Opening the app saves it.',
  'One check-in and it carries on.',
  'Just open the app and it survives.',
];

const FREEZE_TITLES: ((n: number) => string)[] = [
  (n) => `A Lily Pad caught your ${n}-day streak`,
  (n) => `Your ${n}-day streak was saved overnight`,
  (n) => `${n} days, rescued by a Lily Pad`,
  (n) => `A Lily Pad took the hit for ${n} days`,
];

const FREEZE_BODIES_LEFT: ((n: number, plural: string) => string)[] = [
  (n, s) => `${n} Lily Pad${s} left. Check in today and keep climbing.`,
  (n, s) => `${n} Lily Pad${s} left in the jar. Today's check-in spends none.`,
  (n, s) => `You have ${n} Lily Pad${s} left. Check in and keep them.`,
  (n, s) => `${n} Lily Pad${s} remain. Check in today and the streak is safe.`,
];

const FREEZE_BODIES_NONE: string[] = [
  'That was your last one. Check in today — your streak is on its own now.',
  'No Lily Pads left. The streak survives only if you check in today.',
  "That was the last Lily Pad. Today it's all on the check-in.",
  'Nothing left to catch the next miss. Check in today.',
];

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
    .map((h) => `${h.text} (${h.count})`)
    .join(', ');
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
    return {
      title,
      body: named
        ? `${named}${rest > 0 ? ` and ${rest} more` : ''}.${shieldNote}`
        : `Check in to keep them all.${shieldNote}`,
    };
  }

  if (habits.length === 1) {
    const h = habits[0];
    const title = nextOption(
      'saver_habit_title',
      SAVER_HABIT_TITLES,
      cursors,
      writes,
    )(h.text, h.count);
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
