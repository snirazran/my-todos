import { randomUUID } from 'crypto';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import LoginStreakConfigModel, {
  LOGIN_STREAK_CONFIG_ID,
  DEFAULT_GOAL_TIERS,
  DEFAULT_REPEAT_PAYOUT_PERCENTS,
  DEFAULT_REPEAT_PAYOUT_FLOOR_PERCENT,
  type LoginStreakConfigDoc,
} from '@/lib/models/LoginStreakConfig';
import {
  applyMonthlyGrant,
  canRescue,
  consumeShield,
  grantShields,
  loadShieldConfig,
  markOfferShown,
  persistShieldState,
  readShieldState,
  setShieldStateOn,
  shieldCapFor,
  shouldOfferShield,
} from '@/lib/shields/engine';
import type { ShieldConfigView, ShieldOffer, ShieldState } from '@/lib/shields/types';
import { previousDayKey } from '@/lib/quests/streak';
import { isPremiumUser } from '@/lib/quests/engine';
import { recordDoubleableClaim } from '@/lib/rewards/adDouble';
import { getZonedToday } from '@/lib/utils';
import type { QuestReward } from '@/lib/quests/types';
import { findTaskStreaksAtRisk } from './taskStreaks';
import { getRewardPool } from '@/lib/skins/gifts';
import type {
  SkinRarity,
  CheckInResult,
  LoginStreakGoal,
  LoginStreakReward,
  LoginStreakRewardEvent,
  LoginStreakRewardSummary,
  LoginStreakState,
  LoginStreakView,
  RescueMethod,
  RescueResult,
  StreakRescue,
  TaskStreakAtRisk,
} from './types';

const SHIELD_HISTORY_LIMIT = 14;
const PROTECTED_HISTORY_LIMIT = 60;
export const SAVER_MUTE_THRESHOLD = 7;
export const RESCUE_MIN_STREAK = 3;
export const RESCUE_MIN_TASK_STREAK = 3;
export const RESCUE_COOLDOWN_DAYS = 7;

export function rescueAdsRequired(previousCount: number): number {
  if (previousCount >= 30) return 3;
  if (previousCount >= 7) return 2;
  return 1;
}

function dayKeyDiff(fromKey: string, toKey: string): number {
  return Math.round(
    (Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) /
      86400000,
  );
}

function readRescue(raw: any): StreakRescue | null {
  if (
    !raw ||
    typeof raw.id !== 'string' ||
    typeof raw.previousCount !== 'number' ||
    typeof raw.offeredDayKey !== 'string'
  ) {
    return null;
  }
  return {
    id: raw.id,
    previousCount: Math.max(0, Math.floor(raw.previousCount)),
    taskStreaks: Array.isArray(raw.taskStreaks)
      ? raw.taskStreaks
          .filter(
            (t: any) =>
              typeof t?.taskId === 'string' && typeof t?.count === 'number',
          )
          .map((t: any) => ({
            taskId: t.taskId,
            text: typeof t.text === 'string' ? t.text : '',
            count: Math.max(0, Math.floor(t.count)),
          }))
      : [],
    missedDayKey:
      typeof raw.missedDayKey === 'string'
        ? raw.missedDayKey
        : previousDayKey(raw.offeredDayKey),
    offeredDayKey: raw.offeredDayKey,
    adsRequired: Math.max(0, Math.floor(raw.adsRequired ?? 0)),
    adsWatched: Math.max(0, Math.floor(raw.adsWatched ?? 0)),
    adEligible: raw.adEligible !== false,
    dismissed: raw.dismissed === true,
  };
}

/**
 * Days covered by a shield or an ad rescue. Cover is day-scoped, not
 * habit-scoped: one protected day bridges the login streak AND every habit
 * streak scheduled that day.
 */
export async function loadProtectedDays(
  userId: string,
): Promise<Set<string>> {
  await connectMongo();
  const doc = await UserModel.findById(userId, {
    'quests.loginStreak.protectedDayKeys': 1,
  }).lean<any>();
  const raw = doc?.quests?.loginStreak?.protectedDayKeys;
  return new Set<string>(
    Array.isArray(raw) ? raw.filter((k: unknown) => typeof k === 'string') : [],
  );
}

