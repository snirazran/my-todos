import { randomUUID } from 'crypto';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import LoginStreakConfigModel, {
  LOGIN_STREAK_CONFIG_ID,
  DEFAULT_GOAL_TIERS,
  DEFAULT_MILESTONES,
  FREEZE_CAP_MIN,
  FREEZE_CAP_MAX,
  type LoginStreakConfigDoc,
} from '@/lib/models/LoginStreakConfig';
import { previousDayKey } from '@/lib/quests/streak';
import { isPremiumUser } from '@/lib/quests/engine';
import { getZonedToday } from '@/lib/utils';
import type { QuestReward } from '@/lib/quests/types';
import type {
  CheckInResult,
  LoginStreakGoal,
  LoginStreakRescue,
  LoginStreakReward,
  LoginStreakRewardEvent,
  LoginStreakRewardSummary,
  LoginStreakState,
  LoginStreakView,
  RescueResult,
} from './types';

const FREEZE_HISTORY_LIMIT = 14;
export const SAVER_MUTE_THRESHOLD = 7;
export const RESCUE_MIN_STREAK = 3;
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

function readRescue(raw: any): LoginStreakRescue | null {
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
    offeredDayKey: raw.offeredDayKey,
    adsRequired: Math.max(0, Math.floor(raw.adsRequired ?? 0)),
    adsWatched: Math.max(0, Math.floor(raw.adsWatched ?? 0)),
  };
}

