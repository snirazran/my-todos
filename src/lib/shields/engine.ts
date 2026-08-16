import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import ShieldConfigModel, {
  SHIELD_CONFIG_ID,
  SHIELD_CONFIG_VERSION,
  SHIELD_DEFAULTS,
  CAP_MIN,
  CAP_MAX,
} from '@/lib/models/ShieldConfig';
import type {
  ShieldConfigView,
  ShieldOffer,
  ShieldState,
  ShieldSystem,
  ShieldView,
} from './types';
import { SHIELD_SYSTEMS } from './types';

const EMPTY_OFFER = {
  lastShownDayKey: '',
  dismissals: 0,
  lastPurchaseDayKey: '',
};

export function dayKeyDiff(fromKey: string, toKey: string): number {
  if (!fromKey || !toKey) return Number.POSITIVE_INFINITY;
  return Math.round(
    (Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) /
      86400000,
  );
}

export async function loadShieldConfig(): Promise<ShieldConfigView> {
  await connectMongo();
  let doc = await ShieldConfigModel.findOne({
    configId: SHIELD_CONFIG_ID,
  }).lean<(ShieldConfigView & { configVersion?: number }) | null>();
  // A doc written before v2 carries the retired auto-grant as a real, tuned
  // value, so a "is it missing?" backfill would never touch it. The version
  // stamp is what makes the retirement run exactly once and stay admin-tunable.
  if (doc && (doc.configVersion ?? 1) < SHIELD_CONFIG_VERSION) {
    await ShieldConfigModel.updateOne(
      { configId: SHIELD_CONFIG_ID },
      {
        $set: {
          earnEveryPactWeeks: SHIELD_DEFAULTS.earnEveryPactWeeks,
          configVersion: SHIELD_CONFIG_VERSION,
        },
      },
    );
    doc = {
      ...doc,
      earnEveryPactWeeks: SHIELD_DEFAULTS.earnEveryPactWeeks,
      configVersion: SHIELD_CONFIG_VERSION,
    };
  }
  const num = (value: unknown, fallback: number, min = 0) =>
    Math.max(min, Math.floor(Number(value ?? fallback) || fallback));
  return {
    isActive: doc?.isActive ?? SHIELD_DEFAULTS.isActive,
    priceFlies: num(doc?.priceFlies, SHIELD_DEFAULTS.priceFlies, 1),
    twoPackPriceFlies: num(
      doc?.twoPackPriceFlies,
      SHIELD_DEFAULTS.twoPackPriceFlies,
      1,
    ),
    capFree: Math.min(CAP_MAX, num(doc?.capFree, SHIELD_DEFAULTS.capFree, CAP_MIN)),
    capPlus: Math.min(CAP_MAX, num(doc?.capPlus, SHIELD_DEFAULTS.capPlus, CAP_MIN)),
    plusMonthlyGrant: num(
      doc?.plusMonthlyGrant,
      SHIELD_DEFAULTS.plusMonthlyGrant,
    ),
    rescueCooldownDays: num(
      doc?.rescueCooldownDays,
      SHIELD_DEFAULTS.rescueCooldownDays,
    ),
    offerCooldownDays: num(
      doc?.offerCooldownDays,
      SHIELD_DEFAULTS.offerCooldownDays,
    ),
    offerMinStreak: num(doc?.offerMinStreak, SHIELD_DEFAULTS.offerMinStreak, 1),
    earnEveryPactWeeks: num(
      doc?.earnEveryPactWeeks,
      SHIELD_DEFAULTS.earnEveryPactWeeks,
    ),
  };
}

export function shieldCapFor(config: ShieldConfigView, isPremium: boolean) {
  return Math.max(0, isPremium ? config.capPlus : config.capFree);
}

/**
 * The merged pool. Before this existed a user held two separate stocks — a
 * Streak Freeze for the day and a Pact Shield for the week — so the first read
 * folds both into one count and blanks the originals on the next write.
 */
