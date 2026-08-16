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
 * One evening message for everything expiring tonight. Names what is actually
 * at stake rather than saying "your streak" — specific, countable copy is what
 * makes a loss-framed reminder land instead of reading as nagging.
 */
function buildSaverMessage(args: {
  loginCount: number;
  habits: TaskStreakAtRisk[];
  shields: number;
}): { title: string; body: string } {
  const { loginCount, habits, shields } = args;
  const total = habits.length + (loginCount > 0 ? 1 : 0);
  const named = habits
    .slice(0, SAVER_NAMED_HABITS)
    .map((h) => `${h.text} (${h.count})`)
    .join(', ');
  const rest = habits.length - Math.min(habits.length, SAVER_NAMED_HABITS);
  // Lily Pads are not spent from a push — they apply on their own the next
  // morning. So the angle is "don't waste one", not "buy your way out".
  const shieldNote =
    shields > 0
      ? ` Otherwise it costs you one of your ${shields} Lily Pads.`
      : ' You have no Lily Pad left to catch it.';

  if (total > 1) {
    return {
      title: `${total} streaks end at midnight`,
      body: named
        ? `${named}${rest > 0 ? ` and ${rest} more` : ''}.${shieldNote}`
        : `Check in to keep them all.${shieldNote}`,
    };
  }

  if (habits.length === 1) {
    const h = habits[0];
    return {
      title: `${h.text} — ${h.count}-day streak ends at midnight`,
      body: `Ticking it off saves it.${shieldNote}`,
    };
  }

  return {
    title: `Your ${loginCount}-day streak ends at midnight`,
    body: `A 30-second check-in saves it.${shieldNote}`,
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
          },
        },
      );
      if (claim.modifiedCount === 1) {
        await sendStreakPush(userId, {
          title: `A Lily Pad caught your ${state.count}-day streak`,
          body:
            shieldState.count > 0
              ? `${shieldState.count} Lily Pad${shieldState.count === 1 ? '' : 's'} left. Check in today and keep climbing.`
              : `That was your last one. Check in today — your streak is on its own now.`,
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
        const claim = await UserModel.updateOne(
          {
            _id: userId,
            'quests.loginStreak.notif.lastSaverSentDayKey': { $ne: todayKey },
          },
          {
            $set: {
              'quests.loginStreak.notif.lastSaverSentDayKey': todayKey,
              'notificationPrefs.lastNotifiedAt': new Date(),
            },
          },
        );
        if (claim.modifiedCount === 1) {
          await sendStreakPush(userId, {
            ...buildSaverMessage({
              loginCount: loginAtRisk,
              habits: habitsAtRisk,
              shields: shieldState.count,
            }),
            type: 'streak_saver',
          });
          results.saverPush += 1;
        }
      }
    }
  }

  return results;
}
