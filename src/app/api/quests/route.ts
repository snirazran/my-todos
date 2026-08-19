import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import { buildRewardCatalog, syncQuestState } from '@/lib/quests/engine';
import {
  loadSweepConfig,
  previousDayKey,
  sweepRollRewards,
  syncDailySweep,
} from '@/lib/quests/streak';
import { parseTaskStreakDays } from '@/lib/quests/metrics';
import { rewardWorth } from '@/lib/quests/priority';
import { loadMoveToWebConfig, syncMoveToWeb } from '@/lib/quests/moveToWeb';
import { getQuestSeasonViews } from '@/lib/quests/seasons';
import { getZonedToday } from '@/lib/utils';
import { getCachedCatalog } from '@/lib/skins/getCatalog';
import {
  metricObjectiveLabel,
  metricRemainingLabel,
  objectiveHintText,
} from '@/lib/quests/metricLabels';
import { guideContextForBlock, guideIdForBlock } from '@/lib/hints/guides';

const isDataUrl = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:');

const templateCoverRef = (templateId: string) =>
  `/api/quests/cover?type=template&id=${encodeURIComponent(templateId)}`;

const categoryCoverRef = (categoryId: string) =>
  `/api/quests/cover?type=category&id=${encodeURIComponent(categoryId)}`;

const FREE_TAG_LIMIT = 6;
function withTemplateCover<T extends { templateId?: string; coverImageUrl?: string }>(
  quest: T,
  templatesWithCover: Set<string>,
): T {
  if (!quest.templateId || !templatesWithCover.has(quest.templateId)) return quest;
  return { ...quest, coverImageUrl: templateCoverRef(quest.templateId) };
}

function lightenCategory<T extends { id?: string; coverImageUrl?: string }>(
  category: T,
): T {
  if (!isDataUrl(category.coverImageUrl) || !category.id) return category;
  return { ...category, coverImageUrl: categoryCoverRef(category.id) };
}

type ObjectiveLabelBlock = {
  type?: string;
  subject?: string;
  action?: string;
  tagMode?: string;
  metricKey?: string;
  target?: number;
  progress?: number;
  sessionMinutes?: number;
  requiresFollowThrough?: boolean;
  beforeHour?: number;
};

function objectiveSummaryLabel(block: ObjectiveLabelBlock): string {
  const target = Math.max(0, block.target ?? 0);
  if (block.type === 'metric_count') {
    return metricObjectiveLabel(block.metricKey, target);
  }
  if (block.type === 'focus_minutes') {
    return `Focus ${target} minutes`;
  }
  if (block.type === 'distinct_days') {
    const days = target === 1 ? 'day' : 'days';
    return `Show up ${target} ${days}`;
  }
  if (block.type === 'deep_session') {
    const minutes = block.sessionMinutes ?? 25;
    return target === 1
      ? `Focus ${minutes} min in one sitting`
      : `${target} focus sessions of ${minutes} min`;
  }
  if (block.type === 'day_parts') {
    const parts = Math.min(3, Math.max(1, target));
    if (parts === 1) return 'Finish a task today';
    if (parts >= 3) return 'Finish tasks morning, noon and night';
    return 'Finish tasks in 2 parts of the day';
  }
  const scope = block.subject === 'any' || target !== 1 ? 'tasks' : 'task';
  if (block.action === 'add') {
    return block.requiresFollowThrough
      ? `Plan and finish ${target} ${scope}`
      : `Add ${target} ${scope}`;
  }
  if (typeof block.beforeHour === 'number') {
    return `Finish ${target} ${scope} ${hourCutoffLabel(block.beforeHour)}`;
  }
  return `Finish ${target} ${scope}`;
}

function hourCutoffLabel(hour: number): string {
  if (hour === 12) return 'before noon';
  if (hour < 12) return `before ${hour}am`;
  return `before ${hour - 12}pm`;
}

type ObjectiveTagChip = {
  id: string;
  name: string;
  color: string;
};

