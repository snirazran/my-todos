import { v4 as uuid } from 'uuid';
import QuestSeasonModel, {
  type QuestSeasonDoc,
  type QuestSeasonDayReward,
  type QuestSeasonImages,
} from '@/lib/models/QuestSeason';
import UserModel from '@/lib/models/User';
import QuestSeasonAutoConfigModel, {
  SEASON_AUTO_CONFIG_ID,
  type QuestSeasonAutoConfigDoc,
} from '@/lib/models/QuestSeasonAutoConfig';
import { getZonedToday, getZonedYMD } from '@/lib/utils';
import { SEASON_REWARDS_PER_LANE } from '@/lib/quests/types';
import type { QuestReward, QuestRewards } from '@/lib/quests/types';

function emptySeasonImages(): QuestSeasonImages {
  return { mobile: '', tablet: '', web: '', webLarge: '' };
}

function normalizeSeasonImages(input: unknown): QuestSeasonImages {
  const src = (input ?? {}) as Partial<QuestSeasonImages>;
  return {
    mobile: typeof src.mobile === 'string' ? src.mobile : '',
    tablet: typeof src.tablet === 'string' ? src.tablet : '',
    web: typeof src.web === 'string' ? src.web : '',
    webLarge: typeof src.webLarge === 'string' ? src.webLarge : '',
  };
}

export type QuestSeasonView = {
  id: string;
  name: string;
  images: QuestSeasonImages;
  startsAt: string;
  endsAt: string;
  dailyTargetFlies: number;
  currentDay: number;
  dayCount: number;
  progressFlies: number;
  claimedDays: number[];
  claimedToday: boolean;
  claimedTodayDay?: number;
  claimable: boolean;
  rewardsByDay: QuestSeasonDayReward[];
};

