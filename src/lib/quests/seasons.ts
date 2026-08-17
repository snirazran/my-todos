import { v4 as uuid } from 'uuid';
import QuestSeasonModel, {
  type QuestSeasonDoc,
  type QuestSeasonImages,
} from '@/lib/models/QuestSeason';
import UserModel from '@/lib/models/User';
import QuestSeasonTemplateModel, {
  SEASON_TEMPLATE_CONFIG_ID,
} from '@/lib/models/QuestSeasonTemplate';
import { getZonedToday } from '@/lib/utils';
import {
  buildSeasonPassLadder,
  normalizeSeasonPassConfig,
  normalizeSeasonSkinIds,
  SEASON_PASS_DEFAULTS,
  SEASON_PASS_LIMITS,
  type QuestSeasonTierReward,
  type SeasonPassConfig,
  type SeasonSkinIds,
} from '@/lib/quests/seasonLadder';
import type { QuestRewards, SeasonLane } from '@/lib/quests/types';

export * from '@/lib/quests/seasonLadder';

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

/** Reads the pass knobs off a season doc, filling defaults for pre-pass docs. */
export function readSeasonPassConfig(doc: unknown): SeasonPassConfig {
  return normalizeSeasonPassConfig(doc);
}

export type QuestSeasonView = {
  id: string;
  name: string;
  images: QuestSeasonImages;
  startsAt: string;
  endsAt: string;
  graceEndsAt: string;
  ended: boolean;
  tierCount: number;
  tier: number;
  steps: number;
  stepsPerTier: number;
  stepsIntoTier: number;
  tasksPerStep: number;
  maxStepsPerDay: number;
  tasksToday: number;
  stepsToday: number;
  dailyTaskGoal: number;
  tierSkipCost: number;
  flyBalance: number;
  purchasedTiers: number;
  isPremium: boolean;
  claimedFreeTiers: number[];
  claimedPlusTiers: number[];
  claimableFreeTiers: number[];
  claimablePlusTiers: number[];
  claimableCount: number;
  claimable: boolean;
  rewardsByTier: QuestSeasonTierReward[];
};

export type UserQuestSeasonState = {
  steps: number;
  purchasedTiers: number;
  claimedFreeTiers: number[];
  claimedPlusTiers: number[];
  stepDayKey?: string;
  stepsToday: number;
};

function numberList(input: unknown, max: number): number[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<number>();
  for (const entry of input) {
    const value = Math.floor(Number(entry));
    if (!Number.isFinite(value) || value < 1 || value > max) continue;
    seen.add(value);
  }
  return Array.from(seen).sort((a, b) => a - b);
}

export function normalizeSeasonTierRewards(
  rewards: unknown,
): QuestSeasonTierReward[] {
  if (!Array.isArray(rewards)) return [];

  return rewards
    .map((entry) => {
      const record = entry as {
        tier?: unknown;
        day?: unknown;
        rewards?: unknown;
        freeRewards?: unknown;
        premiumRewards?: unknown;
      };
      const tier = Number(record.tier ?? record.day);
      if (!Number.isFinite(tier) || tier <= 0) return null;

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
        tier: Math.floor(tier),
        freeRewards,
        premiumRewards,
      };
    })
    .filter((entry): entry is QuestSeasonTierReward => !!entry)
    .sort((a, b) => a.tier - b.tier);
}

/** Tier ladder off a doc, tolerating the pre-pass `dayRewards` shape. */
export function readSeasonTierRewards(doc: unknown): QuestSeasonTierReward[] {
  const record = (doc ?? {}) as { tierRewards?: unknown; dayRewards?: unknown };
  const tiers = normalizeSeasonTierRewards(record.tierRewards);
  if (tiers.length > 0) return tiers;
  return normalizeSeasonTierRewards(record.dayRewards);
}