export async function loadLoginStreakConfig(): Promise<LoginStreakConfigDoc> {
  const doc = await LoginStreakConfigModel.findOne({
    configId: LOGIN_STREAK_CONFIG_ID,
  }).lean<LoginStreakConfigDoc | null>();
  return {
    configId: LOGIN_STREAK_CONFIG_ID,
    isActive: doc?.isActive ?? true,
    saverMinStreak: Math.max(1, doc?.saverMinStreak ?? 2),
    repeatPayoutPercents:
      doc?.repeatPayoutPercents && doc.repeatPayoutPercents.length > 0
        ? doc.repeatPayoutPercents
        : [...DEFAULT_REPEAT_PAYOUT_PERCENTS],
    repeatPayoutFloorPercent:
      typeof doc?.repeatPayoutFloorPercent === 'number'
        ? doc.repeatPayoutFloorPercent
        : DEFAULT_REPEAT_PAYOUT_FLOOR_PERCENT,
    repeatItemsAtFullOnly: doc?.repeatItemsAtFullOnly !== false,
    goalTiers:
      doc?.goalTiers && doc.goalTiers.length > 0
        ? doc.goalTiers
        : DEFAULT_GOAL_TIERS,
    createdAt: doc?.createdAt ?? new Date(),
    updatedAt: doc?.updatedAt ?? new Date(),
  };
}

export function readLoginStreakState(user: any): LoginStreakState {
  const raw = user?.quests?.loginStreak;
  const goal =
    raw?.goal && typeof raw.goal.days === 'number'
      ? {
          days: Math.max(1, Math.floor(raw.goal.days)),
          startCount: Math.max(0, Math.floor(raw.goal.startCount ?? 0)),
          startDayKey:
            typeof raw.goal.startDayKey === 'string' ? raw.goal.startDayKey : '',
        }
      : null;
  return {
    count: Math.max(0, Math.floor(raw?.count ?? 0)),
    lastDayKey: typeof raw?.lastDayKey === 'string' ? raw.lastDayKey : '',
    longestStreak: Math.max(0, Math.floor(raw?.longestStreak ?? 0)),
    shieldedDayKeys: Array.isArray(raw?.shieldedDayKeys)
      ? raw.shieldedDayKeys.filter((k: unknown) => typeof k === 'string')
      : Array.isArray(raw?.freezeUsedDayKeys)
        ? raw.freezeUsedDayKeys.filter((k: unknown) => typeof k === 'string')
        : [],
    protectedDayKeys: Array.isArray(raw?.protectedDayKeys)
      ? raw.protectedDayKeys.filter((k: unknown) => typeof k === 'string')
      : [],
    goal,
    goalsCompleted: Array.isArray(raw?.goalsCompleted)
      ? raw.goalsCompleted.filter(
          (g: any) => typeof g?.days === 'number' && typeof g?.dayKey === 'string',
        )
      : [],
    rescue: readRescue(raw?.rescue),
    lastRescueDayKey:
      typeof raw?.lastRescueDayKey === 'string' ? raw.lastRescueDayKey : '',
    notif: {
      lastSaverSentDayKey:
        typeof raw?.notif?.lastSaverSentDayKey === 'string'
          ? raw.notif.lastSaverSentDayKey
          : '',
      saverIgnoredCount: Math.max(
        0,
        Math.floor(raw?.notif?.saverIgnoredCount ?? 0),
      ),
      freezePushSentForDayKey:
        typeof raw?.notif?.freezePushSentForDayKey === 'string'
          ? raw.notif.freezePushSentForDayKey
          : '',
    },
  };
}

export function computeGap(lastDayKey: string, todayKey: string): number {
  if (!lastDayKey || lastDayKey >= todayKey) return 0;
  let gap = 0;
  let cursor = previousDayKey(todayKey);
  while (cursor > lastDayKey && gap <= SHIELD_HISTORY_LIMIT) {
    gap += 1;
    cursor = previousDayKey(cursor);
  }
  return gap;
}

/**
 * Auto-consumes one shield to cover a single missed day. Deliberately capped at
 * a one-day gap: the shield's rescue cooldown allows one save per system per
 * window, so a longer absence was never coverable no matter what is in stock.
 *
 * Nothing here is armed or equipped by the user — a shield the player forgot to
 * turn on is worse than no shield, because it turns a rescue into a betrayal.
 */
