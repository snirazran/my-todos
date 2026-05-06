import { v4 as uuid } from 'uuid';
import QuestSeasonModel, {
  type QuestSeasonDoc,
  type QuestSeasonDayReward,
} from '@/lib/models/QuestSeason';
import UserModel from '@/lib/models/User';
import { getZonedToday } from '@/lib/utils';
import type { QuestRewards } from '@/lib/quests/types';

export type QuestSeasonView = {
  id: string;
  name: string;
  coverImageUrl?: string;
  startsAt: string;
  endsAt: string;
  dailyTargetFlies: number;
  currentDay: number;
  dayCount: number;
  progressFlies: number;
  claimedDays: number[];
  claimable: boolean;
  rewardsByDay: QuestSeasonDayReward[];
};

export function normalizeSeasonDayRewards(
  rewards: unknown,
): QuestSeasonDayReward[] {
  if (!Array.isArray(rewards)) return [];

  return rewards
    .map((entry) => {
      const record = entry as {
        day?: unknown;
        rewards?: unknown;
        freeRewards?: unknown;
        premiumRewards?: unknown;
      };
      const day = Number(record.day);
      if (!Number.isFinite(day) || day <= 0) return null;

      const legacyRewards = Array.isArray(record.rewards)
        ? (record.rewards as QuestRewards)
        : [];
      const freeRewards = Array.isArray(record.freeRewards)
        ? (record.freeRewards as QuestRewards)
        : legacyRewards;
      const premiumRewards = Array.isArray(record.premiumRewards)
        ? (record.premiumRewards as QuestRewards)
        : [];

      return {
        day: Math.floor(day),
        freeRewards,
        premiumRewards,
      };
    })
    .filter((entry): entry is QuestSeasonDayReward => !!entry);
}

export function seasonToAdminView(doc: QuestSeasonDoc) {
  return {
    id: doc.seasonId,
    name: doc.name,
    coverImageUrl: doc.coverImageUrl,
    startsAt: doc.startsAt.toISOString(),
    endsAt: doc.endsAt.toISOString(),
    dailyTargetFlies: doc.dailyTargetFlies,
    dayRewards: normalizeSeasonDayRewards(doc.dayRewards),
    isActive: doc.isActive,
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

function getDayCount(startsAt: Date, endsAt: Date) {
  const durationMs = endsAt.getTime() - startsAt.getTime();
  return Math.max(1, Math.ceil(durationMs / 86_400_000));
}

function getCurrentSeasonDay(startsAt: Date, endsAt: Date) {
  const now = Date.now();
  const raw = Math.floor((now - startsAt.getTime()) / 86_400_000) + 1;
  return Math.min(getDayCount(startsAt, endsAt), Math.max(1, raw));
}

function getClaimedDays(user: any, seasonId: string) {
  const claimedDays = user?.quests?.seasons?.[seasonId]?.claimedDays;
  return Array.isArray(claimedDays)
    ? claimedDays.filter((day: unknown): day is number => typeof day === 'number')
    : [];
}

export async function getActiveQuestSeasonView(args: {
  userId: string;
  timezone: string;
}) {
  const now = new Date();
  const [season, user] = await Promise.all([
    QuestSeasonModel.findOne({
      isActive: true,
      startsAt: { $lte: now },
      endsAt: { $gt: now },
    })
      .sort({ startsAt: -1 })
      .lean<QuestSeasonDoc | null>(),
    UserModel.findById(args.userId).lean(),
  ]);

  if (!season || !user) return null;

  const today = getZonedToday(args.timezone);
  const currentDay = getCurrentSeasonDay(season.startsAt, season.endsAt);
  const claimedDays = getClaimedDays(user, season.seasonId);
  const dailyFly = user.wardrobe?.flyDaily;
  const progressFlies = dailyFly?.date === today ? dailyFly.earned ?? 0 : 0;

  return {
    id: season.seasonId,
    name: season.name,
    coverImageUrl: season.coverImageUrl,
    startsAt: season.startsAt.toISOString(),
    endsAt: season.endsAt.toISOString(),
    dailyTargetFlies: season.dailyTargetFlies,
    currentDay,
    dayCount: getDayCount(season.startsAt, season.endsAt),
    progressFlies,
    claimedDays,
    claimable:
      progressFlies >= season.dailyTargetFlies &&
      !claimedDays.includes(currentDay),
    rewardsByDay: normalizeSeasonDayRewards(season.dayRewards),
  } satisfies QuestSeasonView;
}

export function buildDefaultSeasonRewards(dayCount: number): QuestSeasonDayReward[] {
  return Array.from({ length: dayCount }, (_, index) => ({
    day: index + 1,
    freeRewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 50 }],
    premiumRewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 100 }],
  }));
}

export function sanitizeSeasonRewards(input: unknown): QuestSeasonDayReward[] {
  return normalizeSeasonDayRewards(input);
}

export async function createQuestSeason(payload: {
  name: string;
  coverImageUrl?: string;
  startsAt: Date;
  endsAt: Date;
  dailyTargetFlies: number;
  dayRewards: QuestSeasonDayReward[];
  isActive: boolean;
}) {
  return QuestSeasonModel.create({
    seasonId: uuid(),
    ...payload,
  });
}

export function grantRewardsToUser(user: any, rewards: QuestRewards) {
  const summary = { fliesGranted: 0, grantedItemIds: [] as string[] };
  if (!user.wardrobe) {
    user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
  }
  user.wardrobe.inventory = user.wardrobe.inventory ?? {};
  user.wardrobe.unseenItems = user.wardrobe.unseenItems ?? [];
  user.wardrobe.flies = user.wardrobe.flies ?? 0;

  for (const reward of rewards) {
    if (reward.type === 'FLIES') {
      const amount = reward.amountMode === 'random'
        ? reward.maxAmount ?? reward.minAmount ?? 0
        : reward.amount ?? 0;
      user.wardrobe.flies += amount;
      summary.fliesGranted += amount;
    } else if (reward.itemId) {
      const amount = Math.max(1, reward.amount ?? 1);
      for (let i = 0; i < amount; i += 1) {
        user.wardrobe.inventory[reward.itemId] =
          (user.wardrobe.inventory[reward.itemId] ?? 0) + 1;
        user.wardrobe.unseenItems.push(reward.itemId);
        summary.grantedItemIds.push(reward.itemId);
      }
    }
  }

  return summary;
}