export function seasonToAdminView(doc: QuestSeasonDoc) {
  const config = readSeasonPassConfig(doc);
  return {
    id: doc.seasonId,
    name: doc.name,
    images: normalizeSeasonImages(doc.images),
    startsAt: doc.startsAt.toISOString(),
    endsAt: doc.endsAt.toISOString(),
    ...config,
    tierRewards: readSeasonTierRewards(doc),
    isActive: doc.isActive,
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

export function getSeasonDayCount(startsAt: Date, endsAt: Date) {
  const durationMs = endsAt.getTime() - startsAt.getTime();
  return Math.max(1, Math.ceil(durationMs / 86_400_000));
}

export function seasonGraceEndsAt(endsAt: Date, graceHours: number) {
  return new Date(endsAt.getTime() + Math.max(0, graceHours) * 3_600_000);
}

// ── Per-user pass state ──────────────────────────────────────────────────────

export function getUserQuestSeasonState(
  user: any,
  seasonId: string,
  tierCount: number,
): UserQuestSeasonState {
  const state = user?.quests?.seasons?.[seasonId] ?? {};
  return {
    steps: Math.max(0, Math.floor(Number(state.steps) || 0)),
    purchasedTiers: Math.max(0, Math.floor(Number(state.purchasedTiers) || 0)),
    claimedFreeTiers: numberList(state.claimedFreeTiers, tierCount),
    claimedPlusTiers: numberList(state.claimedPlusTiers, tierCount),
    stepDayKey:
      typeof state.stepDayKey === 'string' && state.stepDayKey
        ? state.stepDayKey
        : undefined,
    stepsToday: Math.max(0, Math.floor(Number(state.stepsToday) || 0)),
  };
}

export function seasonTierFromSteps(steps: number, config: SeasonPassConfig) {
  return Math.min(
    config.tierCount,
    Math.floor(steps / Math.max(1, config.stepsPerTier)),
  );
}

export function maxSeasonSteps(config: SeasonPassConfig) {
  return config.tierCount * Math.max(1, config.stepsPerTier);
}

/**
 * Banks today's steps. Three tasks earn a step and only `maxStepsPerDay` of
 * them bank in one day, so one heavy day cannot burn the whole ladder — but the
 * banked count never walks backwards, so undoing a task does not claw a step
 * back and let the same work pay twice.
 */
export function accrueSeasonSteps(args: {
  state: UserQuestSeasonState;
  config: SeasonPassConfig;
  tasksToday: number;
  todayKey: string;
  seasonRunning: boolean;
}): { state: UserQuestSeasonState; gained: number } {
  const { config, todayKey } = args;
  const sameDay = args.state.stepDayKey === todayKey;
  const stepsToday = sameDay ? args.state.stepsToday : 0;

  if (!args.seasonRunning) {
    if (sameDay) return { state: args.state, gained: 0 };
    return {
      state: { ...args.state, stepDayKey: todayKey, stepsToday: 0 },
      gained: 0,
    };
  }

  const earnable = Math.min(
    config.maxStepsPerDay,
    Math.floor(Math.max(0, args.tasksToday) / Math.max(1, config.tasksPerStep)),
  );
  const banked = Math.max(stepsToday, earnable);
  const ceiling = maxSeasonSteps(config);
  const nextSteps = Math.min(ceiling, args.state.steps + (banked - stepsToday));

  return {
    state: {
      ...args.state,
      steps: nextSteps,
      stepDayKey: todayKey,
      stepsToday: banked,
    },
    gained: nextSteps - args.state.steps,
  };
}

export function pruneQuestSeasonProgress(
  questsState: any,
  keepIds: Array<string | null | undefined>,
) {
  const nextState =
    questsState && typeof questsState === 'object' ? questsState : {};
  const seasons =
    nextState.seasons && typeof nextState.seasons === 'object'
      ? nextState.seasons
      : {};
  const kept: Record<string, unknown> = {};
  for (const id of keepIds) {
    if (id && id in seasons) kept[id] = seasons[id];
  }
  nextState.seasons = kept;
  return nextState;
}

export function tasksCompletedToday(user: any, todayKey: string) {
  const daily = user?.wardrobe?.flyDaily;
  if (!daily || daily.date !== todayKey) return 0;
  if (Array.isArray(daily.taskIds)) return daily.taskIds.length;
  return Math.max(0, Math.floor(Number(daily.earned) || 0));
}

export function unclaimedSeasonTiers(
  unlockedTier: number,
  claimed: number[],
  rewardsByTier: QuestSeasonTierReward[],
  lane: SeasonLane,
) {
  const claimedSet = new Set(claimed);
  const out: number[] = [];
  for (const entry of rewardsByTier) {
    if (entry.tier > unlockedTier) break;
    if (claimedSet.has(entry.tier)) continue;
    const rewards = lane === 'free' ? entry.freeRewards : entry.premiumRewards;
    if (rewards.length === 0) continue;
    out.push(entry.tier);
  }
  return out;
}

export function buildSeasonView(args: {
  season: QuestSeasonDoc;
  state: UserQuestSeasonState;
  config: SeasonPassConfig;
  rewardsByTier: QuestSeasonTierReward[];
  tasksToday: number;
  flyBalance: number;
  isPremium: boolean;
  now: Date;
}): QuestSeasonView {
  const { season, state, config } = args;
  // A ladder authored longer than the tier count (an older doc, or a tier count
  // trimmed after the fact) would otherwise show rungs nobody can ever reach.
  const rewardsByTier = args.rewardsByTier.filter(
    (entry) => entry.tier <= config.tierCount,
  );
  const tier = seasonTierFromSteps(state.steps, config);
  const claimableFreeTiers = unclaimedSeasonTiers(
    tier,
    state.claimedFreeTiers,
    rewardsByTier,
    'free',
  );
  // Retroactive Plus: subscribing at tier 20 opens all 20 Plus rungs behind
  // you, because eligibility is recomputed from the tier you have reached.
  const claimablePlusTiers = args.isPremium
    ? unclaimedSeasonTiers(tier, state.claimedPlusTiers, rewardsByTier, 'plus')
    : [];

  return {
    id: season.seasonId,
    name: season.name,
    images: normalizeSeasonImages(season.images),
    startsAt: season.startsAt.toISOString(),
    endsAt: season.endsAt.toISOString(),
    graceEndsAt: seasonGraceEndsAt(
      season.endsAt,
      config.graceHours,
    ).toISOString(),
    ended: season.endsAt.getTime() <= args.now.getTime(),
    tierCount: config.tierCount,
    tier,
    steps: state.steps,
    stepsPerTier: config.stepsPerTier,
    stepsIntoTier: Math.max(0, state.steps - tier * config.stepsPerTier),
    tasksPerStep: config.tasksPerStep,
    maxStepsPerDay: config.maxStepsPerDay,
    tasksToday: args.tasksToday,
    stepsToday: state.stepsToday,
    dailyTaskGoal: config.tasksPerStep * config.maxStepsPerDay,
    tierSkipCost: config.tierSkipCost,
    flyBalance: args.flyBalance,
    purchasedTiers: state.purchasedTiers,
    isPremium: args.isPremium,
    claimedFreeTiers: state.claimedFreeTiers,
    claimedPlusTiers: state.claimedPlusTiers,
    claimableFreeTiers,
    claimablePlusTiers,
    claimableCount: claimableFreeTiers.length + claimablePlusTiers.length,
    claimable: claimableFreeTiers.length + claimablePlusTiers.length > 0,
    rewardsByTier,
  };
}

export async function findRunningSeason(now = new Date()) {
  return QuestSeasonModel.findOne({
    isActive: true,
    startsAt: { $lte: now },
    endsAt: { $gt: now },
  })
    .sort({ startsAt: -1 })
    .lean<QuestSeasonDoc | null>();
}

/**
 * The season the board shows, plus — for the grace window after a season ends —
 * the one just gone if it still owes the player tiers they reached. Nothing is
 * retired out from under someone mid-claim.
 */
export async function getQuestSeasonViews(args: {
  userId: string;
  timezone: string;
}): Promise<{ active: QuestSeasonView | null; grace: QuestSeasonView | null }> {
  const now = new Date();
  const [season, user] = await Promise.all([
    findRunningSeason(now),
    UserModel.findById(args.userId).lean(),
  ]);

  if (!user) return { active: null, grace: null };

  const todayKey = getZonedToday(args.timezone);
  const isPremium =
    new Date((user as any).premiumUntil ?? 0).getTime() > now.getTime();
  const flyBalance = Math.max(
    0,
    Math.floor(Number((user as any).wardrobe?.flies) || 0),
  );

  const tasksToday = tasksCompletedToday(user, todayKey);
  const graceSeason = await findGraceSeason({
    user,
    now,
    excludeSeasonId: season?.seasonId,
  });

  let graceView: QuestSeasonView | null = null;
  if (graceSeason) {
    // In `climb` mode the window is a real second ladder: the same tasks credit
    // both seasons, so someone who ended at tier 27 can finish without the new
    // season costing them the days it would take to catch up.
    const { state: graceState, gained: graceGained } = accrueSeasonSteps({
      state: graceSeason.state,
      config: graceSeason.config,
      tasksToday,
      todayKey,
      seasonRunning: graceSeason.config.graceMode === 'climb',
    });
    if (
      graceGained > 0 ||
      graceState.stepDayKey !== graceSeason.state.stepDayKey
    ) {
      await UserModel.updateOne(
        { _id: args.userId },
        { $set: { [`quests.seasons.${graceSeason.season.seasonId}`]: graceState } },
      ).catch(() => {});
    }
    graceView = buildSeasonView({
      season: graceSeason.season,
      state: graceState,
      config: graceSeason.config,
      rewardsByTier: graceSeason.rewardsByTier,
      tasksToday,
      flyBalance,
      isPremium,
      now,
    });
  }

  if (!season) return { active: null, grace: graceView };

  const config = readSeasonPassConfig(season);
  const rewardsByTier = readSeasonTierRewards(season);
  const stored = getUserQuestSeasonState(
    user,
    season.seasonId,
    config.tierCount,
  );
  const { state, gained } = accrueSeasonSteps({
    state: stored,
    config,
    tasksToday,
    todayKey,
    seasonRunning: true,
  });

  if (gained > 0 || state.stepDayKey !== stored.stepDayKey) {
    // A targeted $set on this one season's subpath: the quests dashboard can be
    // saving the same user document in parallel and must not be clobbered.
    await UserModel.updateOne(
      { _id: args.userId },
      { $set: { [`quests.seasons.${season.seasonId}`]: state } },
    ).catch(() => {});
  }

  return {
    active: buildSeasonView({
      season,
      state,
      config,
      rewardsByTier,
      tasksToday,
      flyBalance,
      isPremium,
      now,
    }),
    grace: graceView,
  };
}

async function findGraceSeason(args: {
  user: any;
  now: Date;
  excludeSeasonId?: string;
}) {
  const maxGraceMs = SEASON_PASS_LIMITS.graceHours.max * 3_600_000;
  const candidates = await QuestSeasonModel.find({
    ...(args.excludeSeasonId
      ? { seasonId: { $ne: args.excludeSeasonId } }
      : {}),
    endsAt: { $lte: args.now, $gt: new Date(args.now.getTime() - maxGraceMs) },
  })
    .sort({ endsAt: -1 })
    .limit(3)
    .lean<QuestSeasonDoc[]>();

  const isPremium =
    new Date(args.user?.premiumUntil ?? 0).getTime() > args.now.getTime();

  for (const season of candidates) {
    const config = readSeasonPassConfig(season);
    if (
      seasonGraceEndsAt(season.endsAt, config.graceHours).getTime() <=
      args.now.getTime()
    ) {
      continue;
    }
    const rewardsByTier = readSeasonTierRewards(season);
    const state = getUserQuestSeasonState(
      args.user,
      season.seasonId,
      config.tierCount,
    );
    if (state.steps <= 0) continue;
    const tier = seasonTierFromSteps(state.steps, config);
    const pending =
      unclaimedSeasonTiers(tier, state.claimedFreeTiers, rewardsByTier, 'free')
        .length +
      (isPremium
        ? unclaimedSeasonTiers(
            tier,
            state.claimedPlusTiers,
            rewardsByTier,
            'plus',
          ).length
        : 0);
    // Nothing to collect *and* nowhere left to climb means the season is done
    // with this player and should drop off the board.
    const canStillClimb =
      config.graceMode === 'climb' && tier < config.tierCount;
    if (pending === 0 && !canStillClimb) continue;
    return { season, config, rewardsByTier, state };
  }
  return null;
}

/** A season the user may still claim from: running, or inside its grace window. */
export async function findClaimableSeason(seasonId: string, now = new Date()) {
  const season = await QuestSeasonModel.findOne({ seasonId });
  if (!season) return null;
  if (season.startsAt.getTime() > now.getTime()) return null;
  if (season.endsAt.getTime() > now.getTime()) {
    return season.isActive ? season : null;
  }
  const config = readSeasonPassConfig(season);
  return seasonGraceEndsAt(season.endsAt, config.graceHours).getTime() >
    now.getTime()
    ? season
    : null;
}

// ── Template + generator ─────────────────────────────────────────────────────

export type SeasonTemplateView = SeasonPassConfig & {
  skinIds: SeasonSkinIds;
  limits: typeof SEASON_PASS_LIMITS;
  defaults: SeasonPassConfig;
};

export async function loadSeasonTemplate(): Promise<SeasonTemplateView> {
  const doc = await QuestSeasonTemplateModel.findOne({
    configId: SEASON_TEMPLATE_CONFIG_ID,
  }).lean();
  return {
    ...normalizeSeasonPassConfig(doc ?? SEASON_PASS_DEFAULTS),
    skinIds: normalizeSeasonSkinIds((doc as any)?.skinIds),
    limits: SEASON_PASS_LIMITS,
    defaults: SEASON_PASS_DEFAULTS,
  };
}

export async function saveSeasonTemplate(input: {
  config: SeasonPassConfig;
  skinIds: SeasonSkinIds;
}) {
  await QuestSeasonTemplateModel.findOneAndUpdate(
    { configId: SEASON_TEMPLATE_CONFIG_ID },
    { $set: { ...input.config, skinIds: input.skinIds } },
    { new: true, upsert: true },
  );
  return loadSeasonTemplate();
}

export function sanitizeSeasonRewards(input: unknown): QuestSeasonTierReward[] {
  return normalizeSeasonTierRewards(input);
}

export async function createQuestSeason(
  payload: SeasonPassConfig & {
    name: string;
    images?: QuestSeasonImages;
    startsAt: Date;
    endsAt: Date;
    tierRewards: QuestSeasonTierReward[];
    isActive: boolean;
  },
) {
  return QuestSeasonModel.create({
    seasonId: uuid(),
    ...payload,
    images: payload.images ?? emptySeasonImages(),
  });
}

/**
 * Builds a season off the saved template. The admin owns the name, the dates
 * and whether it goes live; the template owns the ladder and the pass knobs,
 * copied in so later template edits leave this season alone.
 */
export async function generateQuestSeason(input: {
  name: string;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  overrides?: Partial<SeasonPassConfig>;
  skinIds?: SeasonSkinIds;
}) {
  const template = await loadSeasonTemplate();
  const config = normalizeSeasonPassConfig({
    ...template,
    ...(input.overrides ?? {}),
  });
  const skinIds = input.skinIds
    ? normalizeSeasonSkinIds(input.skinIds)
    : template.skinIds;

  return createQuestSeason({
    name: input.name,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    isActive: input.isActive,
    ...config,
    tierRewards: buildSeasonPassLadder(config.tierCount, skinIds),
  });
}

export function buildDefaultSeasonRewards(
  tierCount: number,
): QuestSeasonTierReward[] {
  return buildSeasonPassLadder(tierCount);
}

export type SeasonRewardSummary = {
  fliesGranted: number;
  flyBalanceBefore: number;
  flyBalanceAfter: number;
  grantedItemIds: string[];
  shieldsRequested: number;
};

export function grantRewardsToUser(
  user: any,
  rewards: QuestRewards,
): SeasonRewardSummary {
  if (!user.wardrobe) {
    user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
  }
  user.wardrobe.inventory = user.wardrobe.inventory ?? {};
  user.wardrobe.unseenItems = user.wardrobe.unseenItems ?? [];
  user.wardrobe.flies = user.wardrobe.flies ?? 0;
  const summary: SeasonRewardSummary = {
    fliesGranted: 0,
    flyBalanceBefore: user.wardrobe.flies,
    flyBalanceAfter: user.wardrobe.flies,
    grantedItemIds: [],
    shieldsRequested: 0,
  };

  for (const reward of rewards) {
    if (reward.type === 'FLIES') {
      const amount =
        reward.amountMode === 'random'
          ? reward.maxAmount ?? reward.minAmount ?? 0
          : reward.amount ?? 0;
      user.wardrobe.flies += amount;
      summary.fliesGranted += amount;
      summary.flyBalanceAfter = user.wardrobe.flies;
    } else if (reward.type === 'SHIELD') {
      summary.shieldsRequested += Math.max(1, Math.floor(reward.amount ?? 1));
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