export async function loadLoginStreakConfig(): Promise<LoginStreakConfigDoc> {
  const doc = await LoginStreakConfigModel.findOne({
    configId: LOGIN_STREAK_CONFIG_ID,
  }).lean<LoginStreakConfigDoc | null>();
  return {
    configId: LOGIN_STREAK_CONFIG_ID,
    isActive: doc?.isActive ?? true,
    freezePriceFlies: Math.max(1, doc?.freezePriceFlies ?? 100),
    freezeCap: Math.min(
      FREEZE_CAP_MAX,
      Math.max(FREEZE_CAP_MIN, doc?.freezeCap ?? 2),
    ),
    saverMinStreak: Math.max(1, doc?.saverMinStreak ?? 2),
    goalTiers:
      doc?.goalTiers && doc.goalTiers.length > 0
        ? doc.goalTiers
        : DEFAULT_GOAL_TIERS,
    milestones:
      doc?.milestones && doc.milestones.length > 0
        ? doc.milestones
        : DEFAULT_MILESTONES,
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
    freezes: Math.max(0, Math.floor(raw?.freezes ?? 0)),
    freezeUsedDayKeys: Array.isArray(raw?.freezeUsedDayKeys)
      ? raw.freezeUsedDayKeys.filter((k: unknown) => typeof k === 'string')
      : [],
    goal,
    goalsCompleted: Array.isArray(raw?.goalsCompleted)
      ? raw.goalsCompleted.filter(
          (g: any) => typeof g?.days === 'number' && typeof g?.dayKey === 'string',
        )
      : [],
    milestonesReached: Array.isArray(raw?.milestonesReached)
      ? raw.milestonesReached.filter((d: unknown) => typeof d === 'number')
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
  while (cursor > lastDayKey && gap <= FREEZE_HISTORY_LIMIT) {
    gap += 1;
    cursor = previousDayKey(cursor);
  }
  return gap;
}

function gapDayKeys(lastDayKey: string, todayKey: string): string[] {
  const days: string[] = [];
  let cursor = previousDayKey(todayKey);
  while (cursor > lastDayKey && days.length <= FREEZE_HISTORY_LIMIT) {
    days.unshift(cursor);
    cursor = previousDayKey(cursor);
  }
  return days;
}

export async function applyFreezeCoverage(args: {
  userId: string;
  state: LoginStreakState;
  todayKey: string;
}): Promise<{ state: LoginStreakState; consumed: string[] } | null> {
  const { userId, state, todayKey } = args;
  if (state.count <= 0 || !state.lastDayKey) return null;
  const gap = computeGap(state.lastDayKey, todayKey);
  if (gap === 0 || gap > state.freezes) return null;

  const coveredDays = gapDayKeys(state.lastDayKey, todayKey);
  const res = await UserModel.updateOne(
    {
      _id: userId,
      'quests.loginStreak.lastDayKey': state.lastDayKey,
      'quests.loginStreak.freezes': { $gte: gap },
    },
    {
      $set: { 'quests.loginStreak.lastDayKey': previousDayKey(todayKey) },
      $inc: { 'quests.loginStreak.freezes': -gap },
      $push: {
        'quests.loginStreak.freezeUsedDayKeys': {
          $each: coveredDays,
          $slice: -FREEZE_HISTORY_LIMIT,
        },
      },
    },
  );
  if (res.modifiedCount === 0) return null;

  return {
    state: {
      ...state,
      lastDayKey: previousDayKey(todayKey),
      freezes: state.freezes - gap,
      freezeUsedDayKeys: [...state.freezeUsedDayKeys, ...coveredDays].slice(
        -FREEZE_HISTORY_LIMIT,
      ),
    },
    consumed: coveredDays,
  };
}

export function buildLoginStreakView(
  state: LoginStreakState,
  config: LoginStreakConfigDoc,
  todayKey: string,
): LoginStreakView {
  const gap = computeGap(state.lastDayKey, todayKey);
  const checkedInToday = state.lastDayKey === todayKey;
  const alive =
    state.count > 0 && (checkedInToday || gap === 0 || gap <= state.freezes);
  return {
    count: alive ? state.count : 0,
    longestStreak: state.longestStreak,
    lastDayKey: state.lastDayKey,
    checkedInToday,
    alive,
    freezes: state.freezes,
    freezeCap: config.freezeCap,
    freezePriceFlies: config.freezePriceFlies,
    freezeUsedDayKeys: state.freezeUsedDayKeys,
    goal: state.goal
      ? {
          ...state.goal,
          progress: Math.max(
            0,
            Math.min(state.goal.days, state.count - state.goal.startCount),
          ),
        }
      : null,
    goalTiers: config.goalTiers,
    milestones: config.milestones.map((m) => ({
      days: m.days,
      reached: state.milestonesReached.includes(m.days),
    })),
  };
}

function splitRewards(rewards: LoginStreakReward[]) {
  const questRewards: QuestReward[] = [];
  let freezes = 0;
  for (const reward of rewards) {
    if (reward.type === 'STREAK_FREEZE') {
      freezes += Math.max(1, Math.floor(reward.amount ?? 1));
    } else {
      questRewards.push(reward as QuestReward);
    }
  }
  return { questRewards, freezes };
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
    freezesGranted: 0,
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

function applyStreakRewardGrants(args: {
  user: any;
  next: LoginStreakState;
  config: LoginStreakConfigDoc;
  todayKey: string;
  newMilestones: LoginStreakConfigDoc['milestones'];
  goalCompleted: LoginStreakGoal | null;
}): {
  milestoneEvents: LoginStreakRewardEvent[];
  goalEvent: LoginStreakRewardEvent | null;
} {
  const { user, next, config, todayKey, newMilestones, goalCompleted } = args;
  const multiplier = isPremiumUser(user.toObject()) ? 2 : 1;
  let grantedFreezes = 0;
  const milestoneEvents: LoginStreakRewardEvent[] = [];
  let goalEvent: LoginStreakRewardEvent | null = null;

  for (const milestone of newMilestones) {
    const { questRewards, freezes } = splitRewards(milestone.rewards ?? []);
    const summary = grantQuestRewards(user, questRewards, multiplier);
    grantedFreezes += freezes;
    summary.freezesGranted = freezes;
    next.milestonesReached = [...next.milestonesReached, milestone.days];
    milestoneEvents.push({ days: milestone.days, rewardSummary: summary });
  }

  if (goalCompleted) {
    const tier = config.goalTiers.find((t) => t.days === goalCompleted.days);
    const { questRewards, freezes } = splitRewards(tier?.rewards ?? []);
    const summary = grantQuestRewards(user, questRewards, multiplier);
    grantedFreezes += freezes;
    summary.freezesGranted = freezes;
    next.goalsCompleted = [
      ...next.goalsCompleted,
      { days: goalCompleted.days, dayKey: todayKey },
    ];
    next.goal = null;
    goalEvent = { days: goalCompleted.days, rewardSummary: summary };
  }

  next.freezes = Math.min(config.freezeCap, next.freezes + grantedFreezes);
  return { milestoneEvents, goalEvent };
}

function activeRescueForDay(
  rescue: LoginStreakRescue | null,
  todayKey: string,
): LoginStreakRescue | null {
  return rescue && rescue.offeredDayKey === todayKey ? rescue : null;
}

export async function performCheckIn(args: {
  userId: string;
  timezone: string;
}): Promise<CheckInResult> {
  const { userId, timezone } = args;
  await connectMongo();

  const [user, config] = await Promise.all([
    UserModel.findById(userId),
    loadLoginStreakConfig(),
  ]);
  if (!user) throw new Error('User not found');

  const todayKey = getZonedToday(timezone);
  const state = readLoginStreakState(user.toObject());

  if (!config.isActive) {
    return {
      active: false,
      extended: false,
      previousCount: state.count,
      view: null,
      freezeConsumedDays: [],
      milestoneEvents: [],
      goalEvent: null,
      rescue: null,
    };
  }

  if (state.lastDayKey === todayKey) {
    return {
      active: true,
      extended: false,
      previousCount: state.count,
      view: buildLoginStreakView(state, config, todayKey),
      freezeConsumedDays: [],
      milestoneEvents: [],
      goalEvent: null,
      rescue: activeRescueForDay(state.rescue, todayKey),
    };
  }

  const coverage = await applyFreezeCoverage({ userId, state, todayKey });
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
    notif: { ...freshState.notif, saverIgnoredCount: 0 },
  };

  const rescueEligible =
    newCount === 1 &&
    previousCount >= RESCUE_MIN_STREAK &&
    computeGap(freshState.lastDayKey, todayKey) === 1 &&
    (!freshState.lastRescueDayKey ||
      dayKeyDiff(freshState.lastRescueDayKey, todayKey) >= RESCUE_COOLDOWN_DAYS);
  if (rescueEligible) {
    next.rescue = {
      id: randomUUID(),
      previousCount,
      offeredDayKey: todayKey,
      adsRequired: isPremiumUser(user.toObject())
        ? 0
        : rescueAdsRequired(previousCount),
      adsWatched: 0,
    };
  }

  const newMilestones = config.milestones.filter(
    (m) => newCount >= m.days && !next.milestonesReached.includes(m.days),
  );
  const goalCompleted =
    next.goal && newCount - next.goal.startCount >= next.goal.days
      ? next.goal
      : null;

  let milestoneEvents: LoginStreakRewardEvent[] = [];
  let goalEvent: LoginStreakRewardEvent | null = null;

  if (newMilestones.length > 0 || goalCompleted) {
    const granted = applyStreakRewardGrants({
      user,
      next,
      config,
      todayKey,
      newMilestones,
      goalCompleted,
    });
    milestoneEvents = granted.milestoneEvents;
    goalEvent = granted.goalEvent;

    const currentQuests =
      typeof (user as any).quests === 'object' && (user as any).quests
        ? (user as any).quests
        : {};
    (user as any).quests = { ...currentQuests, loginStreak: next };
    user.markModified('quests');
    user.markModified('wardrobe');
    await user.save();
  } else {
    const res = await UserModel.updateOne(
      {
        _id: userId,
        $or: [
          { 'quests.loginStreak.lastDayKey': freshState.lastDayKey },
          { 'quests.loginStreak': { $exists: false } },
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
        view: buildLoginStreakView(currentState, config, todayKey),
        freezeConsumedDays: [],
        milestoneEvents: [],
        goalEvent: null,
        rescue: activeRescueForDay(currentState.rescue, todayKey),
      };
    }
  }

  return {
    active: true,
    extended: true,
    previousCount,
    view: buildLoginStreakView(next, config, todayKey),
    freezeConsumedDays: coverage?.consumed ?? [],
    milestoneEvents,
    goalEvent,
    rescue: next.rescue,
  };
}

export async function performRescue(args: {
  userId: string;
  timezone: string;
  rescueId: string;
}): Promise<RescueResult> {
  const { userId, timezone, rescueId } = args;
  await connectMongo();

  const [user, config] = await Promise.all([
    UserModel.findById(userId),
    loadLoginStreakConfig(),
  ]);
  if (!user) throw new Error('User not found');

  const todayKey = getZonedToday(timezone);
  const state = readLoginStreakState(user.toObject());
  const rescue = state.rescue;

  if (
    !config.isActive ||
    !rescue ||
    rescue.id !== rescueId ||
    rescue.offeredDayKey !== todayKey ||
    state.lastDayKey !== todayKey
  ) {
    return {
      granted: false,
      completed: false,
      rescue: null,
      view: config.isActive
        ? buildLoginStreakView(state, config, todayKey)
        : null,
      milestoneEvents: [],
      goalEvent: null,
    };
  }

  const adsWatched = rescue.adsWatched + 1;
  if (adsWatched < rescue.adsRequired) {
    const updated: LoginStreakRescue = { ...rescue, adsWatched };
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
      ),
      milestoneEvents: [],
      goalEvent: null,
    };
  }

  const newCount = rescue.previousCount + 1;
  const next: LoginStreakState = {
    ...state,
    count: newCount,
    longestStreak: Math.max(state.longestStreak, newCount),
    rescue: null,
    lastRescueDayKey: todayKey,
  };

  const newMilestones = config.milestones.filter(
    (m) => newCount >= m.days && !next.milestonesReached.includes(m.days),
  );
  const goalCompleted =
    next.goal && newCount - next.goal.startCount >= next.goal.days
      ? next.goal
      : null;
  const { milestoneEvents, goalEvent } = applyStreakRewardGrants({
    user,
    next,
    config,
    todayKey,
    newMilestones,
    goalCompleted,
  });

  const currentQuests =
    typeof (user as any).quests === 'object' && (user as any).quests
      ? (user as any).quests
      : {};
  (user as any).quests = { ...currentQuests, loginStreak: next };
  user.markModified('quests');
  user.markModified('wardrobe');
  await user.save();

  return {
    granted: true,
    completed: true,
    rescue: null,
    view: buildLoginStreakView(next, config, todayKey),
    milestoneEvents,
    goalEvent,
  };
}