export async function applyShieldCoverage(args: {
  userId: string;
  state: LoginStreakState;
  shieldState: ShieldState;
  shieldConfig: ShieldConfigView;
  todayKey: string;
}): Promise<{
  state: LoginStreakState;
  shieldState: ShieldState;
  consumed: string[];
} | null> {
  const { userId, state, shieldState, shieldConfig, todayKey } = args;
  if (state.count <= 0 || !state.lastDayKey) return null;
  if (computeGap(state.lastDayKey, todayKey) !== 1) return null;
  if (!canRescue(shieldState, shieldConfig, 'login', todayKey)) return null;

  const missedDay = previousDayKey(todayKey);
  const res = await UserModel.updateOne(
    {
      _id: userId,
      'quests.loginStreak.lastDayKey': state.lastDayKey,
    },
    {
      $set: { 'quests.loginStreak.lastDayKey': missedDay },
      $push: {
        'quests.loginStreak.shieldedDayKeys': {
          $each: [missedDay],
          $slice: -SHIELD_HISTORY_LIMIT,
        },
        'quests.loginStreak.protectedDayKeys': {
          $each: [missedDay],
          $slice: -PROTECTED_HISTORY_LIMIT,
        },
      },
    },
  );
  if (res.modifiedCount === 0) return null;

  const nextShields = consumeShield(shieldState, 'login', todayKey);
  await persistShieldState(userId, nextShields);

  return {
    state: {
      ...state,
      lastDayKey: missedDay,
      shieldedDayKeys: [...state.shieldedDayKeys, missedDay].slice(
        -SHIELD_HISTORY_LIMIT,
      ),
      protectedDayKeys: [...state.protectedDayKeys, missedDay].slice(
        -PROTECTED_HISTORY_LIMIT,
      ),
    },
    shieldState: nextShields,
    consumed: [missedDay],
  };
}

export function buildLoginStreakView(
  state: LoginStreakState,
  config: LoginStreakConfigDoc,
  todayKey: string,
  shields: { count: number; cap: number },
): LoginStreakView {
  const gap = computeGap(state.lastDayKey, todayKey);
  const checkedInToday = state.lastDayKey === todayKey;
  const alive =
    state.count > 0 &&
    (checkedInToday || gap === 0 || (gap === 1 && shields.count > 0));
  return {
    count: alive ? state.count : 0,
    longestStreak: state.longestStreak,
    lastDayKey: state.lastDayKey,
    checkedInToday,
    alive,
    shields: shields.count,
    shieldCap: shields.cap,
    shieldedDayKeys: state.shieldedDayKeys,
    protectedDayKeys: state.protectedDayKeys,
    goal: state.goal
      ? {
          ...state.goal,
          progress: Math.max(
            0,
            Math.min(state.goal.days, state.count - state.goal.startCount),
          ),
          // Nunes & Drèze: a card with the first stamp already filled gets
          // finished far more often. Making the pledge IS that stamp, so a
          // 7-day promise renders as 8 steps with step one already earned.
          stepCount: state.goal.days + 1,
          stepsFilled:
            1 +
            Math.max(
              0,
              Math.min(state.goal.days, state.count - state.goal.startCount),
            ),
          payoutPercent: repeatPayoutPercent(
            config,
            repeatIndexFor(state.goalsCompleted, state.goal.days),
          ),
        }
      : null,
    goalTiers: config.goalTiers.map((tier) => {
      const repeatIndex = repeatIndexFor(state.goalsCompleted, tier.days);
      return {
        ...tier,
        repeatIndex,
        payoutPercent: repeatPayoutPercent(config, repeatIndex),
      };
    }),
    nextTierDays: nextTierDaysFor(config, state.goalsCompleted),
  };
}

function splitRewards(rewards: LoginStreakReward[]) {
  const questRewards: QuestReward[] = [];
  const skinRolls: { minRarity: SkinRarity }[] = [];
  let shields = 0;
  for (const reward of rewards) {
    // `STREAK_FREEZE` is what tiers authored before the merge still say.
    if (reward.type === 'SHIELD' || (reward.type as string) === 'STREAK_FREEZE') {
      shields += Math.max(1, Math.floor((reward as any).amount ?? 1));
    } else if (reward.type === 'SKIN_ROLL') {
      skinRolls.push({ minRarity: reward.minRarity });
    } else {
      questRewards.push(reward as QuestReward);
    }
  }
  return { questRewards, shields, skinRolls };
}

