import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import QuestStreakConfigModel, {
  STREAK_CONFIG_ID,
  SWEEP_DEFAULTS,
  SWEEP_DEFAULT_GOLDEN_ROLL,
  SWEEP_DEFAULT_MEGA_REWARDS,
  SWEEP_DEFAULT_STANDARD_ROLL,
  SWEEP_GOLDEN_MAX,
  SWEEP_GOLDEN_MIN,
  SWEEP_MEGA_MAX,
  type QuestStreakConfigDoc,
  type SweepRarityReward,
  type SweepReward,
  type SweepRollEntry,
} from '@/lib/models/QuestStreakConfig';
import { getZonedToday } from '@/lib/utils';
import { recordDoubleableClaim } from '@/lib/rewards/adDouble';
import { applyPactBonusRewards } from '@/lib/pact/grant';
import type { PactBonusReward } from '@/lib/pact/types';
import {
  loadShieldConfig,
  readShieldState,
  setShieldStateOn,
} from '@/lib/shields/engine';
import { isPremiumUser, syncQuestState } from './engine';
import type { DailyQuestProgressView, QuestReward } from './types';

export type SweepRollTier = 'standard' | 'golden';

/** One roll the user has earned and not yet spun. */
export type PendingSweepRoll = {
  dayKey: string;
  tier: SweepRollTier;
  /** Adds the configured mega rewards on top of whatever the table pays. */
  mega: boolean;
};

export type SweepState = {
  count: number;
  lastDayKey: string;
  /** Day the Clean Sweep flies were paid, so a re-sync never pays twice. */
  paidDayKey: string;
  pendingRolls: PendingSweepRoll[];
};

export type SweepView = {
  /** Consecutive Clean Sweep days, today included once it is swept. */
  count: number;
  todayComplete: boolean;
  objectivesDone: number;
  objectivesTotal: number;
  /** Authored amount, before the Plus multiplier. */
  cleanSweepFlies: number;
  cleanSweepPaidToday: boolean;
  pendingRolls: number;
  claimable: boolean;
  /** Tier of the roll waiting to be spun, or of the one today would earn. */
  nextTier: SweepRollTier;
  nextMega: boolean;
  /** Sweeps still to come before a golden roll is earned. 1 = the next one. */
  sweepsToGolden: number;
  goldenEveryDays: number;
  megaEveryDays: number;
  standardRoll: SweepRollEntry[];
  goldenRoll: SweepRollEntry[];
  megaRewards: SweepReward[];
};

export type SweepClaimResult = {
  fliesGranted: number;
  flyBalanceBefore: number;
  flyBalanceAfter: number;
  grantedItemIds: string[];
  grantedBackgroundIds: string[];
  shieldsGranted: number;
  doubleClaimId?: string;
  rolled: {
    tier: SweepRollTier;
    mega: boolean;
    reward: SweepReward | null;
    megaRewards: SweepReward[];
  };
};

