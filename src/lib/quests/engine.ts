import { v4 as uuid } from 'uuid';
import QuestModel, { type QuestDoc } from '@/lib/models/Quest';
import CampaignModel, {
  type CampaignDoc,
  type CampaignObjectiveDoc,
} from '@/lib/models/Campaign';
import UserModel from '@/lib/models/User';
import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import type { UserDoc } from '@/lib/types/UserDoc';
import type { ItemDef, Rarity } from '@/lib/skins/catalog';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import { getZonedToday, getZonedYMD } from '@/lib/utils';
import { getMacroCategory, QUEST_MACRO_CATEGORIES } from './catalog';
import type {
  CampaignProgressView,
  DailyQuestKind,
  DailyQuestProgressView,
  FocusCategoryTagMap,
  FocusProfile,
  MacroCategoryId,
  QuestReward,
  TierRewards,
} from './types';

function hashString(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createSeededRandom(seed: string) {
  let state = hashString(seed) || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne<T>(items: T[], rng: () => number) {
  return items[Math.floor(rng() * items.length)];
}

function shuffle<T>(items: T[], rng: () => number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function isPremiumUser(user: UserDoc) {
  return user.premiumUntil ? new Date(user.premiumUntil) > new Date() : false;
}

export function normalizeFocusProfile(user: UserDoc): FocusProfile {
  return {
    completedAt: user.focusProfile?.completedAt ?? null,
    selectedCategoryIds: user.focusProfile?.selectedCategoryIds ?? [],
    categoryTagMap: user.focusProfile?.categoryTagMap ?? [],
    suggestedContentCreatedAt:
      user.focusProfile?.suggestedContentCreatedAt ?? null,
    unlockedAnimationIds: user.focusProfile?.unlockedAnimationIds ?? [],
  };
}

function hasAnyTag(task: TaskDoc, tagIds?: string[]) {
  if (!tagIds?.length) return false;
  const taskTags = task.tags ?? [];
  return tagIds.some((tagId) => taskTags.includes(tagId));
}

function taskCompletionDates(task: TaskDoc) {
  const dates = new Set(task.completedDates ?? []);
  if (task.type === 'regular' && task.completed && task.date)
    dates.add(task.date);
  return [...dates];
}

function countAddedTasks(
  tasks: TaskDoc[],
  timezone: string,
  startDate: string,
  endDate: string,
  predicate: (task: TaskDoc) => boolean,
) {
  return tasks.filter((task) => {
    if (!predicate(task) || !task.createdAt) return false;
    const createdDate = getZonedYMD(new Date(task.createdAt), timezone);
    return createdDate >= startDate && createdDate <= endDate;
  }).length;
}

function countCompletedEvents(
  tasks: TaskDoc[],
  startDate: string,
  endDate: string,
  predicate: (task: TaskDoc) => boolean,
) {
  return tasks.reduce((sum, task) => {
    if (!predicate(task)) return sum;
    return (
      sum +
      taskCompletionDates(task).filter(
        (dateStr) => dateStr >= startDate && dateStr <= endDate,
      ).length
    );
  }, 0);
}

function sumFocusSeconds(
  tasks: TaskDoc[],
  startDate: string,
  endDate: string,
  predicate: (task: TaskDoc) => boolean,
) {
  return tasks.reduce((sum, task) => {
    if (!predicate(task)) return sum;
    return (
      sum +
      (task.frogodoroSessions ?? []).reduce((taskSum, session) => {
        if (session.date >= startDate && session.date <= endDate) {
          return taskSum + (session.timeSpent ?? 0);
        }
        return taskSum;
      }, 0)
    );
  }, 0);
}

function longestConsecutiveDates(dateStrs: string[]) {
  const uniqueSorted = [...new Set(dateStrs)].sort();
  let best = 0;
  let current = 0;
  let previous: string | null = null;

  for (const dateStr of uniqueSorted) {
    if (!previous) {
      current = 1;
    } else {
      const diff =
        (new Date(`${dateStr}T12:00:00Z`).getTime() -
          new Date(`${previous}T12:00:00Z`).getTime()) /
        86400000;
      current = diff === 1 ? current + 1 : 1;
    }
    best = Math.max(best, current);
    previous = dateStr;
  }

  return best;
}

function rewardCatalogPick(
  catalog: ItemDef[],
  predicate: (item: ItemDef) => boolean,
  rng: () => number,
) {
  const matches = catalog.filter(predicate);
  if (!matches.length) return null;
  return pickOne(matches, rng);
}

function getMappedTagIds(profile: FocusProfile, categoryId: MacroCategoryId) {
  return (
    profile.categoryTagMap.find((entry) => entry.categoryId === categoryId)
      ?.tagIds ?? []
  );
}

function dailyQuestProgress(
  kind: DailyQuestKind,
  tasks: TaskDoc[],
  timezone: string,
) {
  const today = getZonedToday(timezone);
  switch (kind) {
    case 'complete_tasks':
      return countCompletedEvents(
        tasks,
        today,
        today,
        (task) => task.type !== 'habit',
      );
    case 'add_tasks':
      return countAddedTasks(
        tasks,
        timezone,
        today,
        today,
        (task) => task.type !== 'habit',
      );
    case 'complete_habits':
      return countCompletedEvents(
        tasks,
        today,
        today,
        (task) => task.type === 'habit',
      );
    case 'add_habits':
      return countAddedTasks(
        tasks,
        timezone,
        today,
        today,
        (task) => task.type === 'habit',
      );
    case 'focus_minutes':
      return Math.floor(sumFocusSeconds(tasks, today, today, () => true) / 60);
    default:
      return 0;
  }
}

function campaignObjectiveProgress(
  objective: CampaignObjectiveDoc,
  tasks: TaskDoc[],
  timezone: string,
  startsAt: Date,
  endsAt: Date,
) {
  const startDate = getZonedYMD(startsAt, timezone);
  const endDate = getZonedYMD(endsAt, timezone);

  switch (objective.kind) {
    case 'complete_tag_tasks':
      return countCompletedEvents(
        tasks,
        startDate,
        endDate,
        (task) => task.type !== 'habit' && hasAnyTag(task, objective.tagIds),
      );
    case 'add_tag_tasks':
      return countAddedTasks(
        tasks,
        timezone,
        startDate,
        endDate,
        (task) => task.type !== 'habit' && hasAnyTag(task, objective.tagIds),
      );
    case 'complete_tag_habits':
      return countCompletedEvents(
        tasks,
        startDate,
        endDate,
        (task) => task.type === 'habit' && hasAnyTag(task, objective.tagIds),
      );
    case 'add_tag_habits':
      return countAddedTasks(
        tasks,
        timezone,
        startDate,
        endDate,
        (task) => task.type === 'habit' && hasAnyTag(task, objective.tagIds),
      );
    case 'focus_tag_minutes':
      return Math.floor(
        sumFocusSeconds(tasks, startDate, endDate, (task) =>
          hasAnyTag(task, objective.tagIds),
        ) / 60,
      );
    case 'habit_streak': {
      const habit = tasks.find(
        (task) => task.type === 'habit' && task.id === objective.habitId,
      );
      if (!habit) return 0;
      const dates = taskCompletionDates(habit).filter(
        (dateStr) => dateStr >= startDate && dateStr <= endDate,
      );
      return longestConsecutiveDates(dates);
    }
    default:
      return 0;
  }
}

function buildDailyRewards(rng: () => number): TierRewards {
  return {
    free: [{ type: 'FLIES', amount: pickOne([20, 35, 50], rng) }],
    premium: [{ type: 'FLIES', amount: pickOne([35, 50, 75], rng) }],
  };
}

function buildCampaignRewards(
  categoryId: MacroCategoryId,
  durationDays: number,
  catalog: ItemDef[],
  rng: () => number,
): TierRewards {
  const freeFlies =
    durationDays === 14
      ? pickOne([900, 1200, 1600], rng)
      : pickOne([450, 600, 800], rng);
  const premiumFlies =
    durationDays === 14
      ? pickOne([1800, 2400, 3000], rng)
      : pickOne([900, 1200, 1600], rng);
  const freeItem =
    rewardCatalogPick(
      catalog,
      (item) =>
        item.slot !== 'container' && ['rare', 'epic'].includes(item.rarity),
      rng,
    ) ?? rewardCatalogPick(catalog, (item) => item.slot !== 'container', rng);
  const premiumItem =
    rewardCatalogPick(
      catalog,
      (item) =>
        item.slot !== 'container' &&
        (['epic', 'legendary'] as Rarity[]).includes(item.rarity),
      rng,
    ) ?? rewardCatalogPick(catalog, (item) => item.slot !== 'container', rng);
  const box = rewardCatalogPick(
    catalog,
    (item) => item.slot === 'container',
    rng,
  );
  const animationId =
    getMacroCategory(categoryId)?.premiumAnimationId ??
    `${categoryId}_signature_move`;

  return {
    free: [
      { type: 'FLIES', amount: freeFlies },
      ...(freeItem ? [{ type: 'ITEM' as const, itemId: freeItem.id }] : []),
      ...(box ? [{ type: 'BOX' as const, itemId: box.id }] : []),
    ],
    premium: [
      { type: 'FLIES', amount: premiumFlies },
      ...(premiumItem
        ? [{ type: 'ITEM' as const, itemId: premiumItem.id }]
        : []),
      { type: 'ANIMATION', animationId, label: 'Exclusive frog animation' },
    ],
  };
}

function buildDailyQuestDefinitions(seed: string) {
  const rng = createSeededRandom(seed);
  const completeTasksTarget = pickOne([3, 4, 5], rng);
  const addTasksTarget = pickOne([2, 3], rng);
  const completeHabitsTarget = pickOne([2, 3, 4], rng);
  const addHabitsTarget = pickOne([1, 2], rng);
  const focusTarget = pickOne([15, 20, 30], rng);
  return shuffle(
    [
      {
        kind: 'complete_tasks' as const,
        title: `Complete ${completeTasksTarget} tasks today`,
        description: 'Short push. Clear a few non-habit tasks today.',
        target: completeTasksTarget,
      },
      {
        kind: 'add_tasks' as const,
        title: `Add ${addTasksTarget} new tasks`,
        description: 'Capture a couple of new tasks while your brain is warm.',
        target: addTasksTarget,
      },
      {
        kind: 'complete_habits' as const,
        title: `Complete ${completeHabitsTarget} habits today`,
        description: 'Keep your routines moving with a few habit check-ins.',
        target: completeHabitsTarget,
      },
      {
        kind: 'add_habits' as const,
        title: `Add ${addHabitsTarget} new habit${addHabitsTarget > 1 ? 's' : ''}`,
        description: 'Set up a habit that you want to build next.',
        target: addHabitsTarget,
      },
      {
        kind: 'focus_minutes' as const,
        title: `Use the focus timer for ${focusTarget} minutes`,
        description: 'Log a short focus session on anything important today.',
        target: focusTarget,
      },
    ],
    rng,
  ).slice(0, 3);
}

function buildCampaignObjectives(args: {
  userId: string;
  categoryId: MacroCategoryId;
  tagIds: string[];
  tasks: TaskDoc[];
  durationDays: number;
}) {
  const { userId, categoryId, tagIds, tasks, durationDays } = args;
  const category = getMacroCategory(categoryId);
  const rng = createSeededRandom(
    `${userId}:${categoryId}:${tagIds.join(',')}:${durationDays}`,
  );
  const taggedHabits = tasks.filter(
    (task) => task.type === 'habit' && hasAnyTag(task, tagIds),
  );
  const objectives: CampaignObjectiveDoc[] = [
    {
      id: uuid(),
      kind: 'complete_tag_tasks',
      title: `Complete ${durationDays === 14 ? 10 : 5} tagged tasks`,
      description: `Finish ${category?.name ?? 'focus'} tasks tied to this campaign.`,
      target: durationDays === 14 ? 10 : 5,
      progress: 0,
      tagIds,
    },
    {
      id: uuid(),
      kind: 'focus_tag_minutes',
      title: `Focus for ${durationDays === 14 ? 180 : 90} minutes`,
      description: 'Use the timer on work tied to this campaign.',
      target: durationDays === 14 ? 180 : 90,
      progress: 0,
      tagIds,
    },
  ];

  if (taggedHabits.length > 0) {
    const habit = pickOne(taggedHabits, rng);
    objectives.push({
      id: uuid(),
      kind: 'habit_streak',
      title: `Build a ${durationDays === 14 ? 7 : 5} day streak`,
      description: `Stay consistent with ${habit.text}.`,
      target: durationDays === 14 ? 7 : 5,
      progress: 0,
      tagIds,
      habitId: habit.id,
      habitName: habit.text,
    });
  } else {
    objectives.push(
      pickOne(
        [
          {
            id: uuid(),
            kind: 'add_tag_tasks' as const,
            title: `Add ${durationDays === 14 ? 5 : 3} tagged tasks`,
            description: 'Create fresh tasks that belong to this category.',
            target: durationDays === 14 ? 5 : 3,
            progress: 0,
            tagIds,
          },
          {
            id: uuid(),
            kind: 'add_tag_habits' as const,
            title: `Add ${durationDays === 14 ? 2 : 1} tagged habits`,
            description: 'Create habits that belong to this category.',
            target: durationDays === 14 ? 2 : 1,
            progress: 0,
            tagIds,
          },
          {
            id: uuid(),
            kind: 'complete_tag_habits' as const,
            title: `Complete ${durationDays === 14 ? 10 : 5} tagged habits`,
            description: 'Check off habits linked to this category.',
            target: durationDays === 14 ? 10 : 5,
            progress: 0,
            tagIds,
          },
        ],
        rng,
      ),
    );
  }

  return objectives;
}

async function ensureDailyQuests(args: {
  userId: string;
  tasks: TaskDoc[];
  timezone: string;
}) {
  const { userId, tasks, timezone } = args;
  const windowKey = getZonedToday(timezone);
  let docs = await QuestModel.find({ userId, windowKey }).sort({
    createdAt: 1,
  });

  if (!docs.length) {
    const defs = buildDailyQuestDefinitions(`${userId}:${windowKey}`);
    docs = await QuestModel.insertMany(
      defs.map((entry) => ({
        userId,
        questId: `${windowKey}:${entry.kind}:${uuid()}`,
        kind: entry.kind,
        windowKey,
        title: entry.title,
        description: entry.description,
        target: entry.target,
        progress: 0,
        rewards: buildDailyRewards(
          createSeededRandom(`${userId}:${windowKey}:${entry.kind}`),
        ),
      })),
    );
  }

  for (const doc of docs) {
    const progress = dailyQuestProgress(doc.kind, tasks, timezone);
    const completed = progress >= doc.target;
    if (doc.progress !== progress) doc.progress = progress;
    if (completed && !doc.completedAt) doc.completedAt = new Date();
    if (!completed && doc.completedAt) doc.completedAt = null;
    if (doc.isModified()) await doc.save();
  }

  return docs;
}

async function ensureCampaigns(args: {
  user: UserDoc;
  tasks: TaskDoc[];
  timezone: string;
  catalog: ItemDef[];
}) {
  const { user, tasks, timezone, catalog } = args;
  const profile = normalizeFocusProfile(user);
  if (!profile.completedAt || !profile.selectedCategoryIds.length) return [];

  const now = new Date();
  const docs: CampaignDoc[] = [];

  for (const categoryId of profile.selectedCategoryIds) {
    const tagIds = getMappedTagIds(profile, categoryId);
    if (!tagIds.length) continue;

    let doc = await CampaignModel.findOne({
      userId: user._id,
      categoryId,
      claimedAt: null,
    }).sort({ startsAt: -1 });

    if (
      doc &&
      doc.endsAt < now &&
      doc.objectives.some((objective) => objective.progress < objective.target)
    ) {
      doc = null;
    }

    if (!doc) {
      const category = getMacroCategory(categoryId);
      const rng = createSeededRandom(
        `${user._id}:${categoryId}:${getZonedToday(timezone)}`,
      );
      const durationDays = pickOne(category?.durationDaysOptions ?? [7], rng);
      doc = await CampaignModel.create({
        userId: user._id,
        campaignId: `${categoryId}:${uuid()}`,
        categoryId,
        categoryName: category?.name ?? categoryId,
        title: pickOne(
          category?.campaignHeadlines ?? ['Category Campaign'],
          rng,
        ),
        subtitle: `Stay with ${category?.name ?? 'your focus'} for ${durationDays} days.`,
        durationDays,
        startsAt: now,
        endsAt: new Date(now.getTime() + durationDays * 86400000),
        objectives: buildCampaignObjectives({
          userId: user._id,
          categoryId,
          tagIds,
          tasks,
          durationDays,
        }),
        rewards: buildCampaignRewards(categoryId, durationDays, catalog, rng),
      });
    }

    for (const objective of doc.objectives) {
      const progress = campaignObjectiveProgress(
        objective,
        tasks,
        timezone,
        doc.startsAt,
        doc.endsAt,
      );
      if (objective.progress !== progress) objective.progress = progress;
    }

    if (doc.isModified()) {
      doc.markModified('objectives');
      await doc.save();
    }

    docs.push(doc);
  }

  return docs;
}

function questDocToView(doc: QuestDoc): DailyQuestProgressView {
  const completed = doc.progress >= doc.target;
  const claimed = !!doc.claimedAt;
  return {
    id: doc.questId,
    kind: doc.kind,
    windowKey: doc.windowKey,
    title: doc.title,
    description: doc.description,
    target: doc.target,
    progress: doc.progress,
    completed,
    claimable: completed && !claimed,
    claimed,
    rewards: doc.rewards,
  };
}

function campaignDocToView(doc: CampaignDoc): CampaignProgressView {
  const now = new Date();
  const objectives = doc.objectives.map((objective) => ({
    id: objective.id,
    kind: objective.kind,
    title: objective.title,
    description: objective.description,
    target: objective.target,
    progress: objective.progress,
    completed: objective.progress >= objective.target,
    tagIds: objective.tagIds,
    habitId: objective.habitId,
    habitName: objective.habitName,
  }));
  const completed = objectives.every((objective) => objective.completed);
  const claimed = !!doc.claimedAt;
  const expired = doc.endsAt < now;

  return {
    id: doc.campaignId,
    categoryId: doc.categoryId,
    categoryName: doc.categoryName,
    title: doc.title,
    subtitle: doc.subtitle,
    durationDays: doc.durationDays,
    startsAt: doc.startsAt.toISOString(),
    endsAt: doc.endsAt.toISOString(),
    secondsLeft: Math.max(
      0,
      Math.floor((doc.endsAt.getTime() - now.getTime()) / 1000),
    ),
    objectives,
    completed,
    claimable: completed && !claimed,
    claimed,
    expired: expired && !completed && !claimed,
    rewards: doc.rewards,
  };
}

export async function syncQuestState(args: {
  userId: string;
  timezone: string;
  catalog?: ItemDef[];
}) {
  const { userId, timezone } = args;
  const [user, tasks, catalog] = await Promise.all([
    UserModel.findById(userId).lean<UserDoc | null>(),
    TaskModel.find({ userId, deletedAt: { $exists: false } }).lean<TaskDoc[]>(),
    args.catalog ? Promise.resolve(args.catalog) : getFullCatalog(),
  ]);

  if (!user) throw new Error('User not found');

  const [dailyDocs, campaignDocs] = await Promise.all([
    ensureDailyQuests({ userId, tasks, timezone }),
    ensureCampaigns({ user, tasks, timezone, catalog }),
  ]);

  return {
    user,
    tasks,
    catalog,
    isPremium: isPremiumUser(user),
    focusProfile: normalizeFocusProfile(user),
    macroCategories: QUEST_MACRO_CATEGORIES,
    dailyQuests: dailyDocs.map(questDocToView),
    campaigns: campaignDocs.map(campaignDocToView),
  };
}

export function buildRewardCatalog(
  catalog: ItemDef[],
  rewardSets: TierRewards[],
) {
  const itemIds = new Set<string>();
  rewardSets.forEach((set) => {
    [...set.free, ...set.premium].forEach((reward) => {
      if (reward.itemId) itemIds.add(reward.itemId);
    });
  });

  return Object.fromEntries(
    catalog
      .filter((item) => itemIds.has(item.id))
      .map((item) => [item.id, item]),
  );
}

export async function saveFocusProfile(args: {
  userId: string;
  selectedCategoryIds: MacroCategoryId[];
  categoryTagMap: FocusCategoryTagMap[];
  createSuggestions?: boolean;
  timezone: string;
}) {
  const {
    userId,
    selectedCategoryIds,
    categoryTagMap,
    createSuggestions,
    timezone,
  } = args;
  const user = await UserModel.findById(userId);
  if (!user) throw new Error('User not found');

  const existing = normalizeFocusProfile(user.toObject());
  user.focusProfile = {
    ...existing,
    completedAt: existing.completedAt ?? new Date(),
    selectedCategoryIds,
    categoryTagMap,
    unlockedAnimationIds: existing.unlockedAnimationIds ?? [],
  };
  user.markModified('focusProfile');
  await user.save();

  if (createSuggestions && !existing.suggestedContentCreatedAt) {
    const today = getZonedToday(timezone);
    const existingTasks = await TaskModel.find({
      userId,
      deletedAt: { $exists: false },
      $or: [{ type: 'regular', date: today }, { type: 'habit' }],
    })
      .sort({ order: 1 })
      .lean<TaskDoc[]>();

    let nextOrder =
      (existingTasks.length
        ? existingTasks[existingTasks.length - 1].order
        : 0) + 1;
    const docs: TaskDoc[] = [];

    for (const categoryId of selectedCategoryIds) {
      const category = getMacroCategory(categoryId);
      const tagIds = getMappedTagIds(
        {
          completedAt: new Date(),
          selectedCategoryIds,
          categoryTagMap,
          unlockedAnimationIds: [],
        },
        categoryId,
      );
      if (!category || !tagIds.length) continue;

      docs.push({
        userId,
        type: 'regular',
        id: uuid(),
        text: category.taskSuggestions[0],
        order: nextOrder,
        completed: false,
        date: today,
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: tagIds,
      });
      nextOrder += 1;
      docs.push({
        userId,
        type: 'habit',
        id: uuid(),
        text: category.habitSuggestions[0].text,
        order: nextOrder,
        completed: false,
        timesPerWeek: category.habitSuggestions[0].timesPerWeek,
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: tagIds,
      });
      nextOrder += 1;
    }

    if (docs.length) await TaskModel.insertMany(docs);
    user.focusProfile = {
      ...((user.focusProfile as FocusProfile) ?? {}),
      selectedCategoryIds,
      categoryTagMap,
      completedAt: new Date(),
      suggestedContentCreatedAt: new Date(),
      unlockedAnimationIds:
        (user.focusProfile as FocusProfile)?.unlockedAnimationIds ?? [],
    };
    user.markModified('focusProfile');
    await user.save();
  }

  return syncQuestState({ userId, timezone });
}

export async function claimQuestReward(args: {
  userId: string;
  claimType: 'daily' | 'campaign';
  targetId: string;
  timezone: string;
}) {
  const { userId, claimType, targetId, timezone } = args;
  await syncQuestState({ userId, timezone });
  const user = await UserModel.findById(userId);
  if (!user) throw new Error('User not found');
  const isPremium = isPremiumUser(user.toObject());
  const summary = {
    fliesGranted: 0,
    grantedItemIds: [] as string[],
    grantedAnimationIds: [] as string[],
  };

  const applyRewards = (rewards: QuestReward[]) => {
    if (!user.wardrobe) {
      user.wardrobe = {
        equipped: {},
        inventory: {},
        unseenItems: [],
        flies: 0,
      };
    }
    user.wardrobe.inventory = user.wardrobe.inventory ?? {};
    user.wardrobe.unseenItems = user.wardrobe.unseenItems ?? [];
    user.wardrobe.flies = user.wardrobe.flies ?? 0;
    const profile = normalizeFocusProfile(user.toObject());

    rewards.forEach((reward) => {
      if (reward.type === 'FLIES') {
        const amount = reward.amount ?? 0;
        user.wardrobe!.flies += amount;
        summary.fliesGranted += amount;
        return;
      }
      if (reward.type === 'ANIMATION' && reward.animationId) {
        user.focusProfile = {
          ...profile,
          unlockedAnimationIds: Array.from(
            new Set([
              ...(profile.unlockedAnimationIds ?? []),
              reward.animationId,
            ]),
          ),
        };
        summary.grantedAnimationIds.push(reward.animationId);
        return;
      }
      if (reward.itemId) {
        user.wardrobe!.inventory[reward.itemId] =
          (user.wardrobe!.inventory[reward.itemId] ?? 0) + 1;
        user.wardrobe!.unseenItems!.push(reward.itemId);
        summary.grantedItemIds.push(reward.itemId);
      }
    });
  };

  if (claimType === 'daily') {
    const quest = await QuestModel.findOne({ userId, questId: targetId });
    if (!quest) throw new Error('Quest not found');
    if (quest.claimedAt || quest.progress < quest.target) {
      throw new Error('Quest is not claimable');
    }
    applyRewards([
      ...quest.rewards.free,
      ...(isPremium ? quest.rewards.premium : []),
    ]);
    quest.claimedAt = new Date();
    await quest.save();
  } else {
    const campaign = await CampaignModel.findOne({
      userId,
      campaignId: targetId,
    });
    if (!campaign) throw new Error('Campaign not found');
    if (
      campaign.claimedAt ||
      campaign.objectives.some(
        (objective) => objective.progress < objective.target,
      )
    ) {
      throw new Error('Campaign is not claimable');
    }
    applyRewards([
      ...campaign.rewards.free,
      ...(isPremium ? campaign.rewards.premium : []),
    ]);
    campaign.claimedAt = new Date();
    await campaign.save();
  }

  user.markModified('wardrobe');
  user.markModified('focusProfile');
  await user.save();
  return summary;
}