export type UserQuestSeasonState = {
  claimedDays: number[];
  lastClaimedYmd?: string;
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
    images: normalizeSeasonImages(doc.images),
    startsAt: doc.startsAt.toISOString(),
    endsAt: doc.endsAt.toISOString(),
    dailyTargetFlies: doc.dailyTargetFlies,
    dayRewards: normalizeSeasonDayRewards(doc.dayRewards),
    isActive: doc.isActive,
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

export function getSeasonDayCount(startsAt: Date, endsAt: Date) {
  const durationMs = endsAt.getTime() - startsAt.getTime();
  return Math.max(1, Math.ceil(durationMs / 86_400_000));
}

function ymdToUtcDay(ymd: string) {
  const [year, month, day] = ymd.split('-').map(Number);
  if (!year || !month || !day) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function getCurrentSeasonDay(
  startsAt: Date,
  endsAt: Date,
  timezone: string,
  now = new Date(),
) {
  const startDay = ymdToUtcDay(getZonedYMD(startsAt, timezone));
  const todayDay = ymdToUtcDay(getZonedYMD(now, timezone));
  const raw =
    startDay === null || todayDay === null
      ? Math.floor((now.getTime() - startsAt.getTime()) / 86_400_000) + 1
      : todayDay - startDay + 1;
  return Math.min(getSeasonDayCount(startsAt, endsAt), Math.max(1, raw));
}

export function getCurrentUserSeasonDay(dayCount: number, claimedDays: number[]) {
  const claimed = new Set(
    claimedDays
      .filter((day) => Number.isFinite(day) && day > 0)
      .map((day) => Math.floor(day)),
  );
  for (let day = 1; day <= dayCount; day += 1) {
    if (!claimed.has(day)) return day;
  }
  return dayCount;
}

export function getUserQuestSeasonState(
  user: any,
  seasonId: string,
): UserQuestSeasonState {
  const state = user?.quests?.seasons?.[seasonId];
  const claimedDays = state?.claimedDays;
  const lastClaimedYmd = state?.lastClaimedYmd;
  return {
    claimedDays: Array.isArray(claimedDays)
      ? claimedDays.filter((day: unknown): day is number => typeof day === 'number')
      : [],
    lastClaimedYmd:
      typeof lastClaimedYmd === 'string' && lastClaimedYmd
        ? lastClaimedYmd
        : undefined,
  };
}

export function pruneQuestSeasonProgress(questsState: any, activeSeasonId: string) {
  const nextState =
    questsState && typeof questsState === 'object' ? questsState : {};
  const seasons =
    nextState.seasons && typeof nextState.seasons === 'object'
      ? nextState.seasons
      : {};
  nextState.seasons = activeSeasonId in seasons
    ? { [activeSeasonId]: seasons[activeSeasonId] }
    : {};
  return nextState;
}

export async function getActiveQuestSeasonView(args: {
  userId: string;
  timezone: string;
}) {
  const now = new Date();
  const [existing, user] = await Promise.all([
    QuestSeasonModel.findOne({
      isActive: true,
      startsAt: { $lte: now },
      endsAt: { $gt: now },
    })
      .sort({ startsAt: -1 })
      .lean<QuestSeasonDoc | null>(),
    UserModel.findById(args.userId).lean(),
  ]);

  if (!user) return null;

  // Automatic mode owns the calendar and overrides whatever is running; it
  // also means the board never goes blank at a month boundary. Falls back to
  // the hand-made season when automatic mode is off.
  const season = (await ensureAutoSeason(now)) ?? existing;
  if (!season) return null;

  const today = getZonedToday(args.timezone);
  const seasonState = getUserQuestSeasonState(user, season.seasonId);
  const claimedDays = seasonState.claimedDays;
  const dayCount = getSeasonDayCount(season.startsAt, season.endsAt);
  const claimedToday = seasonState.lastClaimedYmd === today;
  const claimedTodayDay = claimedToday
    ? [...claimedDays]
        .map((day) => Math.floor(day))
        .filter((day) => day >= 1 && day <= dayCount)
        .sort((a, b) => b - a)[0]
    : undefined;
  const currentDay = getCurrentUserSeasonDay(dayCount, claimedDays);
  const dailyFly = user.wardrobe?.flyDaily;
  const progressFlies = dailyFly?.date === today ? dailyFly.earned ?? 0 : 0;
  const completedSeasonDays = new Set(
    claimedDays
      .map((day) => Math.floor(day))
      .filter((day) => day >= 1 && day <= dayCount),
  );
  const seasonComplete = completedSeasonDays.size >= dayCount;

  return {
    id: season.seasonId,
    name: season.name,
    images: normalizeSeasonImages(season.images),
    startsAt: season.startsAt.toISOString(),
    endsAt: season.endsAt.toISOString(),
    dailyTargetFlies: season.dailyTargetFlies,
    currentDay,
    dayCount,
    progressFlies,
    claimedDays,
    claimedToday,
    claimedTodayDay,
    claimable:
      !seasonComplete &&
      !claimedToday &&
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

// ── Automatic monthly seasons ────────────────────────────────────────────────

export const SIMPLE_GIFT_ID = 'gift_box_1';
export const FANCY_GIFT_ID = 'gift_box_rare';
export const AMAZING_GIFT_ID = 'gift_box_legendary';

const MILESTONE_EVERY = 5;

const flies = (amount: number): QuestReward => ({
  type: 'FLIES',
  amountMode: 'fixed',
  amount,
});
const gift = (itemId: string): QuestReward => ({
  type: 'BOX',
  itemId,
  amount: 1,
  amountMode: 'fixed',
});

export function monthKeyOf(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** First instant of `date`'s month through the first instant of the next, in UTC. */
export function monthBounds(date: Date) {
  const startsAt = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  );
  const endsAt = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  );
  return { startsAt, endsAt };
}

// Spreads a range across tiles instead of using amountMode:'random' — the board
// tile must show the number it will actually pay, and grantRewardsToUser awards
// maxAmount for random rewards anyway.
function fliesForRegularTile(day: number, min: number, max: number) {
  const span = max - min + 1;
  return min + ((day - 1) % span);
}

/**
 * The monthly ladder: milestones on every 5th tile, FINALE on the last tile of
 * the month (28-31). Milestones past the 5th (only tile 30 of a 31-day month)
 * reuse the tile-25 treatment.
 */
export function buildMonthlySeasonRewards(
  dayCount: number,
): QuestSeasonDayReward[] {
  const milestoneLadder: Array<{
    freeRewards: QuestRewards;
    premiumRewards: QuestRewards;
  }> = [
    { freeRewards: [gift(SIMPLE_GIFT_ID)], premiumRewards: [gift(FANCY_GIFT_ID)] },
    {
      freeRewards: [gift(SIMPLE_GIFT_ID), flies(20)],
      premiumRewards: [gift(FANCY_GIFT_ID), flies(40)],
    },
    { freeRewards: [gift(FANCY_GIFT_ID)], premiumRewards: [gift(AMAZING_GIFT_ID)] },
    {
      freeRewards: [gift(FANCY_GIFT_ID), flies(30)],
      premiumRewards: [gift(AMAZING_GIFT_ID), flies(60)],
    },
    { freeRewards: [gift(FANCY_GIFT_ID)], premiumRewards: [gift(AMAZING_GIFT_ID)] },
  ];

  let regularIndex = 0;

  return Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;

    if (day === dayCount) {
      return {
        day,
        freeRewards: [gift(AMAZING_GIFT_ID)],
        premiumRewards: [gift(AMAZING_GIFT_ID), flies(60)],
      };
    }

    if (day % MILESTONE_EVERY === 0) {
      const step = day / MILESTONE_EVERY - 1;
      const entry =
        milestoneLadder[Math.min(step, milestoneLadder.length - 1)];
      return { day, freeRewards: [...entry.freeRewards], premiumRewards: [...entry.premiumRewards] };
    }

    regularIndex += 1;
    const premiumRewards: QuestRewards = [fliesForRegularTile(day, 6, 10)].map(
      (amount) => flies(amount),
    );
    if (regularIndex % 3 === 0) premiumRewards.push(gift(SIMPLE_GIFT_ID));

    return {
      day,
      freeRewards: [flies(fliesForRegularTile(day, 3, 5))],
      premiumRewards,
    };
  });
}

/**
 * While automatic mode is on it owns the calendar: each month gets its own
 * season, overriding any hand-made season that overlaps it. Rolled once per
 * month, so later admin edits to the generated ladder stick.
 *
 * Idempotent: `seasonId` is unique-indexed, so a concurrent create loses with
 * E11000 and refetches the winner (same idiom as the quest engine).
 */
export async function ensureAutoSeason(now = new Date()) {
  const config = await QuestSeasonAutoConfigModel.findOne({
    configId: SEASON_AUTO_CONFIG_ID,
  }).lean<QuestSeasonAutoConfigDoc | null>();
  if (!config?.isActive) return null;

  const { startsAt, endsAt } = monthBounds(now);
  const monthKey = monthKeyOf(now);
  const seasonId = `auto:${monthKey}`;
  const dayCount = getSeasonDayCount(startsAt, endsAt);

  // Steady state: already rolled this month, so keep it along with any edits
  // made since. One indexed lookup — this is the hot path.
  const rolled = await QuestSeasonModel.findOne({
    seasonId,
  }).lean<QuestSeasonDoc | null>();
  if (rolled) return rolled;

  // Rolling a new month: stand down every other season overlapping it, so the
  // override is real in the data and not just in what this function returns.
  await QuestSeasonModel.updateMany(
    {
      seasonId: { $ne: seasonId },
      isActive: true,
      startsAt: { $lt: endsAt },
      endsAt: { $gt: startsAt },
    },
    { $set: { isActive: false } },
  );

  // Auto seasons have no artwork of their own; reuse the most recent season's.
  const previous = await QuestSeasonModel.findOne({ endsAt: { $lte: startsAt } })
    .sort({ endsAt: -1 })
    .lean<QuestSeasonDoc | null>();

  const name = startsAt.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  try {
    return await QuestSeasonModel.create({
      seasonId,
      name,
      images: normalizeSeasonImages(previous?.images),
      startsAt,
      endsAt,
      dailyTargetFlies: config.dailyTargetFlies ?? 3,
      dayRewards: buildMonthlySeasonRewards(dayCount),
      isActive: true,
    });
  } catch (err: any) {
    // A concurrent request rolled it first — use theirs.
    if (err?.code === 11000) {
      return QuestSeasonModel.findOne({ seasonId }).lean<QuestSeasonDoc | null>();
    }
    throw err;
  }
}

export function sanitizeSeasonRewards(input: unknown): QuestSeasonDayReward[] {
  return normalizeSeasonDayRewards(input);
}

export async function createQuestSeason(payload: {
  name: string;
  images?: QuestSeasonImages;
  startsAt: Date;
  endsAt: Date;
  dailyTargetFlies: number;
  dayRewards: QuestSeasonDayReward[];
  isActive: boolean;
}) {
  return QuestSeasonModel.create({
    seasonId: uuid(),
    ...payload,
    images: payload.images ?? emptySeasonImages(),
  });
}

export function grantRewardsToUser(user: any, rewards: QuestRewards) {
  if (!user.wardrobe) {
    user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
  }
  user.wardrobe.inventory = user.wardrobe.inventory ?? {};
  user.wardrobe.unseenItems = user.wardrobe.unseenItems ?? [];
  user.wardrobe.flies = user.wardrobe.flies ?? 0;
  const summary = {
    fliesGranted: 0,
    flyBalanceBefore: user.wardrobe.flies,
    flyBalanceAfter: user.wardrobe.flies,
    grantedItemIds: [] as string[],
  };

  for (const reward of rewards) {
    if (reward.type === 'FLIES') {
      const amount = reward.amountMode === 'random'
        ? reward.maxAmount ?? reward.minAmount ?? 0
        : reward.amount ?? 0;
      user.wardrobe.flies += amount;
      summary.fliesGranted += amount;
      summary.flyBalanceAfter = user.wardrobe.flies;
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