export function previousDayKey(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function clampGoldenEveryDays(value: number) {
  return Math.min(
    SWEEP_GOLDEN_MAX,
    Math.max(SWEEP_GOLDEN_MIN, Math.floor(value) || SWEEP_DEFAULTS.goldenEveryDays),
  );
}

export function clampMegaEveryDays(value: number) {
  const days = Math.floor(value);
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.min(SWEEP_MEGA_MAX, days);
}

/**
 * Older docs carry the retired milestone shape (`streakLength` + one prize
 * pool) and none of the roll fields. Rather than migrate the collection, the
 * missing halves fall back to the shipped defaults on read, so an untouched
 * install behaves like a fresh one and an admin save writes the new shape.
 */
export function normalizeSweepConfig(config: QuestStreakConfigDoc | null) {
  const standardRoll = (config?.standardRoll ?? []).length
    ? (config!.standardRoll as SweepRollEntry[])
    : SWEEP_DEFAULT_STANDARD_ROLL;
  const goldenRoll = (config?.goldenRoll ?? []).length
    ? (config!.goldenRoll as SweepRollEntry[])
    : SWEEP_DEFAULT_GOLDEN_ROLL;
  const megaRewards = (config?.megaRewards ?? []).length
    ? (config!.megaRewards as SweepReward[])
    : SWEEP_DEFAULT_MEGA_REWARDS;
  return {
    isActive: config ? config.isActive !== false : SWEEP_DEFAULTS.isActive,
    cleanSweepFlies: Math.max(
      0,
      Math.floor(config?.cleanSweepFlies ?? SWEEP_DEFAULTS.cleanSweepFlies),
    ),
    goldenEveryDays: clampGoldenEveryDays(
      config?.goldenEveryDays ?? config?.streakLength ?? SWEEP_DEFAULTS.goldenEveryDays,
    ),
    megaEveryDays: clampMegaEveryDays(
      config?.megaEveryDays ?? SWEEP_DEFAULTS.megaEveryDays,
    ),
    megaRewards,
    standardRoll,
    goldenRoll,
  };
}

export type SweepConfigView = ReturnType<typeof normalizeSweepConfig>;

export async function loadStreakConfig() {
  return QuestStreakConfigModel.findOne({
    configId: STREAK_CONFIG_ID,
  }).lean<QuestStreakConfigDoc | null>();
}

export async function loadSweepConfig(): Promise<SweepConfigView> {
  return normalizeSweepConfig(await loadStreakConfig());
}

function readSweepState(user: UserDoc): SweepState {
  const raw = (user as any).quests?.dailyStreak;
  const pending = Array.isArray(raw?.pendingRolls) ? raw.pendingRolls : [];
  return {
    count: Math.max(0, Math.floor(raw?.count ?? 0)),
    lastDayKey: typeof raw?.lastDayKey === 'string' ? raw.lastDayKey : '',
    paidDayKey: typeof raw?.paidDayKey === 'string' ? raw.paidDayKey : '',
    pendingRolls: pending
      .map((entry: any): PendingSweepRoll => ({
        dayKey: typeof entry?.dayKey === 'string' ? entry.dayKey : '',
        tier: entry?.tier === 'golden' ? 'golden' : 'standard',
        mega: !!entry?.mega,
      }))
      .slice(-30),
  };
}

export function areDailyQuestsComplete(dailyQuests: DailyQuestProgressView[]) {
  if (dailyQuests.length === 0) return false;
  return dailyQuests.every((quest) =>
    quest.logic.every(
      (block) => block.progress >= Math.max(1, block.target),
    ),
  );
}

function countObjectives(dailyQuests: DailyQuestProgressView[]) {
  let done = 0;
  let total = 0;
  for (const quest of dailyQuests) {
    for (const block of quest.logic) {
      total += 1;
      if (block.progress >= Math.max(1, block.target)) done += 1;
    }
  }
  return { done, total };
}

/** Which table a given sweep-day number rolls on, and whether it megas. */
export function rollTierForDay(
  dayNumber: number,
  config: SweepConfigView,
): { tier: SweepRollTier; mega: boolean } {
  const mega =
    config.megaEveryDays > 0 && dayNumber % config.megaEveryDays === 0;
  const golden =
    mega ||
    (config.goldenEveryDays > 0 && dayNumber % config.goldenEveryDays === 0);
  return { tier: golden ? 'golden' : 'standard', mega };
}

/** Counted inclusively from the next sweep, so 1 means "sweep today and it is
 * golden" rather than "one sweep after the golden one". */
function sweepsUntilGolden(nextDayNumber: number, config: SweepConfigView) {
  const every = config.goldenEveryDays;
  if (every <= 0) return 0;
  return ((every - (nextDayNumber % every)) % every) + 1;
}

/**
 * Rolls the sweep streak forward for today: pays the Clean Sweep flies once and
 * queues the day's Reward Roll. Unspun rolls stay queued rather than expiring —
 * the roll is earned by the work, and losing it to a midnight the user never
 * saw would punish them for closing the app.
 *
 * Persists only when something changed. Returns null when the system is off.
 */
export async function syncDailySweep(args: {
  user: UserDoc;
  config: SweepConfigView;
  dailyQuests: DailyQuestProgressView[];
  todayKey: string;
}): Promise<SweepView | null> {
  const { user, config, dailyQuests, todayKey } = args;
  if (!config.isActive) return null;

  const state = readSweepState(user);
  const objectives = countObjectives(dailyQuests);
  const todayComplete = areDailyQuestsComplete(dailyQuests);
  const yesterdayKey = previousDayKey(todayKey);

  let next = state;
  if (todayComplete && state.lastDayKey !== todayKey) {
    const count = state.lastDayKey === yesterdayKey ? state.count + 1 : 1;
    const { tier, mega } = rollTierForDay(count, config);
    next = {
      count,
      lastDayKey: todayKey,
      paidDayKey: todayKey,
      pendingRolls: [
        ...state.pendingRolls,
        { dayKey: todayKey, tier, mega },
      ].slice(-30),
    };

    const flies =
      config.cleanSweepFlies > 0
        ? config.cleanSweepFlies * (isPremiumUser(user) ? 2 : 1)
        : 0;
    // Conditional on the day not already being recorded, so two syncs landing
    // together cannot both pay the bonus.
    const advanced = await UserModel.updateOne(
      {
        _id: (user as any)._id,
        'quests.dailyStreak.lastDayKey': { $ne: todayKey },
      },
      {
        $set: { 'quests.dailyStreak': next },
        ...(flies > 0 ? { $inc: { 'wardrobe.flies': flies } } : {}),
      },
    );
    if (advanced.modifiedCount === 0) {
      const fresh = await UserModel.findById((user as any)._id)
        .select('quests')
        .lean<UserDoc | null>();
      next = fresh ? readSweepState(fresh) : next;
    }
  }

  const streakAlive =
    next.lastDayKey === todayKey || next.lastDayKey === yesterdayKey;
  const count = streakAlive ? next.count : 0;
  // The next roll the user can still earn is always the day after the highest
  // one they already banked, swept today or not.
  const nextEarnDayNumber = count + 1;
  const upcoming =
    next.pendingRolls[0] ?? rollTierForDay(nextEarnDayNumber, config);

  return {
    count,
    todayComplete,
    objectivesDone: objectives.done,
    objectivesTotal: objectives.total,
    cleanSweepFlies: config.cleanSweepFlies,
    cleanSweepPaidToday: next.paidDayKey === todayKey,
    pendingRolls: next.pendingRolls.length,
    claimable: next.pendingRolls.length > 0,
    nextTier: upcoming.tier,
    nextMega: upcoming.mega,
    sweepsToGolden: sweepsUntilGolden(nextEarnDayNumber, config),
    goldenEveryDays: config.goldenEveryDays,
    megaEveryDays: config.megaEveryDays,
    standardRoll: config.standardRoll,
    goldenRoll: config.goldenRoll,
    megaRewards: config.megaRewards,
  };
}

/**
 * The catalog-backed half of a roll table — what the reward-image lookup can
 * resolve. Lily Pads and rarity draws have no catalog id and are drawn from
 * their own art in the UI.
 */
export function sweepRollRewards(table: SweepRollEntry[]): QuestReward[] {
  return table.flatMap((entry): QuestReward[] => {
    const reward = entry.reward;
    // A pinned rarity draw is a real item, so its art has to be looked up like
    // any other — without this the tile has no catalog entry and falls back to
    // a placeholder instead of rendering the outfit.
    if (reward.type === 'RARITY_ITEM') {
      const itemId = (reward as SweepRarityReward).itemId;
      return itemId ? [{ type: 'ITEM', itemId }] : [];
    }
    return reward.type === 'FLIES' ||
      reward.type === 'ITEM' ||
      reward.type === 'BOX' ||
      reward.type === 'BACKGROUND'
      ? [reward]
      : [];
  });
}

/** One weighted draw off a roll table. `chance` is relative, so it tolerates
 * tables an admin left summing to something other than 100. */
export function drawRollReward(table: SweepRollEntry[]): SweepReward | null {
  const entries = table.filter((entry) => (entry?.chance ?? 0) > 0 && entry.reward);
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, entry) => sum + entry.chance, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.chance;
    if (roll <= 0) return entry.reward;
  }
  return entries[entries.length - 1].reward;
}