/**
 * Completions of this exact rung since the user last kept a longer one.
 * Stepping up clears the count, which is what makes the ladder worth climbing.
 */
export function repeatIndexFor(
  goalsCompleted: { days: number; dayKey: string }[],
  days: number,
): number {
  let repeats = 0;
  for (let i = goalsCompleted.length - 1; i >= 0; i -= 1) {
    const entry = goalsCompleted[i];
    if (entry.days > days) break;
    if (entry.days === days) repeats += 1;
  }
  return repeats;
}

export function repeatPayoutPercent(
  config: Pick<
    LoginStreakConfigDoc,
    'repeatPayoutPercents' | 'repeatPayoutFloorPercent'
  >,
  repeatIndex: number,
): number {
  const ladder =
    config.repeatPayoutPercents?.length > 0
      ? config.repeatPayoutPercents
      : DEFAULT_REPEAT_PAYOUT_PERCENTS;
  const floor = Math.max(
    1,
    Math.min(100, config.repeatPayoutFloorPercent ?? DEFAULT_REPEAT_PAYOUT_FLOOR_PERCENT),
  );
  const raw = repeatIndex < ladder.length ? ladder[repeatIndex] : floor;
  return Math.max(floor, Math.min(100, Math.round(raw)));
}

/** The rung to offer next: one above the longest the user has ever kept. */
export function nextTierDaysFor(
  config: Pick<LoginStreakConfigDoc, 'goalTiers'>,
  goalsCompleted: { days: number; dayKey: string }[],
): number | null {
  const tiers = [...(config.goalTiers ?? [])].sort((a, b) => a.days - b.days);
  if (tiers.length === 0) return null;
  const best = goalsCompleted.reduce((max, entry) => Math.max(max, entry.days), 0);
  return tiers.find((tier) => tier.days > best)?.days ?? tiers[tiers.length - 1].days;
}

function scaleFlyRewardsByPercent(
  rewards: QuestReward[],
  percent: number,
): QuestReward[] {
  if (percent >= 100) return rewards;
  const factor = percent / 100;
  return rewards.map((reward) => {
    if (reward.type !== 'FLIES') return reward;
    const scale = (value: number | undefined) =>
      typeof value === 'number' ? Math.max(1, Math.round(value * factor)) : value;
    return {
      ...reward,
      amount: scale(reward.amount),
      minAmount: scale(reward.minAmount),
      maxAmount: scale(reward.maxAmount),
    };
  });
}

const RARITY_ORDER: SkinRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

/**
 * Draws one wearable at or above the promised rarity, preferring something the
 * user does not already own — a "guaranteed Epic" that hands back a duplicate
 * keeps the letter of the promise and breaks its spirit.
 */
async function rollGuaranteedSkin(
  user: any,
  minRarity: SkinRarity,
): Promise<string | null> {
  const floor = Math.max(0, RARITY_ORDER.indexOf(minRarity));
  const pool = (await getRewardPool()).filter(
    (prize) =>
      prize.kind === 'item' &&
      prize.slot !== 'container' &&
      RARITY_ORDER.indexOf(prize.rarity) >= floor,
  );
  if (pool.length === 0) return null;
  const inventory = user.wardrobe?.inventory ?? {};
  const unowned = pool.filter((prize) => (inventory[prize.id] ?? 0) <= 0);
  const draw = unowned.length > 0 ? unowned : pool;
  const prize = draw[Math.floor(Math.random() * draw.length)];
  // An epic+ from here clears the shared gift Luck counter, same as one won
  // from a box or a trade-up. Mutated in memory; the caller saves.
  const { clearGiftLuck, readGiftLuck } = await import('@/lib/skins/giftRules');
  user.giftLuck = {
    ...clearGiftLuck(readGiftLuck(user.giftLuck), prize.rarity),
    updatedAt: new Date(),
  };
  user.markModified?.('giftLuck');
  return prize.id;
}