type ClaimableEntry = {
  id: string;
  questId?: string;
  objectiveId?: string;
  kind: 'objective' | 'season' | 'sweep';
  placement?: 'daily' | 'onboarding';
  categoryName?: string;
  objectiveLabel?: string;
  tags?: ObjectiveTagChip[];
  seasonId?: string;
  seasonName?: string;
  tier?: number;
  tierCount?: number;
  sweepTier?: 'standard' | 'golden';
  sweepMega?: boolean;
  sweepPendingRolls?: number;
  reward?: any;
  rewards?: any[];
};

type TrackableEntry = {
  id: string;
  questId: string;
  placement: 'daily' | 'onboarding';
  categoryId?: string;
  categoryName?: string;
  objectiveLabel: string;
  remainingLabel: string;
  objectiveType?: string;
  actionKey?: string;
  questDone?: number;
  questTotal?: number;
  tags?: ObjectiveTagChip[];
  needsFocusTags?: boolean;
  progress: number;
  target: number;
  tierIndex?: number;
  reward?: any;
  rewards?: any[];
  hint?: string;
  guideId?: string;
  guideContext?: import('@/lib/hints/guides').HintGuideContext;
  lastProgressAt?: string;
  expiresAt?: string;
  effortToActNow?: number;
  effortToComplete?: number;
  effortAtRiskDays?: number;
  rewardValue?: number;
};

// Exchange rates between objective units and "days of work". These are the
// single place ranking decides a focus minute is worth a tenth of a task, and
// the only inputs that need calibrating against real completion telemetry.
const TASK_UNIT_EFFORT_DAYS = 0.1;
const FOCUS_MINUTE_EFFORT_DAYS = 0.01;
// Typing a title is not the work; only the follow-through is. A bare add is
// priced near zero so it reads as the on-ramp it is.
const ADD_UNIT_EFFORT_DAYS = 0.01;
// A day you have to show up on cannot be compressed by working harder today,
// so each one costs most of a calendar day.
const DISTINCT_DAY_EFFORT_DAYS = 0.8;
/** A day-part is a few hours of calendar, not a few hours of work. */
const DAY_PART_EFFORT_DAYS = 0.2;

function dayPartsElapsed(localHour: number): number {
  if (localHour < 12) return 1;
  if (localHour < 17) return 2;
  return 3;
}

type EffortTask = {
  type?: string;
  tags?: string[];
  completedDates?: string[];
  lateCompletedDates?: string[];
};

function bestStreakRun(
  tasks: EffortTask[],
  todayKey: string,
  tagIds?: string[],
): { runDays: number; completedToday: boolean } {
  const wanted = tagIds?.length ? new Set(tagIds) : null;
  let best = { runDays: 0, completedToday: false };
  for (const task of tasks) {
    if (task.type !== 'weekly') continue;
    if (wanted && !task.tags?.some((tagId) => wanted.has(tagId))) continue;
    const dates = new Set(task.completedDates ?? []);
    for (const d of task.lateCompletedDates ?? []) dates.delete(d);
    const completedToday = dates.has(todayKey);
    let runDays = completedToday ? 1 : 0;
    let day = previousDayKey(todayKey);
    while (dates.has(day)) {
      runDays += 1;
      day = previousDayKey(day);
    }
    if (
      runDays > best.runDays ||
      (runDays === best.runDays && completedToday && !best.completedToday)
    ) {
      best = { runDays, completedToday };
    }
  }
  return best;
}

