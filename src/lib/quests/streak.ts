import connectMongo from '@/lib/mongoose';
import UserModel, { type UserDoc } from '@/lib/models/User';
import QuestStreakConfigModel, {
  STREAK_CONFIG_ID,
  STREAK_LENGTH_MIN,
  STREAK_LENGTH_MAX,
  type QuestStreakConfigDoc,
} from '@/lib/models/QuestStreakConfig';
import { getZonedToday } from '@/lib/utils';
import { recordDoubleableClaim } from '@/lib/rewards/adDouble';
import { isPremiumUser, syncQuestState } from './engine';
import type { DailyQuestProgressView, QuestReward } from './types';

export type DailyStreakState = {
  count: number;
  lastDayKey: string;
  milestonesEarned: number;
  milestonesClaimed: number;
};

export type DailyStreakView = {
  count: number;
  targetLength: number;
  todayComplete: boolean;
  claimable: boolean;
  // The configured prize pool (the claim draws one of these), so the UI can
  // show the real prize instead of a "mystery" placeholder.
  rewards: QuestReward[];
};

export function previousDayKey(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function clampStreakLength(value: number) {
  return Math.min(
    STREAK_LENGTH_MAX,
    Math.max(STREAK_LENGTH_MIN, Math.floor(value)),
  );
}

export async function loadStreakConfig() {
  return QuestStreakConfigModel.findOne({
    configId: STREAK_CONFIG_ID,
  }).lean<QuestStreakConfigDoc | null>();
}

function readStreakState(user: UserDoc): DailyStreakState {
  const raw = (user as any).quests?.dailyStreak;
  return {
    count: Math.max(0, Math.floor(raw?.count ?? 0)),
    lastDayKey: typeof raw?.lastDayKey === 'string' ? raw.lastDayKey : '',
    milestonesEarned: Math.max(0, Math.floor(raw?.milestonesEarned ?? 0)),
    milestonesClaimed: Math.max(0, Math.floor(raw?.milestonesClaimed ?? 0)),
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

// Rolls the streak forward for today when all dailies are complete, persisting
// only when something changed. Returns the view the quests API exposes, or
// null when no active config exists.
export async function syncDailyStreak(args: {
  user: UserDoc;
  config: QuestStreakConfigDoc | null;
  dailyQuests: DailyQuestProgressView[];
  todayKey: string;
}): Promise<DailyStreakView | null> {
  const { user, config, dailyQuests, todayKey } = args;
  if (!config?.isActive || (config.rewards ?? []).length === 0) return null;

  const targetLength = clampStreakLength(config.streakLength);
  const state = readStreakState(user);
  const todayComplete = areDailyQuestsComplete(dailyQuests);
  const yesterdayKey = previousDayKey(todayKey);

  let next = state;
  if (todayComplete && state.lastDayKey !== todayKey) {
    const count = state.lastDayKey === yesterdayKey ? state.count + 1 : 1;
    next = {
      ...state,
      count,
      lastDayKey: todayKey,
      milestonesEarned:
        state.milestonesEarned + (count % targetLength === 0 ? 1 : 0),
    };
    await UserModel.updateOne(
      { _id: (user as any)._id },
      { $set: { 'quests.dailyStreak': next } },
    );
  }

  const streakAlive =
    next.lastDayKey === todayKey || next.lastDayKey === yesterdayKey;

  return {
    count: streakAlive ? next.count : 0,
    targetLength,
    todayComplete,
    claimable: next.milestonesEarned > next.milestonesClaimed,
    rewards: (config.rewards ?? []) as QuestReward[],
  };
}

function drawStreakReward(rewards: QuestReward[]): QuestReward {
  const pick = rewards[Math.floor(Math.random() * rewards.length)];
  if (pick.type === 'FLIES' && pick.amountMode === 'random') {
    const min = Math.max(1, pick.minAmount ?? 1);
    const max = Math.max(min, pick.maxAmount ?? min);
    return {
      type: 'FLIES',
      amountMode: 'fixed',
      amount: min + Math.floor(Math.random() * (max - min + 1)),
    };
  }
  return pick;
}

export async function claimDailyStreakReward(args: {
  userId: string;
  timezone: string;
}) {
  const { userId, timezone } = args;
  await connectMongo();

  const [user, config] = await Promise.all([
    UserModel.findById(userId),
    loadStreakConfig(),
  ]);
  if (!user) throw new Error('User not found');
  if (!config?.isActive || (config.rewards ?? []).length === 0) {
    throw new Error('Streak rewards are not available right now');
  }

  // Roll the streak forward first so a claim right after finishing the last
  // daily quest doesn't race the next quests fetch.
  const todayKey = getZonedToday(timezone);
  const dashboard = await syncQuestState({
    userId,
    timezone,
    includeCatalog: false,
    includeCategories: false,
  });
  await syncDailyStreak({
    user: dashboard.user,
    config,
    dailyQuests: dashboard.dailyQuests,
    todayKey,
  });

  const freshUser = await UserModel.findById(userId);
  if (!freshUser) throw new Error('User not found');
  const state = readStreakState(freshUser.toObject());
  if (state.milestonesEarned <= state.milestonesClaimed) {
    throw new Error('No streak reward to claim yet');
  }

  const isPremium = isPremiumUser(freshUser.toObject());
  const multiplier = isPremium ? 2 : 1;

  if (!freshUser.wardrobe) {
    freshUser.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
  }
  freshUser.wardrobe.inventory = freshUser.wardrobe.inventory ?? {};
  freshUser.wardrobe.unseenItems = freshUser.wardrobe.unseenItems ?? [];
  freshUser.wardrobe.flies = freshUser.wardrobe.flies ?? 0;
  if (!freshUser.wardrobe.backgrounds) {
    freshUser.wardrobe.backgrounds = { equipped: null, inventory: {} };
  }
  freshUser.wardrobe.backgrounds.inventory =
    freshUser.wardrobe.backgrounds.inventory ?? {};

  const summary = {
    fliesGranted: 0,
    flyBalanceBefore: freshUser.wardrobe.flies,
    flyBalanceAfter: freshUser.wardrobe.flies,
    grantedItemIds: [] as string[],
    grantedBackgroundIds: [] as string[],
  };

  const reward = drawStreakReward(config.rewards as QuestReward[]);
  if (reward.type === 'FLIES') {
    const amount = (reward.amount ?? 0) * multiplier;
    freshUser.wardrobe.flies += amount;
    summary.fliesGranted += amount;
    summary.flyBalanceAfter = freshUser.wardrobe.flies;
  } else if (reward.type === 'BACKGROUND' && reward.backgroundId) {
    const inv = freshUser.wardrobe.backgrounds.inventory;
    for (let i = 0; i < multiplier; i += 1) {
      inv[reward.backgroundId] = (inv[reward.backgroundId] ?? 0) + 1;
      summary.grantedBackgroundIds.push(reward.backgroundId);
    }
  } else if (reward.itemId) {
    const copies = Math.max(1, reward.amount ?? 1) * multiplier;
    for (let i = 0; i < copies; i += 1) {
      freshUser.wardrobe.inventory[reward.itemId] =
        (freshUser.wardrobe.inventory[reward.itemId] ?? 0) + 1;
      freshUser.wardrobe.unseenItems!.push(reward.itemId);
      summary.grantedItemIds.push(reward.itemId);
    }
  }

  recordDoubleableClaim(freshUser, summary);

  const currentQuests =
    typeof (freshUser as any).quests === 'object' && (freshUser as any).quests
      ? (freshUser as any).quests
      : {};
  (freshUser as any).quests = {
    ...currentQuests,
    dailyStreak: { ...state, milestonesClaimed: state.milestonesClaimed + 1 },
  };
  freshUser.markModified('quests');
  freshUser.markModified('wardrobe');
  await freshUser.save();

  return summary;
}