function grantQuestRewards(
  user: any,
  rewards: QuestReward[],
  multiplier: number,
): LoginStreakRewardSummary {
  if (!user.wardrobe) {
    user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
  }
  user.wardrobe.inventory = user.wardrobe.inventory ?? {};
  user.wardrobe.unseenItems = user.wardrobe.unseenItems ?? [];
  user.wardrobe.flies = user.wardrobe.flies ?? 0;
  if (!user.wardrobe.backgrounds) {
    user.wardrobe.backgrounds = { equipped: null, inventory: {} };
  }
  user.wardrobe.backgrounds.inventory =
    user.wardrobe.backgrounds.inventory ?? {};

  const summary: LoginStreakRewardSummary = {
    fliesGranted: 0,
    flyBalanceBefore: user.wardrobe.flies,
    flyBalanceAfter: user.wardrobe.flies,
    grantedItemIds: [],
    grantedBackgroundIds: [],
    shieldsGranted: 0,
  };

  for (const reward of rewards) {
    if (reward.type === 'FLIES') {
      const base =
        reward.amountMode === 'random'
          ? reward.maxAmount ?? reward.minAmount ?? 0
          : reward.amount ?? 0;
      const amount = base * multiplier;
      user.wardrobe.flies += amount;
      summary.fliesGranted += amount;
      summary.flyBalanceAfter = user.wardrobe.flies;
    } else if (reward.type === 'BACKGROUND' && reward.backgroundId) {
      const inv = user.wardrobe.backgrounds.inventory;
      inv[reward.backgroundId] = (inv[reward.backgroundId] ?? 0) + 1;
      summary.grantedBackgroundIds.push(reward.backgroundId);
    } else if (reward.itemId) {
      // Doubling never means a second box: a Plus gift is opened twice instead,
      // so the rung hands over exactly the boxes it promises.
      const copies = Math.max(1, reward.amount ?? 1);
      for (let i = 0; i < copies; i += 1) {
        user.wardrobe.inventory[reward.itemId] =
          (user.wardrobe.inventory[reward.itemId] ?? 0) + 1;
        user.wardrobe.unseenItems.push(reward.itemId);
        summary.grantedItemIds.push(reward.itemId);
      }
    }
  }

  return summary;
}

async function applyStreakRewardGrants(args: {
  user: any;
  next: LoginStreakState;
  config: LoginStreakConfigDoc;
  shieldConfig: ShieldConfigView;
  shieldState: ShieldState;
  todayKey: string;
  goalCompleted: LoginStreakGoal | null;
}): Promise<{
  event: LoginStreakRewardEvent | null;
  shieldState: ShieldState;
}> {
  const { user, next, config, shieldConfig, todayKey, goalCompleted } = args;
  if (!goalCompleted) return { event: null, shieldState: args.shieldState };

  const isPremium = isPremiumUser(user.toObject());
  const multiplier = isPremium ? 2 : 1;
  const tier = config.goalTiers.find((t) => t.days === goalCompleted.days);

  // Decay is read from the history BEFORE this completion is appended, so the
  // first keep of a rung pays full price.
  const repeatIndex = repeatIndexFor(next.goalsCompleted, goalCompleted.days);
  const payoutPercent = repeatPayoutPercent(config, repeatIndex);
  const atFullPrice = payoutPercent >= 100;
  const itemsWithheld = !atFullPrice && config.repeatItemsAtFullOnly;

  const { questRewards, shields, skinRolls } = splitRewards(tier?.rewards ?? []);
  const payableQuestRewards = scaleFlyRewardsByPercent(
    itemsWithheld
      ? questRewards.filter((reward) => reward.type === 'FLIES')
      : questRewards,
    payoutPercent,
  );
  const summary = grantQuestRewards(user, payableQuestRewards, multiplier);

  const payableShields = itemsWithheld ? 0 : shields;
  summary.shieldsGranted = payableShields;

  if (!itemsWithheld) {
    for (const roll of skinRolls) {
      const itemId = await rollGuaranteedSkin(user, roll.minRarity);
      if (!itemId) continue;
      user.wardrobe.inventory[itemId] = (user.wardrobe.inventory[itemId] ?? 0) + 1;
      user.wardrobe.unseenItems.push(itemId);
      summary.grantedItemIds.push(itemId);
    }
  }

  next.goalsCompleted = [
    ...next.goalsCompleted,
    { days: goalCompleted.days, dayKey: todayKey },
  ];
  next.goal = null;

  const shieldState = payableShields
    ? grantShields(args.shieldState, shieldConfig, isPremium, payableShields)
    : args.shieldState;

  // Plus took its double above; a free player takes the same one from an ad.
  recordDoubleableClaim(user, summary);

  return {
    event: {
      days: goalCompleted.days,
      rewardSummary: summary,
      payoutPercent,
      itemsWithheld,
      nextTierDays: nextTierDaysFor(config, next.goalsCompleted),
    },
    shieldState,
  };
}