// Two different effort questions, and ranking needs them apart. `actNow` is
// what it takes to move this objective today — the WSJF denominator. `complete`
// is what it takes to finish outright, which for a streak is calendar days no
// amount of effort today can compress.
function objectiveEffort(
  block: {
    type?: string;
    metricKey?: string;
    target?: number;
    progress?: number;
    action?: string;
    sessionMinutes?: number;
    requiresFollowThrough?: boolean;
  },
  tasks: EffortTask[],
  todayKey: string,
  localHour: number,
  tagIds?: string[],
): {
  effortToActNow: number;
  effortToComplete: number;
  effortAtRiskDays: number;
} {
  const target = Math.max(1, block.target ?? 1);
  const remainingUnits = Math.max(1, target - Math.max(0, block.progress ?? 0));
  const streakDays = parseTaskStreakDays(block.metricKey);
  if (block.type === 'metric_count' && streakDays !== null) {
    const { runDays, completedToday } = bestStreakRun(tasks, todayKey, tagIds);
    const credit = runDays >= streakDays ? 0 : runDays;
    const effortToComplete =
      streakDays - credit + (remainingUnits - 1) * streakDays;
    return {
      // Today's link in the chain is one task. Once it is done there is no
      // action left to surface, so it costs the wait until tomorrow.
      effortToActNow: completedToday ? effortToComplete : TASK_UNIT_EFFORT_DAYS,
      effortToComplete,
      effortAtRiskDays: completedToday ? 0 : credit,
    };
  }
  if (block.type === 'distinct_days') {
    // Today's link is one task, but only while today is still unclaimed —
    // once it counts, no amount of work today buys the next day.
    const wanted = tagIds?.length ? new Set(tagIds) : null;
    const showedUpToday = tasks.some((task) => {
      if (wanted && !task.tags?.some((tagId) => wanted.has(tagId))) return false;
      return (task.completedDates ?? []).includes(todayKey);
    });
    const effortToComplete = remainingUnits * DISTINCT_DAY_EFFORT_DAYS;
    return {
      effortToActNow: showedUpToday ? effortToComplete : TASK_UNIT_EFFORT_DAYS,
      effortToComplete,
      effortAtRiskDays: 0,
    };
  }
  if (block.type === 'day_parts') {
    // Once every stretch of the day that has already passed is covered, no
    // amount of work now buys the next one — it costs the wait for it.
    const partsElapsed = dayPartsElapsed(localHour);
    const currentPartDone = Math.max(0, block.progress ?? 0) >= partsElapsed;
    const effortToComplete = remainingUnits * DAY_PART_EFFORT_DAYS;
    return {
      effortToActNow: currentPartDone ? effortToComplete : TASK_UNIT_EFFORT_DAYS,
      effortToComplete,
      effortAtRiskDays: 0,
    };
  }
  if (block.type === 'deep_session') {
    const days = remainingUnits * (block.sessionMinutes ?? 25) * FOCUS_MINUTE_EFFORT_DAYS;
    return {
      effortToActNow: days,
      effortToComplete: days,
      effortAtRiskDays: 0,
    };
  }
  const unitDays =
    block.type === 'focus_minutes'
      ? FOCUS_MINUTE_EFFORT_DAYS
      : block.action === 'add' && !block.requiresFollowThrough
        ? ADD_UNIT_EFFORT_DAYS
        : TASK_UNIT_EFFORT_DAYS;
  const days = remainingUnits * unitDays;
  return {
    effortToActNow: days,
    effortToComplete: days,
    effortAtRiskDays: 0,
  };
}


function objectiveRemainingLabel(
  block: ObjectiveLabelBlock,
): string {
  const target = Math.max(1, block.target ?? 1);
  const progress = Math.max(0, block.progress ?? 0);
  if (progress <= 0) return objectiveSummaryLabel(block);
  const remaining = Math.max(1, target - progress);
  if (block.type === 'metric_count') {
    return metricRemainingLabel(block.metricKey, remaining);
  }
  if (block.type === 'focus_minutes') {
    return `Focus ${remaining} more min`;
  }
  if (block.type === 'distinct_days') {
    return remaining === 1
      ? 'Show up on 1 more day'
      : `Show up on ${remaining} more days`;
  }
  if (block.type === 'deep_session') {
    const minutes = block.sessionMinutes ?? 25;
    return remaining === 1
      ? `One more ${minutes}-min sitting`
      : `${remaining} more ${minutes}-min sittings`;
  }
  if (block.type === 'day_parts') {
    return remaining === 1
      ? 'Finish a task later today'
      : `Finish tasks in ${remaining} more parts of the day`;
  }
  const scope = remaining === 1 ? 'task' : 'tasks';
  if (block.action === 'add') {
    return block.requiresFollowThrough
      ? `Finish ${remaining} more planned ${scope}`
      : `Add ${remaining} more ${scope}`;
  }
  if (typeof block.beforeHour === 'number') {
    return `Finish ${remaining} more ${scope} ${hourCutoffLabel(block.beforeHour)}`;
  }
  return `Complete ${remaining} more ${scope}`;
}

