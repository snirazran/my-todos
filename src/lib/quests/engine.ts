import QuestModel, { type QuestDoc } from '@/lib/models/Quest';
import QuestTemplateModel, {
  type QuestTemplateDoc,
} from '@/lib/models/QuestTemplate';
import UserModel from '@/lib/models/User';
import TaskModel, { type TaskDoc } from '@/lib/models/Task';
import QuestCategoryModel, { type QuestCategoryDoc } from '@/lib/models/QuestCategory';
import connectMongo from '@/lib/mongoose';
import type { UserDoc } from '@/lib/types/UserDoc';
import type { ItemDef } from '@/lib/skins/catalog';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import { getZonedToday, getZonedYMD } from '@/lib/utils';
import type {
  CategoryQuestProgressView,
  DailyQuestProgressView,
  FocusCategoryTagMap,
  FocusProfile,
  MacroCategoryDefinition,
  MacroCategoryId,
  QuestLogicBlock,
  QuestPlacement,
  QuestProgressView,
  QuestReward,
  QuestRewards,
  QuestSubject,
  QuestTemplateView,
  QuestVisibilityCondition,
  ResolvedQuestLogicBlock,
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

function shuffle<T>(items: T[], rng: () => number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function byTemplateOrder(a: QuestTemplateDoc, b: QuestTemplateDoc) {
  if (a.placement !== b.placement) {
    return a.placement.localeCompare(b.placement);
  }

  return (
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
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

function getUserTagId(tag: unknown) {
  if (!tag || typeof tag !== 'object') return null;
  const tagRecord = tag as { id?: unknown; name?: unknown };
  if (typeof tagRecord.id === 'string' && tagRecord.id.trim()) {
    return tagRecord.id.trim();
  }
  if (typeof tagRecord.name === 'string' && tagRecord.name.trim()) {
    return tagRecord.name.trim();
  }
  return null;
}

function getUserTagName(tag: unknown) {
  if (!tag || typeof tag !== 'object') return null;
  const tagRecord = tag as { id?: unknown; name?: unknown };
  if (typeof tagRecord.name === 'string' && tagRecord.name.trim()) {
    return tagRecord.name.trim();
  }
  if (typeof tagRecord.id === 'string' && tagRecord.id.trim()) {
    return tagRecord.id.trim();
  }
  return null;
}

function hasAnyTag(task: TaskDoc, tagIds?: string[]) {
  if (!tagIds?.length) return true;
  const taskTags = task.tags ?? [];
  return tagIds.some((tagId) => taskTags.includes(tagId));
}

function taskCompletionDates(task: TaskDoc) {
  const dates = new Set(task.completedDates ?? []);
  if (task.type === 'regular' && task.completed && task.date) {
    dates.add(task.date);
  }
  return Array.from(dates);
}

function matchesSubject(task: TaskDoc, subject: QuestSubject) {
  if (subject === 'any') return true;
  if (subject === 'habit') return task.type === 'habit';
  return task.type !== 'habit';
}

function matchesLogicBlock(task: TaskDoc, block: QuestLogicBlock) {
  const effectiveSubject: QuestSubject =
    block.type === 'focus_minutes' ? 'task' : block.subject;
  if (!matchesSubject(task, effectiveSubject)) return false;
  const tagIds =
    block.tagMode === 'random_user_tag' &&
    'resolvedTagId' in block &&
    block.resolvedTagId
      ? [block.resolvedTagId]
      : block.tagMode === 'focus_category_tags' &&
          'resolvedTagIds' in block &&
          Array.isArray(block.resolvedTagIds)
        ? block.resolvedTagIds
        : undefined;
  if (
    (block.tagMode === 'random_user_tag' ||
      block.tagMode === 'focus_category_tags') &&
    (!tagIds || tagIds.length === 0)
  ) {
    return false;
  }
  if (!hasAnyTag(task, tagIds)) return false;
  return true;
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

function resolveLogicTarget(
  block: QuestLogicBlock,
  seed: string,
) {
  if (block.amountMode === 'fixed') {
    return Math.max(1, block.amount ?? 1);
  }

  const min = Math.max(1, Math.min(block.minAmount ?? 1, block.maxAmount ?? 1));
  const max = Math.max(min, block.maxAmount ?? min);
  const rng = createSeededRandom(seed);
  return Math.floor(rng() * (max - min + 1)) + min;
}

function resolveRewardAmount(reward: QuestReward, seed: string) {
  const amountMode = reward.amountMode ?? 'fixed';
  if (amountMode === 'fixed') {
    return Math.max(1, reward.amount ?? 1);
  }

  const min = Math.max(1, Math.min(reward.minAmount ?? 1, reward.maxAmount ?? 1));
  const max = Math.max(min, reward.maxAmount ?? min);
  const rng = createSeededRandom(seed);
  return Math.floor(rng() * (max - min + 1)) + min;
}

function progressForLogicBlock(args: {
  block: QuestLogicBlock;
  tasks: TaskDoc[];
  timezone: string;
  startDate: string;
  endDate: string;
}) {
  const { block, tasks, timezone, startDate, endDate } = args;

  if (block.type === 'focus_minutes') {
    return Math.floor(
      sumFocusSeconds(tasks, startDate, endDate, (task) =>
        matchesLogicBlock(task, block),
      ) / 60,
    );
  }

  if (block.action === 'add') {
    return countAddedTasks(tasks, timezone, startDate, endDate, (task) =>
      matchesLogicBlock(task, block),
    );
  }

  return countCompletedEvents(tasks, startDate, endDate, (task) =>
    matchesLogicBlock(task, block),
  );
}

function sanitizeReward(reward: QuestReward) {
  const next: QuestReward = {
    type: reward.type,
  };
  if (typeof reward.amount === 'number') next.amount = reward.amount;
  if (reward.amountMode) next.amountMode = reward.amountMode;
  if (typeof reward.minAmount === 'number') next.minAmount = reward.minAmount;
  if (typeof reward.maxAmount === 'number') next.maxAmount = reward.maxAmount;
  if (reward.itemId) next.itemId = reward.itemId;
  return next;
}

function isSupportedReward(reward: { type?: string }): reward is QuestReward {
  return (
    reward.type === 'FLIES' ||
    reward.type === 'ITEM' ||
    reward.type === 'BOX'
  );
}

function sanitizeRewardSet(rewards: unknown): QuestRewards {
  if (!Array.isArray(rewards)) return [];
  return rewards
    .filter((reward): reward is QuestReward => isSupportedReward(reward as { type?: string }))
    .map(sanitizeReward);
}

function resolveReward(reward: QuestReward, seed: string): QuestReward {
  if (reward.type === 'FLIES') {
    return {
      type: 'FLIES',
      amount: resolveRewardAmount(reward, seed),
    };
  }

  return sanitizeReward(reward);
}

function buildVisibilityMetrics(
  user: UserDoc,
  tasks: TaskDoc[],
  todayKey: string,
) {
  return {
    daily_tasks_count: tasks.filter(
      (task) => task.type !== 'habit' && task.date === todayKey,
    ).length,
    total_habits_count: tasks.filter((task) => task.type === 'habit').length,
    tags_count: user.tags?.length ?? 0,
  };
}

function matchesVisibilityConditions(
  conditions: QuestVisibilityCondition[] | undefined,
  metrics: ReturnType<typeof buildVisibilityMetrics>,
) {
  if (!conditions?.length) return true;

  return conditions.every((condition) => {
    const current = metrics[condition.metric];
    if (condition.operator === 'gt') return current > condition.value;
    return current < condition.value;
  });
}

function buildRewardCatalog(catalog: ItemDef[], rewardSets: QuestRewards[]) {
  const itemIds = new Set<string>();
  rewardSets.forEach((set) => {
    set.forEach((reward) => {
      if (reward.itemId) itemIds.add(reward.itemId);
    });
  });

  return Object.fromEntries(
    catalog
      .filter((item) => itemIds.has(item.id))
      .map((item) => [item.id, item]),
  );
}

function categoryDocToDefinition(doc: QuestCategoryDoc): MacroCategoryDefinition {
  return {
    id: doc.categoryId,
    name: doc.name,
    shortLabel: doc.shortLabel,
    description: doc.description,
    coverImageUrl: doc.coverImageUrl,
    accent: doc.accent,
    backgroundFrom: doc.backgroundFrom,
    backgroundTo: doc.backgroundTo,
    taskSuggestions: [],
    habitSuggestions: [],
    campaignHeadlines: [],
    durationDaysOptions: [],
    premiumAnimationId: '',
  };
}

function templateToView(doc: QuestTemplateDoc): QuestTemplateView {
  return {
    id: doc.templateId,
    name: doc.name,
    description: doc.description,
    coverImageUrl: doc.coverImageUrl,
    placement: doc.placement,
    categoryId: doc.categoryId,
    durationMinutes:
      doc.placement === 'category' && doc.durationMinutes && doc.durationMinutes > 0
        ? doc.durationMinutes
        : undefined,
    rewards: sanitizeRewardSet(doc.rewards),
    logic: doc.logic,
    visibilityConditions: doc.visibilityConditions ?? [],
    isActive: doc.isActive,
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

function questDocToView(doc: QuestDoc): QuestProgressView {
  const completed = doc.progress >= doc.target;
  const claimed = !!doc.claimedAt;
  return {
    id: doc.questId,
    templateId: doc.templateId,
    placement: doc.placement,
    categoryId: doc.categoryId,
    windowKey: doc.windowKey,
    title: doc.title,
    description: doc.description,
    coverImageUrl: doc.coverImageUrl,
    durationMinutes: doc.durationMinutes,
    startedAt: doc.startedAt?.toISOString(),
    expiresAt: doc.expiresAt?.toISOString(),
    target: doc.target,
    progress: doc.progress,
    completed,
    claimable: completed && !claimed,
    claimed,
    rewards: sanitizeRewardSet(doc.rewards),
    logic: doc.logic,
    claimedObjectiveIds: doc.claimedObjectiveIds ?? [],
  };
}

function placementWindowKey(
  placement: QuestPlacement,
  templateId: string,
  timezone: string,
) {
  if (placement === 'daily') return getZonedToday(timezone);
  return `category:${templateId}`;
}

async function syncQuestForTemplate(args: {
  template: QuestTemplateDoc;
  userId: string;
  user: UserDoc;
  tasks: TaskDoc[];
  timezone: string;
  existingDoc?: InstanceType<typeof QuestModel> | null;
}) {
  const { template, userId, user, tasks, timezone } = args;
  const windowKey = placementWindowKey(template.placement, template.templateId, timezone);
  const questId =
    template.placement === 'daily'
      ? `${template.templateId}:${windowKey}`
      : `${template.templateId}:category`;

  let doc =
    args.existingDoc ??
    new QuestModel({
      userId,
      questId,
      templateId: template.templateId,
      rollKey: crypto.randomUUID(),
      placement: template.placement,
      categoryId: template.categoryId,
      windowKey,
      title: template.name,
      description: template.description,
      coverImageUrl: template.coverImageUrl,
      target: 0,
      progress: 0,
      logic: [],
      rewards: template.rewards,
    });

  if (!doc.rollKey) {
    doc.rollKey = crypto.randomUUID();
  }

  const templateDurationMinutes =
    template.placement === 'category' &&
    typeof template.durationMinutes === 'number' &&
    Number.isFinite(template.durationMinutes) &&
    template.durationMinutes > 0
      ? Math.floor(template.durationMinutes)
      : undefined;

  if (templateDurationMinutes) {
    if (!doc.startedAt) {
      doc.startedAt = new Date();
    }
    if (!doc.durationMinutes || !doc.expiresAt) {
      doc.durationMinutes = templateDurationMinutes;
      doc.expiresAt = new Date(
        doc.startedAt.getTime() + templateDurationMinutes * 60_000,
      );
    }
  } else {
    doc.durationMinutes = undefined;
    doc.startedAt = null;
    doc.expiresAt = null;
  }

  const startDate =
    template.placement === 'daily'
      ? windowKey
      : getZonedYMD(doc.createdAt ?? new Date(), timezone);
  const endDate = getZonedToday(timezone);
  const userTags = (user.tags ?? []).filter(
    (tag) => !!getUserTagId(tag),
  );
  const profile = normalizeFocusProfile(user);
  const categoryTagIds =
    template.categoryId
      ? profile.categoryTagMap.find(
          (entry) => entry.categoryId === template.categoryId,
        )?.tagIds ?? []
      : [];
  const categoryTags = userTags.filter((tag) => {
    const tagId = getUserTagId(tag);
    return tagId ? categoryTagIds.includes(tagId) : false;
  });
  const templateLogic =
    template.placement === 'category'
      ? template.logic.map((block) => ({
          ...block,
          tagMode: 'focus_category_tags' as const,
        }))
      : template.logic;

  const resolvedLogic: ResolvedQuestLogicBlock[] = templateLogic.map((block) => {
      const resolvedTag =
        block.tagMode === 'random_user_tag' && userTags.length > 0
        ? userTags[
            Math.floor(
              createSeededRandom(
                `${userId}:${template.templateId}:${windowKey}:${block.id}:tag`,
              )() * userTags.length,
            )
          ]
        : null;
    const target = resolveLogicTarget(
      block,
      `${userId}:${template.templateId}:${windowKey}:${doc.rollKey}:${block.id}`,
    );
      const resolvedBlock: ResolvedQuestLogicBlock = {
        ...block,
        target,
        progress: 0,
        resolvedTagId: getUserTagId(resolvedTag) ?? undefined,
        resolvedTagIds:
          block.tagMode === 'focus_category_tags'
            ? categoryTags
                .map((tag) => getUserTagId(tag))
                .filter((tagId): tagId is string => !!tagId)
            : undefined,
        resolvedTagName: getUserTagName(resolvedTag) ?? undefined,
        resolvedTagNames:
          block.tagMode === 'focus_category_tags'
            ? categoryTags
                .map((tag) => getUserTagName(tag))
                .filter((tagName): tagName is string => !!tagName)
            : undefined,
      };
    const progress = progressForLogicBlock({
      block: resolvedBlock,
      tasks,
      timezone,
      startDate,
      endDate,
    });
    const resolvedRewards = (block.rewards ?? [])
      .filter((r): r is QuestReward => isSupportedReward(r as { type?: string }))
      .map((r, ri) =>
        resolveReward(
          r,
          `${userId}:${template.templateId}:${windowKey}:${doc.rollKey}:obj-reward:${block.id}:${ri}`,
        ),
      );
    return {
      ...resolvedBlock,
      progress,
      rewards: resolvedRewards.length > 0 ? resolvedRewards : undefined,
    };
  });

  const target = resolvedLogic.reduce((sum, block) => sum + block.target, 0);
  const progress = resolvedLogic.reduce(
    (sum, block) => sum + Math.min(block.progress, block.target),
    0,
  );
  const completed = progress >= target;

  doc.questId = questId;
  doc.placement = template.placement;
  doc.categoryId = template.categoryId;
  doc.title = template.name;
  doc.description = template.description;
  doc.coverImageUrl = template.coverImageUrl;
  doc.logic = resolvedLogic;
  doc.rewards = template.rewards
    .filter((reward): reward is QuestReward =>
      isSupportedReward(reward as { type?: string }),
    )
    .map((reward, index) =>
      resolveReward(
        reward,
        `${userId}:${template.templateId}:${windowKey}:${doc.rollKey}:reward:${index}`,
      ),
    );
  doc.target = target;
  doc.progress = progress;
  doc.completedAt = completed ? doc.completedAt ?? new Date() : null;

  if (doc.isModified()) {
    doc.markModified('logic');
    doc.markModified('rewards');
    await doc.save();
  }

  return doc;
}

export async function syncQuestState(args: {
  userId: string;
  timezone: string;
  catalog?: ItemDef[];
  refreshDaily?: boolean;
  dailySelectionSeed?: string;
}) {
  const { userId, timezone } = args;
  const [user, tasks, catalog, templates, categories, allExistingDocs] = await Promise.all([
    UserModel.findById(userId).lean<UserDoc | null>(),
    TaskModel.find({ userId, deletedAt: { $exists: false } }).lean<TaskDoc[]>(),
    args.catalog ? Promise.resolve(args.catalog) : getFullCatalog(),
    QuestTemplateModel.find({ isActive: true }).lean<QuestTemplateDoc[]>(),
    QuestCategoryModel.find({}).sort({ createdAt: 1 }).lean<QuestCategoryDoc[]>(),
    QuestModel.find({ userId }),
  ]);

  if (!user) throw new Error('User not found');

  const profile = normalizeFocusProfile(user);
  const todayKey = getZonedToday(timezone);
  const visibilityMetrics = buildVisibilityMetrics(user, tasks, todayKey);

  if (args.refreshDaily) {
    await QuestModel.deleteMany({
      userId,
      placement: 'daily',
      windowKey: todayKey,
    });
  }

  const filteredTemplates = [...templates]
    .sort(byTemplateOrder)
    .filter((template) =>
    matchesVisibilityConditions(
      template.visibilityConditions,
      visibilityMetrics,
    ),
  );

  const dailyTemplates = filteredTemplates.filter(
    (template) => template.placement === 'daily',
  );
  const categoryTemplates = filteredTemplates.filter((template) => {
    if (template.placement !== 'category' || !template.categoryId) return false;
    return profile.selectedCategoryIds.includes(template.categoryId);
  });

  const existingDailyDocs = allExistingDocs.filter(
    (doc) => doc.placement === 'daily' && doc.windowKey === todayKey,
  );

  let selectedDailyTemplates: QuestTemplateDoc[] = [];
  if (existingDailyDocs.length > 0) {
    const templateIds = new Set(existingDailyDocs.map((doc) => doc.templateId));
    const matchedTemplates = dailyTemplates.filter((template) =>
      templateIds.has(template.templateId),
    );
    if (matchedTemplates.length > 0) {
      selectedDailyTemplates = matchedTemplates;
    }
  }

  if (selectedDailyTemplates.length === 0) {
    const rng = createSeededRandom(
      `${userId}:${todayKey}:${args.dailySelectionSeed ?? 'default'}`,
    );
    selectedDailyTemplates = shuffle(dailyTemplates, rng).slice(0, 3);
  }

  const eligibleTemplates = [...selectedDailyTemplates, ...categoryTemplates];
  const eligibleDailyTemplateIds = new Set(
    selectedDailyTemplates.map((t) => t.templateId),
  );
  const eligibleCategoryTemplateIds = new Set(
    categoryTemplates.map((t) => t.templateId),
  );

  // Find docs to delete in-memory and batch delete by IDs
  const docsToDelete = allExistingDocs.filter((doc) => {
    if (doc.placement === 'daily' && doc.windowKey === todayKey) {
      return !eligibleDailyTemplateIds.has(doc.templateId);
    }
    if (doc.placement === 'category') {
      return !eligibleCategoryTemplateIds.has(doc.templateId);
    }
    // Delete stale daily docs from other days
    if (doc.placement === 'daily' && doc.windowKey !== todayKey) {
      return true;
    }
    return false;
  });

  const deleteIdSet = new Set(docsToDelete.map((doc) => doc._id.toString()));
  const deletePromise =
    deleteIdSet.size > 0
      ? QuestModel.deleteMany({ _id: { $in: docsToDelete.map((d) => d._id) } })
      : Promise.resolve();

  // Build lookup of existing docs by templateId+windowKey for syncQuestForTemplate
  const existingDocMap = new Map(
    allExistingDocs
      .filter((doc) => !deleteIdSet.has(doc._id.toString()))
      .map((doc) => [`${doc.templateId}:${doc.windowKey}`, doc]),
  );

  const [docs] = await Promise.all([
    Promise.all(
      eligibleTemplates.map((template) => {
        const windowKey = placementWindowKey(template.placement, template.templateId, timezone);
        const existingDoc = existingDocMap.get(`${template.templateId}:${windowKey}`) ?? null;
        return syncQuestForTemplate({ template, userId, user, tasks, timezone, existingDoc });
      }),
    ),
    deletePromise,
  ]);

  const questViews = docs.map(questDocToView);
  const dailyQuests = questViews
    .filter((quest): quest is DailyQuestProgressView => quest.placement === 'daily')
    .sort((a, b) => a.title.localeCompare(b.title));
  const categoryQuests = questViews
    .filter(
      (quest): quest is CategoryQuestProgressView => quest.placement === 'category',
    )
    .sort((a, b) => {
      if ((a.categoryId ?? '') !== (b.categoryId ?? '')) {
        return (a.categoryId ?? '').localeCompare(b.categoryId ?? '');
      }
      return a.title.localeCompare(b.title);
    });

  return {
    user,
    tasks,
    catalog,
    isPremium: isPremiumUser(user),
    focusProfile: profile,
    macroCategories: categories.map(categoryDocToDefinition),
    dailyQuests,
    categoryQuests,
    rewardCatalog: buildRewardCatalog(catalog, [
      ...dailyQuests.map((quest) => quest.rewards),
      ...categoryQuests.map((quest) => quest.rewards),
      ...dailyQuests.flatMap((quest) =>
        quest.logic.map((block) => block.rewards ?? []),
      ),
      ...categoryQuests.flatMap((quest) =>
        quest.logic.map((block) => block.rewards ?? []),
      ),
    ]),
  };
}

export { buildRewardCatalog, templateToView };

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
  claimType: 'daily' | 'category';
  targetId: string;
  timezone: string;
}) {
  const { userId, claimType, targetId } = args;
  await connectMongo();

  // Load user and quest in parallel
  const [user, quest] = await Promise.all([
    UserModel.findById(userId),
    QuestModel.findOne({ userId, questId: targetId }),
  ]);
  if (!user) throw new Error('User not found');
  if (!quest) throw new Error('Quest not found');
  if (quest.placement !== claimType) {
    throw new Error('Quest type mismatch');
  }
  if (quest.claimedAt || quest.progress < quest.target) {
    throw new Error('Quest is not claimable');
  }

  const isPremium = isPremiumUser(user.toObject());
  const summary = {
    fliesGranted: 0,
    grantedItemIds: [] as string[],
  };

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

  const multiplier = isPremium ? 2 : 1;
  for (const reward of quest.rewards) {
    if (reward.type === 'FLIES') {
      const amount = (reward.amount ?? 0) * multiplier;
      user.wardrobe.flies += amount;
      summary.fliesGranted += amount;
    } else if (reward.itemId) {
      for (let i = 0; i < multiplier; i += 1) {
        user.wardrobe.inventory[reward.itemId] =
          (user.wardrobe.inventory[reward.itemId] ?? 0) + 1;
        user.wardrobe.unseenItems!.push(reward.itemId);
        summary.grantedItemIds.push(reward.itemId);
      }
    }
  }

  quest.claimedAt = new Date();
  user.markModified('wardrobe');

  // Save quest and user in parallel
  await Promise.all([quest.save(), user.save()]);
  return summary;
}

export async function claimObjectiveReward(args: {
  userId: string;
  questId: string;
  objectiveId: string;
  timezone: string;
}) {
  const { userId, questId, objectiveId } = args;
  await connectMongo();

  // Load user and quest in parallel
  const [user, quest] = await Promise.all([
    UserModel.findById(userId),
    QuestModel.findOne({ userId, questId }),
  ]);
  if (!user) throw new Error('User not found');
  if (!quest) throw new Error('Quest not found');

  const alreadyClaimed = (quest.claimedObjectiveIds ?? []).includes(objectiveId);
  if (alreadyClaimed) throw new Error('Objective reward already claimed');

  const block = quest.logic.find((b) => b.id === objectiveId);
  if (!block) throw new Error('Objective not found');
  if (!block.rewards?.length) throw new Error('Objective has no rewards');
  if (block.progress < block.target) throw new Error('Objective not completed');

  const isPremium = isPremiumUser(user.toObject());
  const summary = { fliesGranted: 0, grantedItemIds: [] as string[] };

  if (!user.wardrobe) {
    user.wardrobe = { equipped: {}, inventory: {}, unseenItems: [], flies: 0 };
  }
  user.wardrobe.inventory = user.wardrobe.inventory ?? {};
  user.wardrobe.unseenItems = user.wardrobe.unseenItems ?? [];
  user.wardrobe.flies = user.wardrobe.flies ?? 0;

  const multiplier = isPremium ? 2 : 1;

  for (const reward of block.rewards) {
    if (reward.type === 'FLIES') {
      const amount = (reward.amount ?? 0) * multiplier;
      user.wardrobe.flies += amount;
      summary.fliesGranted += amount;
    } else if (reward.itemId) {
      for (let i = 0; i < multiplier; i += 1) {
        user.wardrobe.inventory[reward.itemId] =
          (user.wardrobe.inventory[reward.itemId] ?? 0) + 1;
        user.wardrobe.unseenItems!.push(reward.itemId);
        summary.grantedItemIds.push(reward.itemId);
      }
    }
  }

  quest.claimedObjectiveIds = [...(quest.claimedObjectiveIds ?? []), objectiveId];
  quest.markModified('claimedObjectiveIds');
  user.markModified('wardrobe');

  // Save quest and user in parallel
  await Promise.all([quest.save(), user.save()]);
  return summary;
}