export function activeRescueForDay(
  rescue: StreakRescue | null,
  todayKey: string,
): StreakRescue | null {
  if (!rescue || rescue.offeredDayKey !== todayKey || rescue.dismissed) {
    return null;
  }
  return rescue;
}

/**
 * Builds the day-scoped rescue offer for `missedDayKey`. Only reached when no
 * shield covered the miss, so the ad run is the last thing standing between the
 * user and a broken streak. Returns null when nothing broke or when the ad
 * cooldown is still running — an offer with no action is just a funeral notice.
 */
function buildRescueOffer(args: {
  user: any;
  state: LoginStreakState;
  todayKey: string;
  missedDayKey: string;
  loginCountAtRisk: number;
  taskStreaks: TaskStreakAtRisk[];
}): StreakRescue | null {
  const {
    user,
    state,
    todayKey,
    missedDayKey,
    loginCountAtRisk,
    taskStreaks,
  } = args;

  if (loginCountAtRisk <= 0 && taskStreaks.length === 0) return null;

  const adEligible =
    !state.lastRescueDayKey ||
    dayKeyDiff(state.lastRescueDayKey, todayKey) >= RESCUE_COOLDOWN_DAYS;
  if (!adEligible) return null;

  const largest = Math.max(
    loginCountAtRisk,
    ...taskStreaks.map((t) => t.count),
    0,
  );

  return {
    id: randomUUID(),
    previousCount: loginCountAtRisk,
    taskStreaks,
    missedDayKey,
    offeredDayKey: todayKey,
    adsRequired: isPremiumUser(user.toObject()) ? 0 : rescueAdsRequired(largest),
    adsWatched: 0,
    adEligible,
  };
}