export function readShieldState(user: any): ShieldState {
  const raw = user?.quests?.shields;
  if (raw && typeof raw === 'object' && raw.merged) {
    const rescues: Partial<Record<ShieldSystem, number>> = {};
    const lastRescueDayKey: Partial<Record<ShieldSystem, string>> = {};
    for (const system of SHIELD_SYSTEMS) {
      const count = Math.max(0, Math.floor(Number(raw.rescues?.[system]) || 0));
      if (count) rescues[system] = count;
      const day = raw.lastRescueDayKey?.[system];
      if (typeof day === 'string' && day) lastRescueDayKey[system] = day;
    }
    return {
      count: Math.max(0, Math.floor(Number(raw.count) || 0)),
      lastRescueDayKey,
      rescues,
      grantMonth: typeof raw.grantMonth === 'string' ? raw.grantMonth : '',
      offer: {
        lastShownDayKey:
          typeof raw.offer?.lastShownDayKey === 'string'
            ? raw.offer.lastShownDayKey
            : '',
        dismissals: Math.max(0, Math.floor(Number(raw.offer?.dismissals) || 0)),
        lastPurchaseDayKey:
          typeof raw.offer?.lastPurchaseDayKey === 'string'
            ? raw.offer.lastPurchaseDayKey
            : '',
      },
      merged: true,
    };
  }

  const legacyFreezes = Math.max(
    0,
    Math.floor(Number(user?.quests?.loginStreak?.freezes) || 0),
  );
  const legacyShields = Math.max(
    0,
    Math.floor(Number(user?.quests?.pactStreak?.shields) || 0),
  );
  return {
    count: legacyFreezes + legacyShields,
    lastRescueDayKey: {},
    rescues: {},
    grantMonth: '',
    offer: { ...EMPTY_OFFER },
    merged: true,
  };
}

/**
 * Writes the pool and clears both legacy stocks in the same update, so a
 * half-migrated document can never hand out the old shields a second time.
 */
export async function persistShieldState(userId: string, state: ShieldState) {
  await connectMongo();
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        'quests.shields': state,
        'quests.loginStreak.freezes': 0,
        'quests.pactStreak.shields': 0,
      },
    },
  );
}

/** Same write, against an already-loaded mongoose document. */
export function setShieldStateOn(userDoc: any, state: ShieldState) {
  userDoc.set('quests.shields', state);
  if (userDoc.quests?.loginStreak) userDoc.set('quests.loginStreak.freezes', 0);
  if (userDoc.quests?.pactStreak) userDoc.set('quests.pactStreak.shields', 0);
  userDoc.markModified('quests');
}

export function grantShields(
  state: ShieldState,
  config: ShieldConfigView,
  isPremium: boolean,
  amount: number,
): ShieldState {
  const cap = shieldCapFor(config, isPremium);
  return {
    ...state,
    count: Math.min(cap, state.count + Math.max(0, Math.floor(amount))),
  };
}

/**
 * The Plus perk: one shield a calendar month, on top of the higher cap. Free
 * users pass through untouched, and the month key means a lapsed subscriber
 * never back-pays for the months they were away.
 */
export function applyMonthlyGrant(
  state: ShieldState,
  config: ShieldConfigView,
  isPremium: boolean,
  todayKey: string,
): ShieldState {
  const month = todayKey.slice(0, 7);
  if (!isPremium || state.grantMonth === month) {
    // A downgrade still clamps: the Plus cap is higher than the free one.
    const cap = shieldCapFor(config, isPremium);
    if (state.count <= cap) return state;
    return { ...state, count: cap };
  }
  const granted = grantShields(state, config, isPremium, config.plusMonthlyGrant);
  return { ...granted, grantMonth: month };
}

/**
 * A shield covers one miss per system per cooldown window. Without this, a
 * user who never shows up could hold a streak forever on stock alone, and a
 * streak that cannot break stops meaning anything.
 */
