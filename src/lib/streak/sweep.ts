import UserModel from '@/lib/models/User';
import type { NotificationPrefs } from '@/lib/types/UserDoc';
import { previousDayKey } from '@/lib/quests/streak';
import {
  applyFreezeCoverage,
  loadLoginStreakConfig,
  readLoginStreakState,
  SAVER_MUTE_THRESHOLD,
} from '@/lib/streak/loginStreak';
import { sendStreakPush } from '@/lib/streak/push';

const MIN_HOURS_BETWEEN_NOTIFICATIONS = 4;

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

export async function runLoginStreakSweep() {
  const config = await loadLoginStreakConfig();
  if (!config.isActive) {
    return { ok: true, skipped: 'inactive' as const };
  }

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

    if (state.lastDayKey !== todayKey) {
      const coverage = await applyFreezeCoverage({ userId, state, todayKey });
      if (coverage) {
        state = coverage.state;
        results.covered += 1;
      }
    }

    const hasTokens = (prefs?.fcmTokens?.length ?? 0) > 0;
    if (!hasTokens || prefs?.enabled === false) continue;

    const morningSlot = prefs?.morningSlot ?? 9;
    const eveningSlot = prefs?.eveningSlot ?? 21;

    const lastFrozen =
      state.freezeUsedDayKeys[state.freezeUsedDayKeys.length - 1];
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
          title: `A freeze saved your ${state.count}-day streak`,
          body:
            state.freezes > 0
              ? `${state.freezes} freeze${state.freezes === 1 ? '' : 's'} left. Check in today and keep climbing.`
              : `That was your last one. Check in today — your streak is on its own now.`,
          type: 'streak_freeze_used',
        });
        results.freezePush += 1;
        continue;
      }
    }

    if (
      hour === eveningSlot &&
      state.lastDayKey === yesterdayKey &&
      state.count >= config.saverMinStreak &&
      state.notif.saverIgnoredCount < SAVER_MUTE_THRESHOLD &&
      state.notif.lastSaverSentDayKey !== todayKey &&
      hoursSince(prefs?.lastNotifiedAt) >= MIN_HOURS_BETWEEN_NOTIFICATIONS
    ) {
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
          $inc: { 'quests.loginStreak.notif.saverIgnoredCount': 1 },
        },
      );
      if (claim.modifiedCount === 1) {
        await sendStreakPush(userId, {
          title:
            state.freezes > 0
              ? "Don't spend a freeze tonight"
              : `Your ${state.count}-day streak ends at midnight`,
          body:
            state.freezes > 0
              ? `A 30-second check-in keeps your ${state.count}-day streak growing for free.`
              : 'A 30-second check-in saves it.',
          type: 'streak_saver',
        });
        results.saverPush += 1;
      }
    }
  }

  return results;
}