export async function performCheckIn(args: {
  userId: string;
  timezone: string;
}): Promise<CheckInResult> {
  const { userId, timezone } = args;
  await connectMongo();

  const [user, config, shieldConfig] = await Promise.all([
    UserModel.findById(userId),
    loadLoginStreakConfig(),
    loadShieldConfig(),
  ]);
  if (!user) throw new Error('User not found');

  const todayKey = getZonedToday(timezone);
  const userObject = user.toObject();
  const state = readLoginStreakState(userObject);
  const isPremium = isPremiumUser(userObject);

  const storedShields = readShieldState(userObject);
  let shieldState = applyMonthlyGrant(
    storedShields,
    shieldConfig,
    isPremium,
    todayKey,
  );
  // The pool is written on any change, including the first read of a document
  // that still held the two separate legacy stocks.
  if (
    shieldState !== storedShields ||
    !(userObject as any)?.quests?.shields?.merged
  ) {
    await persistShieldState(userId, shieldState);
  }
  const shieldSnapshot = () => ({
    count: shieldState.count,
    cap: shieldCapFor(shieldConfig, isPremium),
  });

  if (!config.isActive) {
    return {
      active: false,
      extended: false,
      previousCount: state.count,
      view: null,
      shieldConsumedDays: [],
      goalEvent: null,
      rescue: null,
      shieldOffer: null,
    };
  }

  if (state.lastDayKey === todayKey) {
    return {
      active: true,
      extended: false,
      previousCount: state.count,
      view: buildLoginStreakView(state, config, todayKey, shieldSnapshot()),
      shieldConsumedDays: [],
      goalEvent: null,
      rescue: activeRescueForDay(state.rescue, todayKey),
      shieldOffer: null,
    };
  }

  const coverage = await applyShieldCoverage({
    userId,
    state,
    shieldState,
    shieldConfig,
    todayKey,
  });
  if (coverage) shieldState = coverage.shieldState;
  const freshState = coverage?.state ?? state;
  const yesterdayKey = previousDayKey(todayKey);
  const previousCount = freshState.count;
  const newCount =
    freshState.lastDayKey === yesterdayKey ? freshState.count + 1 : 1;

  const next: LoginStreakState = {
    ...freshState,
    count: newCount,
    lastDayKey: todayKey,
    longestStreak: Math.max(freshState.longestStreak, newCount),
    rescue: activeRescueForDay(freshState.rescue, todayKey),
  };

  const loginBroke =
    newCount === 1 &&
    previousCount >= RESCUE_MIN_STREAK &&
    computeGap(freshState.lastDayKey, todayKey) === 1;

  const taskStreaksAtRisk = await findTaskStreaksAtRisk({
    userId,
    missedDayKey: yesterdayKey,
    timezone,
    protectedDays: new Set(freshState.protectedDayKeys),
    minStreak: RESCUE_MIN_TASK_STREAK,
  });

  // Saver mute accounting. The counter tracks warnings that DIDN'T work, not
  // app opens: opening the app saves a login streak but does nothing for a
  // habit, so resetting on check-in let an abandoned habit nag forever. A day
  // where nothing broke forgives the counter (and un-mutes a returning user).
  const somethingBroke = loginBroke || taskStreaksAtRisk.length > 0;
  const warnedYesterday = freshState.notif.lastSaverSentDayKey === yesterdayKey;
  next.notif = {
    ...freshState.notif,
    saverIgnoredCount: !somethingBroke
      ? 0
      : warnedYesterday
        ? freshState.notif.saverIgnoredCount + 1
        : freshState.notif.saverIgnoredCount,
  };

  next.rescue =
    buildRescueOffer({
      user,
      state: freshState,
      todayKey,
      missedDayKey: yesterdayKey,
      loginCountAtRisk: loginBroke ? previousCount : 0,
      taskStreaks: taskStreaksAtRisk,
    }) ?? next.rescue;

  const goalCompleted =
    next.goal && newCount - next.goal.startCount >= next.goal.days
      ? next.goal
      : null;

  let goalEvent: LoginStreakRewardEvent | null = null;

  if (goalCompleted) {
    const granted = await applyStreakRewardGrants({
      user,
      next,
      config,
      shieldConfig,
      shieldState,
      todayKey,
      goalCompleted,
    });
    goalEvent = granted.event;
    shieldState = granted.shieldState;

    const currentQuests =
      typeof (user as any).quests === 'object' && (user as any).quests
        ? (user as any).quests
        : {};
    (user as any).quests = { ...currentQuests, loginStreak: next };
    setShieldStateOn(user, shieldState);
    user.markModified('wardrobe');
    await user.save();
  } else {
    // The guard is optimistic concurrency: only write if nobody else moved the
    // streak since it was read. "Never checked in" has three shapes on disk —
    // subdocument absent, null, or present without a lastDayKey — and matching
    // on the missing key covers all three, where `$exists: false` on the
    // subdocument itself missed the last one and stranded the streak at 0.
    const res = await UserModel.updateOne(
      {
        _id: userId,
        $or: [
          { 'quests.loginStreak.lastDayKey': freshState.lastDayKey },
          ...(freshState.lastDayKey
            ? []
            : [{ 'quests.loginStreak.lastDayKey': { $exists: false } }]),
        ],
      },
      { $set: { 'quests.loginStreak': next } },
    );
    if (res.modifiedCount === 0) {
      const current = await UserModel.findById(userId).lean();
      const currentState = readLoginStreakState(current);
      return {
        active: true,
        extended: currentState.lastDayKey === todayKey,
        previousCount,
        view: buildLoginStreakView(
          currentState,
          config,
          todayKey,
          shieldSnapshot(),
        ),
        shieldConsumedDays: [],
        goalEvent: null,
        rescue: activeRescueForDay(currentState.rescue, todayKey),
        shieldOffer: null,
      };
    }
  }

  // A miss that nothing covered is the one moment the offer has earned: the
  // user just watched a streak break for want of the thing being offered.
  // Everything else about whether to actually interrupt lives in the governor.
  let shieldOffer: ShieldOffer | null = null;
  if (!coverage && somethingBroke) {
    shieldOffer = shouldOfferShield({
      state: shieldState,
      config: shieldConfig,
      todayKey,
      reason: 'missed',
      system: 'login',
      atStake: Math.max(
        loginBroke ? previousCount : 0,
        ...taskStreaksAtRisk.map((t) => t.count),
        0,
      ),
    });
    if (shieldOffer) {
      shieldState = markOfferShown(shieldState, todayKey);
      await persistShieldState(userId, shieldState);
    }
  }

  return {
    active: true,
    extended: true,
    previousCount,
    view: buildLoginStreakView(next, config, todayKey, shieldSnapshot()),
    shieldConsumedDays: coverage?.consumed ?? [],
    goalEvent,
    rescue: next.rescue,
    shieldOffer,
  };
}