export function canRescue(
  state: ShieldState,
  config: ShieldConfigView,
  system: ShieldSystem,
  todayKey: string,
): boolean {
  if (!config.isActive || state.count <= 0) return false;
  const last = state.lastRescueDayKey[system];
  if (!last) return true;
  return dayKeyDiff(last, todayKey) >= config.rescueCooldownDays;
}

export function consumeShield(
  state: ShieldState,
  system: ShieldSystem,
  todayKey: string,
): ShieldState {
  return {
    ...state,
    count: Math.max(0, state.count - 1),
    lastRescueDayKey: { ...state.lastRescueDayKey, [system]: todayKey },
    rescues: {
      ...state.rescues,
      [system]: (state.rescues[system] ?? 0) + 1,
    },
  };
}

export function cooldownEndsOn(
  state: ShieldState,
  config: ShieldConfigView,
  system: ShieldSystem,
  todayKey: string,
): string | null {
  const last = state.lastRescueDayKey[system];
  if (!last) return null;
  const elapsed = dayKeyDiff(last, todayKey);
  if (elapsed >= config.rescueCooldownDays) return null;
  const end = new Date(`${last}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + config.rescueCooldownDays);
  return end.toISOString().slice(0, 10);
}

/**
 * Whether the sheet may open by itself right now. Everything here is a reason
 * NOT to interrupt: the popup only earns its place when the user holds nothing,
 * has something real on the line, and hasn't already been asked recently.
 *
 * Repeat dismissals widen the window rather than muting it forever — someone
 * who says no twice is not in the market this week, but may be in a month.
 */
export function shouldOfferShield(args: {
  state: ShieldState;
  config: ShieldConfigView;
  todayKey: string;
  reason: ShieldOffer['reason'];
  system: ShieldSystem;
  atStake: number;
}): ShieldOffer | null {
  const { state, config, todayKey, reason, system, atStake } = args;
  if (!config.isActive || state.count > 0) return null;
  if (atStake < config.offerMinStreak) return null;

  const backoff = Math.min(4, 2 ** Math.max(0, state.offer.dismissals - 1));
  const wait = config.offerCooldownDays * backoff;
  if (dayKeyDiff(state.offer.lastShownDayKey, todayKey) < wait) return null;
  // Someone who just bought is already covered for the window they paid for.
  if (
    dayKeyDiff(state.offer.lastPurchaseDayKey, todayKey) <
    config.offerCooldownDays
  ) {
    return null;
  }

  return { reason, system, atStake };
}

export function markOfferShown(
  state: ShieldState,
  todayKey: string,
): ShieldState {
  return {
    ...state,
    offer: { ...state.offer, lastShownDayKey: todayKey },
  };
}

export function markOfferDismissed(state: ShieldState): ShieldState {
  return {
    ...state,
    offer: { ...state.offer, dismissals: state.offer.dismissals + 1 },
  };
}

export function markOfferPurchased(
  state: ShieldState,
  todayKey: string,
): ShieldState {
  return {
    ...state,
    offer: { ...state.offer, dismissals: 0, lastPurchaseDayKey: todayKey },
  };
}

export function buildShieldView(args: {
  state: ShieldState;
  config: ShieldConfigView;
  isPremium: boolean;
  todayKey: string;
  offer?: ShieldOffer | null;
}): ShieldView {
  const { state, config, isPremium, todayKey, offer = null } = args;
  const cooldowns: Partial<Record<ShieldSystem, string>> = {};
  for (const system of SHIELD_SYSTEMS) {
    const ends = cooldownEndsOn(state, config, system, todayKey);
    if (ends) cooldowns[system] = ends;
  }
  return {
    isActive: config.isActive,
    count: state.count,
    cap: shieldCapFor(config, isPremium),
    priceFlies: config.priceFlies,
    twoPackPriceFlies: config.twoPackPriceFlies,
    isPremium,
    cooldowns,
    offer,
  };
}