function normalizeQuestTag(tag: any, index: number, isPremium: boolean) {
  if (typeof tag === 'string') {
    const name = tag.trim();
    if (!name) return null;
    return {
      id: name,
      name,
      color: '#22c55e',
      key: `${name}-${index}`,
      disabled: !isPremium && index >= FREE_TAG_LIMIT,
    };
  }

  if (!tag || typeof tag !== 'object') return null;

  const name =
    typeof tag.name === 'string' && tag.name.trim()
      ? tag.name.trim()
      : typeof tag.id === 'string' && tag.id.trim()
        ? tag.id.trim()
        : '';

  if (!name) return null;

  const id =
    typeof tag.id === 'string' && tag.id.trim()
      ? tag.id.trim()
      : name;
  const color =
    typeof tag.color === 'string' && tag.color.trim()
      ? tag.color.trim()
      : '#22c55e';

  return {
    id,
    name,
    color,
    key: typeof tag._key === 'string' ? tag._key : `${id}-${index}`,
    disabled: !isPremium && index >= FREE_TAG_LIMIT,
  };
}

export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return NextResponse.json(
      process.env.NODE_ENV === 'production'
        ? { error: 'Unauthorized' }
        : {
            error: 'Unauthorized',
            details: error instanceof Error ? error.message : 'Unknown auth error',
          },
      { status: 401 },
    );
  }

  try {
    await connectMongo();
    const searchParams = new URL(req.url).searchParams;
    const timezone = searchParams.get('timezone') || 'UTC';
    const view = searchParams.get('view');
    const isSummary = view === 'summary' || view === 'home' || searchParams.get('summary') === '1';
    const includeCategories =
      !isSummary ||
      view === 'home' ||
      searchParams.get('includeCategories') === '1';

    const [dashboard, seasonViews, sweepConfig, moveToWebConfig] =
      await Promise.all([
        syncQuestState({
          userId,
          timezone,
          includeCatalog: !isSummary,
          includeCategories,
        }),
        getQuestSeasonViews({ userId, timezone }),
        loadSweepConfig(),
        loadMoveToWebConfig(),
      ]);
    const activeSeason = seasonViews.active;
    const graceSeason = seasonViews.grace;

    const dailySweep = await syncDailySweep({
      user: dashboard.user,
      config: sweepConfig,
      dailyQuests: dashboard.dailyQuests,
      todayKey: getZonedToday(timezone),
    });
    const moveToWebSynced = await syncMoveToWeb({
      user: dashboard.user,
      config: moveToWebConfig,
    });
    const moveToWeb = dashboard.firstOnboardingComplete
      ? moveToWebSynced
      : null;
    // Count prizes ready to collect. Quests no longer have an end-reward —
    // only per-objective rewards are claimable, so count one per completed
    // objective with unclaimed rewards.
    const questClaimable = [...(dashboard.onboardingQuests ?? []), ...dashboard.dailyQuests].reduce(
      (sum, quest) => {
        if (quest.claimed) return sum;
        let count = 0;
        quest.logic.forEach((block) => {
          if (
            (block.rewards?.length ?? 0) > 0 &&
            block.progress >= block.target &&
            !quest.claimedObjectiveIds.includes(block.id)
          ) {
            count++;
          }
        });
        return sum + count;
      },
      0,
    );
    const seasonDailyClaimable =
      (activeSeason?.claimableCount ?? 0) + (graceSeason?.claimableCount ?? 0);
    const streakClaimable = dailySweep?.claimable ? dailySweep.pendingRolls : 0;
    const moveToWebClaimable = moveToWeb?.claimable ? 1 : 0;
    const claimableCount =
      questClaimable + seasonDailyClaimable + streakClaimable + moveToWebClaimable;

    const tagChipById = new Map<string, ObjectiveTagChip>();
    for (const tag of (dashboard.user.tags ?? []) as unknown[]) {
      if (typeof tag === 'string') {
        const name = tag.trim();
        if (name) tagChipById.set(name, { id: name, name, color: '#22c55e' });
        continue;
      }
      if (!tag || typeof tag !== 'object') continue;
      const name =
        typeof (tag as any).name === 'string' && (tag as any).name.trim()
          ? (tag as any).name.trim()
          : typeof (tag as any).id === 'string'
            ? (tag as any).id.trim()
            : '';
      if (!name) continue;
      const id =
        typeof (tag as any).id === 'string' && (tag as any).id.trim()
          ? (tag as any).id.trim()
          : name;
      const color =
        typeof (tag as any).color === 'string' && (tag as any).color.trim()
          ? (tag as any).color.trim()
          : '#22c55e';
      tagChipById.set(id, { id, name, color });
    }
    const claimables: ClaimableEntry[] = [];
    for (const quest of [...(dashboard.onboardingQuests ?? []), ...dashboard.dailyQuests]) {
      if (quest.claimed) continue;
      const activeOnboardingObjectiveId =
        quest.placement === 'onboarding'
          ? quest.logic.find(
              (block) =>
                (block.rewards?.length ?? 0) > 0 &&
                !quest.claimedObjectiveIds.includes(block.id),
            )?.id
          : null;
      for (const block of quest.logic) {
        if (
          quest.placement === 'onboarding' &&
          block.id !== activeOnboardingObjectiveId
        ) {
          continue;
        }
        if (
          (block.rewards?.length ?? 0) > 0 &&
          block.progress >= block.target &&
          !quest.claimedObjectiveIds.includes(block.id)
        ) {
          claimables.push({
            id: `${quest.id}:${block.id}`,
            questId: quest.id,
            objectiveId: block.id,
            kind: 'objective',
            placement: quest.placement,
            objectiveLabel: objectiveSummaryLabel(block),
            reward: block.rewards?.[0],
            rewards: block.rewards ?? undefined,
          });
        }
      }
    }
    if (dailySweep && dailySweep.pendingRolls > 0) {
      const rollTable =
        dailySweep.nextTier === 'golden'
          ? dailySweep.goldenRoll
          : dailySweep.standardRoll;
      const sweepRewards = [
        ...sweepRollRewards(rollTable),
        ...(dailySweep.nextMega
          ? sweepRollRewards(
              dailySweep.megaRewards.map((reward) => ({
                id: '',
                chance: 1,
                reward,
              })),
            )
          : []),
      ];
      claimables.push({
        id: `sweep:${dailySweep.nextRollDayKey ?? 'ready'}`,
        kind: 'sweep',
        sweepTier: dailySweep.nextTier,
        sweepMega: dailySweep.nextMega,
        sweepPendingRolls: dailySweep.pendingRolls,
        reward: sweepRewards[0],
        rewards: sweepRewards.length ? sweepRewards : undefined,
      });
    }
    const trackables: TrackableEntry[] = [];
    const effortTodayKey = getZonedToday(timezone);
    const effortLocalHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        hour12: false,
      }).format(new Date()),
    );
    const effortHour = Number.isFinite(effortLocalHour) ? effortLocalHour : 12;
    const withBlockEffort = <T extends { logic: any[] }>(quest: T): T => ({
      ...quest,
      logic: quest.logic.map((block) => ({
        ...block,
        ...objectiveEffort(block, dashboard.tasks, effortTodayKey, effortHour),
      })),
    });
    for (const quest of [...(dashboard.onboardingQuests ?? []), ...dashboard.dailyQuests]) {
      if (quest.claimed) continue;
      const activeOnboardingObjectiveId =
        quest.placement === 'onboarding'
          ? quest.logic.find(
              (block) =>
                (block.rewards?.length ?? 0) > 0 &&
                !quest.claimedObjectiveIds.includes(block.id),
            )?.id
          : null;
      for (let tierIndex = 0; tierIndex < quest.logic.length; tierIndex++) {
        const block = quest.logic[tierIndex];
        if (
          quest.placement === 'onboarding' &&
          block.id !== activeOnboardingObjectiveId
        ) {
          continue;
        }
        const target = Math.max(1, block.target);
        if ((block.rewards?.length ?? 0) === 0) continue;
        if (block.progress >= target) continue;
        if (quest.claimedObjectiveIds.includes(block.id)) continue;
        trackables.push({
          id: `${quest.id}:${block.id}`,
          questId: quest.id,
          placement: quest.placement,
          tierIndex,
          objectiveLabel: objectiveSummaryLabel(block),
          remainingLabel: objectiveRemainingLabel(block),
          objectiveType: block.type,
          // Where this objective sits in its ladder, so a surface can show the
          // whole arc without re-deriving it from a list that omits finished
          // tiers by design.
          questDone: quest.logic.filter(
            (b) =>
              (b.rewards?.length ?? 0) > 0 &&
              b.progress >= Math.max(1, b.target),
          ).length,
          questTotal: quest.logic.filter((b) => (b.rewards?.length ?? 0) > 0)
            .length,
          // Objectives that the same act advances. Two tiers sharing this key
          // are not two things to do — the nearer one is on the way to the
          // further one, so only the nearer belongs on the "next up" card.
          actionKey: [
            block.type,
            block.action ?? '',
            block.metricKey ?? '',
            block.sessionMinutes ?? '',
            block.beforeHour ?? '',
            block.requiresFollowThrough ? 'follow' : '',
          ].join('|'),
          progress: Math.max(0, block.progress),
          target,
          ...objectiveEffort(block, dashboard.tasks, effortTodayKey, effortHour),
          reward: block.rewards?.[0],
          rewards: block.rewards ?? undefined,
          rewardValue: rewardWorth(block.rewards),
          lastProgressAt: quest.lastProgressAt,
          expiresAt: quest.expiresAt,
          hint: objectiveHintText(block),
          guideId: guideIdForBlock(block) ?? undefined,
          guideContext: guideContextForBlock(block) ?? undefined,
        });
      }
    }
    for (const season of [activeSeason, graceSeason]) {
      if (!season?.claimable) continue;
      const rewardByTier = new Map(
        season.rewardsByTier.map((entry) => [entry.tier, entry]),
      );
      const seasonRewards = [
        ...season.claimableFreeTiers.flatMap(
          (tier) => rewardByTier.get(tier)?.freeRewards ?? [],
        ),
        ...season.claimablePlusTiers.flatMap(
          (tier) => rewardByTier.get(tier)?.premiumRewards ?? [],
        ),
      ];
      const topTier = Math.max(
        ...[...season.claimableFreeTiers, ...season.claimablePlusTiers],
      );
      claimables.push({
        id: `season:${season.id}:${topTier}`,
        kind: 'season',
        seasonId: season.id,
        seasonName: season.name,
        tier: topTier,
        tierCount: season.claimableCount,
        reward: seasonRewards[0],
        rewards: seasonRewards.length ? seasonRewards : undefined,
      });
    }
    const claimableRewards = [...claimables, ...trackables]
      .flatMap((c) => (c.rewards?.length ? c.rewards : [c.reward]))
      .filter(Boolean) as import('@/lib/quests/types').QuestRewards;
    let claimablesRewardCatalog: Record<string, unknown> = {};
    if (isSummary && claimableRewards.some((r) => r?.itemId || r?.backgroundId)) {
      const catalog = dashboard.catalog?.length
        ? dashboard.catalog
        : await getCachedCatalog();
      claimablesRewardCatalog = buildRewardCatalog(catalog, [claimableRewards]);
    }

    // Count active quests the user can still work on (not claimed, not yet fully claimable)
    const activeCount = [...(dashboard.onboardingQuests ?? []), ...dashboard.dailyQuests].filter(
      (quest) => !quest.claimed && !quest.claimable,
    ).length;
    const lightMacroCategories = dashboard.macroCategories.map(lightenCategory);

    if (isSummary) {
      return NextResponse.json(
        {
          isPremium: dashboard.isPremium,
          claimableCount,
          claimables,
          trackables,
          claimablesRewardCatalog,
          activeCount,
          dailySweep,
          onboarding: {
            complete: !!dashboard.focusProfile.completedAt,
            selectedCategoryIds: dashboard.focusProfile.selectedCategoryIds,
            categoryTagMap: dashboard.focusProfile.categoryTagMap,
          },
          activeSeason,
          graceSeason,
          ...(includeCategories ? { macroCategories: lightMacroCategories } : {}),
        },
        {
          headers: {
            'Cache-Control': 'private, no-store',
          },
        },
      );
    }

    const tags = (dashboard.user.tags ?? [])
      .map((tag: any, index: number) =>
        normalizeQuestTag(tag, index, dashboard.isPremium),
      )
      .filter(Boolean);
    const seasonRewardCatalog = buildRewardCatalog(
      dashboard.catalog,
      [activeSeason, graceSeason].flatMap((season) =>
        (season?.rewardsByTier ?? []).flatMap((entry) => [
          entry.freeRewards,
          entry.premiumRewards,
        ]),
      ),
    );
    const sweepRewardCatalog = dailySweep
      ? buildRewardCatalog(dashboard.catalog, [
          sweepRollRewards(dailySweep.standardRoll),
          sweepRollRewards(dailySweep.goldenRoll),
          sweepRollRewards(
            dailySweep.megaRewards.map((reward) => ({ id: '', chance: 1, reward })),
          ),
        ])
      : {};
    const moveToWebRewardCatalog = moveToWeb?.reward
      ? buildRewardCatalog(dashboard.catalog, [[moveToWeb.reward]])
      : {};

    return NextResponse.json(
      {
        isPremium: dashboard.isPremium,
        claimableCount,
        activeCount,
        frogName: (dashboard.user as { frogName?: string }).frogName ?? null,
        dailySweep,
        moveToWeb,
        onboarding: {
          complete: !!dashboard.focusProfile.completedAt,
          selectedCategoryIds: dashboard.focusProfile.selectedCategoryIds,
          categoryTagMap: dashboard.focusProfile.categoryTagMap,
        },
        tags,
        macroCategories: lightMacroCategories,
        activeSeason,
        graceSeason,
        dailyQuests: dashboard.dailyQuests.map((q) =>
          withBlockEffort(withTemplateCover(q, dashboard.templatesWithCover)),
        ),
        dailyQuestsGated: dashboard.dailyQuestsGated,
        dailyRerollsLeft: dashboard.dailyRerollsLeft,
        firstOnboardingComplete: dashboard.firstOnboardingComplete,
        earlyObjectiveSteps: dashboard.earlyObjectiveSteps,
        onboardingQuests: (dashboard.onboardingQuests ?? []).map((q) =>
          withBlockEffort(withTemplateCover(q, dashboard.templatesWithCover)),
        ),
        rewardCatalog: {
          ...dashboard.rewardCatalog,
          ...seasonRewardCatalog,
          ...sweepRewardCatalog,
          ...moveToWebRewardCatalog,
        },
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (error) {
    console.error('Error loading quests:', error);
    return NextResponse.json(
      process.env.NODE_ENV === 'production'
        ? { error: 'Failed to load quests' }
        : {
            error: 'Failed to load quests',
            details: error instanceof Error ? error.message : 'Unknown quests error',
          },
      { status: 500 },
    );
  }
}