/**
 * A guaranteed rarity the admin pinned to one outfit is just that outfit, so it
 * is handed over as a plain item grant instead of a draw. Left unpinned it goes
 * through as the rarity draw the pact ladder uses.
 */
function toPactBonusReward(reward: SweepReward): PactBonusReward {
  if (reward.type === 'RARITY_ITEM') {
    const { itemId, rarity, amount } = reward as SweepRarityReward;
    if (itemId) {
      return { type: 'ITEM', itemId, amount: Math.max(1, amount ?? 1) };
    }
    return { type: 'RARITY_ITEM', rarity, amount };
  }
  return reward as PactBonusReward;
}

export async function claimSweepRoll(args: {
  userId: string;
  timezone: string;
}): Promise<SweepClaimResult> {
  const { userId, timezone } = args;
  await connectMongo();

  const config = await loadSweepConfig();
  if (!config.isActive) {
    throw new Error('Reward rolls are not available right now');
  }

  // Roll the sweep forward first so a claim fired the instant the last daily
  // quest lands doesn't race the next quests fetch.
  const todayKey = getZonedToday(timezone);
  const dashboard = await syncQuestState({
    userId,
    timezone,
    includeCatalog: false,
    includeCategories: false,
  });
  await syncDailySweep({
    user: dashboard.user,
    config,
    dailyQuests: dashboard.dailyQuests,
    todayKey,
  });

  const user = await UserModel.findById(userId);
  if (!user) throw new Error('User not found');
  const state = readSweepState(user.toObject());
  const roll = state.pendingRolls[0];
  if (!roll) throw new Error('No reward roll ready yet');

  const isPremium = isPremiumUser(user.toObject());
  const table = roll.tier === 'golden' ? config.goldenRoll : config.standardRoll;
  const drawn = drawRollReward(table);
  const rewards: SweepReward[] = [
    ...(drawn ? [drawn] : []),
    ...(roll.mega ? config.megaRewards : []),
  ];

  const shieldConfig = await loadShieldConfig();
  const flyBalanceBefore = Math.max(0, Number(user.wardrobe?.flies) || 0);
  const bonus = await applyPactBonusRewards({
    user,
    rewards: rewards.map(toPactBonusReward),
    isPremium,
    doubles: true,
    shieldState: readShieldState(user),
    shieldConfig,
  });
  if (bonus.shieldsGranted > 0) setShieldStateOn(user, bonus.shieldState);

  const summary: SweepClaimResult = {
    fliesGranted: bonus.fliesGranted,
    flyBalanceBefore,
    flyBalanceAfter: Math.max(0, Number(user.wardrobe?.flies) || 0),
    grantedItemIds: bonus.grantedItemIds,
    grantedBackgroundIds: bonus.grantedBackgroundIds,
    shieldsGranted: bonus.shieldsGranted,
    rolled: {
      tier: roll.tier,
      mega: roll.mega,
      reward: drawn,
      megaRewards: roll.mega ? config.megaRewards : [],
    },
  };
  recordDoubleableClaim(user, summary);

  const currentQuests =
    typeof (user as any).quests === 'object' && (user as any).quests
      ? (user as any).quests
      : {};
  (user as any).quests = {
    ...currentQuests,
    dailyStreak: { ...state, pendingRolls: state.pendingRolls.slice(1) },
  };
  user.markModified('quests');
  user.markModified('wardrobe');
  await user.save();

  return summary;
}
