import UserModel from '@/lib/models/User';
import {
  syncPremiumFromRevenueCat,
  type PlusSubscriptionSnapshot,
} from '@/lib/revenuecat';
import { sendPlusPush } from '@/lib/plus/push';

export const TRIAL_REMINDER_LEAD_MS = 48 * 60 * 60 * 1000;
const QUIET_START_HOUR = 21;
const QUIET_END_HOUR = 9;
const LAST_CHANCE_MS = 10 * 60 * 60 * 1000;

type Candidate = {
  _id: string;
  plusSubscription?: PlusSubscriptionSnapshot;
  notificationPrefs?: { timezone?: string };
};

function hourIn(tz: string) {
  try {
    return parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        hour12: false,
      }).format(new Date()),
      10,
    );
  } catch {
    return new Date().getUTCHours();
  }
}

function dateIn(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'long',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toDateString();
  }
}

function isDue(sub: PlusSubscriptionSnapshot | undefined, now: number) {
  if (!sub || sub.periodType !== 'trial' || !sub.willRenew || !sub.expiresAt) {
    return false;
  }
  if (sub.trialReminderFor === sub.expiresAt) return false;
  const left = new Date(sub.expiresAt).getTime() - now;
  return left > 0 && left <= TRIAL_REMINDER_LEAD_MS;
}

export async function runPlusTrialReminders() {
  const now = Date.now();
  const candidates = await UserModel.find({
    'plusSubscription.periodType': 'trial',
    'plusSubscription.willRenew': true,
  })
    .select('_id plusSubscription notificationPrefs.timezone')
    .lean<Candidate[]>();

  let sent = 0;
  for (const user of candidates) {
    if (!isDue(user.plusSubscription, now)) continue;
    const tz = user.notificationPrefs?.timezone || 'UTC';
    const hour = hourIn(tz);
    const quiet = hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
    const left = new Date(user.plusSubscription!.expiresAt!).getTime() - now;
    if (quiet && left > LAST_CHANCE_MS) continue;

    try {
      await syncPremiumFromRevenueCat(user._id);
    } catch (err) {
      console.error('Plus trial reminder refresh failed:', err);
    }
    const fresh = await UserModel.findById(user._id)
      .select('plusSubscription')
      .lean<{ plusSubscription?: PlusSubscriptionSnapshot } | null>();
    const sub = fresh?.plusSubscription;
    if (!isDue(sub, now) || !sub?.expiresAt) continue;

    const hoursLeft = (new Date(sub.expiresAt).getTime() - now) / 3_600_000;
    const when = hoursLeft <= 24 ? 'tomorrow' : 'in 2 days';
    await sendPlusPush(user._id, {
      type: 'plus_trial_reminder',
      title: `Your Plus trial ends ${when}`,
      body: `Plus renews on ${dateIn(sub.expiresAt, tz)}. Loving it? Do nothing. Not for you? Cancel before then in Settings → Frogress Plus.`,
    });
    await UserModel.updateOne(
      { _id: user._id },
      { $set: { 'plusSubscription.trialReminderFor': sub.expiresAt } },
    );
    sent += 1;
  }
  return { scanned: candidates.length, sent };
}