export async function dismissRescue(args: {
  userId: string;
  rescueId: string;
}): Promise<{ dismissed: boolean }> {
  const { userId, rescueId } = args;
  await connectMongo();
  const res = await UserModel.updateOne(
    { _id: userId, 'quests.loginStreak.rescue.id': rescueId },
    { $set: { 'quests.loginStreak.rescue.dismissed': true } },
  );
  return { dismissed: res.matchedCount > 0 };
}

export async function performRescue(args: {
  userId: string;
  timezone: string;
  rescueId: string;
  method: RescueMethod;
}): Promise<RescueResult> {
  const { userId, timezone, rescueId } = args;
  await connectMongo();

  const [user, config, shieldConfig] = await Promise.all([
    UserModel.findById(userId),
    loadLoginStreakConfig(),
    loadShieldConfig(),
  ]);
  if (!user) throw new Error('User not found');

  const todayKey = getZonedToday(timezone);
  const userObject = user.toObject();
  const state = readLoginStreakState(userObject);
  const isPremium = isPremiumUser(userObject);
  let shieldState = readShieldState(userObject);
  const shieldSnapshot = () => ({
    count: shieldState.count,
    cap: shieldCapFor(shieldConfig, isPremium),
  });
  const rescue = state.rescue;

  if (
    !config.isActive ||
    !rescue ||
    rescue.id !== rescueId ||
    rescue.offeredDayKey !== todayKey ||
    state.lastDayKey !== todayKey ||
    !rescue.adEligible
  ) {
    return {
      granted: false,
      completed: false,
      rescue: null,
      view: config.isActive
        ? buildLoginStreakView(state, config, todayKey, shieldSnapshot())
        : null,
      goalEvent: null,
      error: 'expired',
    };
  }

  const adsRequired = isPremium ? 0 : rescue.adsRequired;
  const adsWatched = rescue.adsWatched + 1;
  if (adsWatched < adsRequired) {
    const updated: StreakRescue = { ...rescue, adsWatched };
    await UserModel.updateOne(
      { _id: userId, 'quests.loginStreak.rescue.id': rescue.id },
      { $set: { 'quests.loginStreak.rescue': updated } },
    );
    return {
      granted: true,
      completed: false,
      rescue: updated,
      view: buildLoginStreakView(
        { ...state, rescue: updated },
        config,
        todayKey,
        shieldSnapshot(),
      ),
      goalEvent: null,
    };
  }

  const loginRestored = rescue.previousCount > 0;
  const newCount = loginRestored ? rescue.previousCount + 1 : state.count;
  const next: LoginStreakState = {
    ...state,
    count: newCount,
    longestStreak: Math.max(state.longestStreak, newCount),
    protectedDayKeys: [...state.protectedDayKeys, rescue.missedDayKey].slice(
      -PROTECTED_HISTORY_LIMIT,
    ),
    rescue: null,
    lastRescueDayKey: todayKey,
  };

  const goalCompleted =
    loginRestored && next.goal && newCount - next.goal.startCount >= next.goal.days
      ? next.goal
      : null;
  const granted = await applyStreakRewardGrants({
    user,
    next,
    config,
    shieldConfig,
    shieldState,
    todayKey,
    goalCompleted,
  });
  const goalEvent = granted.event;
  shieldState = granted.shieldState;

  const currentQuests =
    typeof (user as any).quests === 'object' && (user as any).quests
      ? (user as any).quests
      : {};
  (user as any).quests = { ...currentQuests, loginStreak: next };
  setShieldStateOn(user, shieldState);
  user.markModified('wardrobe');
  await user.save();

  return {
    granted: true,
    completed: true,
    rescue: null,
    view: buildLoginStreakView(next, config, todayKey, shieldSnapshot()),
    goalEvent,
  };
}
