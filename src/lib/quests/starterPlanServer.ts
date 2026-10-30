import QuestCategoryModel from '@/lib/models/QuestCategory';
import StarterPlanConfigModel, {
  STARTER_PLAN_CONFIG_ID,
} from '@/lib/models/StarterPlanConfig';
import {
  buildStarterPlan,
  normalizeStarterPlanConfig,
  normalizeStarterTasks,
  STARTER_BARRIER_FOLLOW_UPS,
  STARTER_EASY_WIN_COUNT,
  starterCapacityCap,
  type StarterBarrierPrompt,
  type StarterBarrierSet,
  type StarterPlanConfig,
  type StarterPlanItem,
  type StarterProfile,
  type StarterTaskTemplate,
} from './starterPlan';
import {
  defaultAreaPresentationFor,
  defaultBarriersFor,
  defaultStarterTasksFor,
  GENTLE_MOVE_TASK,
  starterEasyWinsFor,
} from './starterPlanDefaults';

export async function loadStarterPlanConfig(): Promise<StarterPlanConfig> {
  const doc = await StarterPlanConfigModel.findOne({
    configId: STARTER_PLAN_CONFIG_ID,
  }).lean();
  return normalizeStarterPlanConfig(doc as Partial<StarterPlanConfig> | null);
}

export function starterTasksForCategory(category: {
  name: string;
  shortLabel?: string;
  starterTasks?: StarterTaskTemplate[];
}): StarterTaskTemplate[] {
  const authored = normalizeStarterTasks(category.starterTasks);
  if (authored.length > 0) return authored;
  return defaultStarterTasksFor(category.name, category.shortLabel);
}

export function starterBarriersForCategory(category: {
  name: string;
  shortLabel?: string;
}): StarterBarrierSet | null {
  return defaultBarriersFor(category.name, category.shortLabel);
}

export function starterBarrierPrompt(category: {
  name: string;
  shortLabel?: string;
}): StarterBarrierPrompt | null {
  const set = starterBarriersForCategory(category);
  if (!set) return null;
  return {
    title: set.title,
    options: set.options.map(({ id, label, emoji }) => ({ id, label, emoji })),
  };
}

export function starterAreaPresentation(category: {
  name: string;
  shortLabel?: string;
  onboardingSentence?: string;
}): { emoji: string; label: string } {
  const preset = defaultAreaPresentationFor(category.name, category.shortLabel);
  const sentence = (category.onboardingSentence ?? '').trim().replace(/[.!]+$/, '');
  return {
    emoji: preset?.emoji ?? '✨',
    label: sentence || preset?.label || category.name,
  };
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function parseStarterBarriers(value: unknown): Record<string, string[]> {
  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const out: Record<string, string[]> = {};
  for (const entry of entries.slice(0, 20)) {
    if (typeof entry !== 'string') continue;
    const [categoryId, barrierId] = entry.split(':').map((part) => part.trim());
    if (!SAFE_ID.test(categoryId ?? '') || !SAFE_ID.test(barrierId ?? '')) continue;
    const picked = Object.prototype.hasOwnProperty.call(out, categoryId)
      ? out[categoryId]
      : (out[categoryId] = []);
    if (!picked.includes(barrierId)) picked.push(barrierId);
  }
  return out;
}

export async function buildStarterPlanForAreas(args: {
  selectedCategoryIds: string[];
  barriers?: Record<string, string[]>;
  profile?: StarterProfile;
  config?: StarterPlanConfig;
}): Promise<{ config: StarterPlanConfig; items: StarterPlanItem[] }> {
  const config = args.config ?? (await loadStarterPlanConfig());
  const ids = Array.from(new Set(args.selectedCategoryIds)).slice(0, 20);
  if (!config.isActive) return { config, items: [] };
  const profile = args.profile ?? {};

  const adapt = (task: StarterTaskTemplate): StarterTaskTemplate | null => {
    if (task.company && profile.support === 'just-me') return null;
    if (task.movement && profile.activity === 'limited') {
      return { ...GENTLE_MOVE_TASK, ...(task.reason ? { reason: task.reason } : {}) };
    }
    return task;
  };
  const adaptAll = (tasks: StarterTaskTemplate[]) =>
    tasks.map(adapt).filter((task): task is StarterTaskTemplate => !!task);

  const docs =
    ids.length === 0
      ? []
      : await QuestCategoryModel.find({ categoryId: { $in: ids } })
          .select('categoryId name shortLabel accent starterTasks')
          .lean<
            Array<{
              categoryId: string;
              name: string;
              shortLabel?: string;
              accent?: string;
              starterTasks?: StarterTaskTemplate[];
            }>
          >();

  let leadAreas = 0;
  const leadsFor = (doc: { categoryId: string; name: string; shortLabel?: string }) => {
    const picked = args.barriers?.[doc.categoryId] ?? [];
    if (picked.length === 0 || leadAreas >= STARTER_BARRIER_FOLLOW_UPS) return undefined;
    const options = starterBarriersForCategory(doc)?.options ?? [];
    const leads = adaptAll(
      picked
        .map((id) => options.find((option) => option.id === id))
        .filter((option): option is NonNullable<typeof option> => !!option)
        .map((option) => ({ ...option.task, reason: option.reason })),
    );
    if (leads.length === 0) return undefined;
    leadAreas += 1;
    return leads;
  };

  const docsById = new Map(docs.map((doc) => [doc.categoryId, doc]));
  const categories = ids
    .map((id) => docsById.get(id))
    .filter((doc): doc is (typeof docs)[number] => !!doc)
    .map((doc) => ({
      id: doc.categoryId,
      name: doc.name,
      shortLabel: doc.shortLabel,
      accent: doc.accent,
      starterTasks: adaptAll(starterTasksForCategory(doc)),
      leadTasks: leadsFor(doc),
    }));

  const cap = starterCapacityCap(profile);
  let basicsCount = STARTER_EASY_WIN_COUNT;
  let maxTasks = config.maxTasks;
  if (cap !== undefined) {
    const capped = Math.min(config.maxTasks, cap);
    basicsCount = Math.max(1, Math.min(STARTER_EASY_WIN_COUNT, capped - leadAreas));
    maxTasks = Math.min(config.maxTasks, Math.max(capped, basicsCount + leadAreas));
  }

  return {
    config,
    items: buildStarterPlan({
      selectedCategoryIds: ids,
      categories,
      basics: adaptAll(starterEasyWinsFor(profile)),
      basicsCount,
      config: maxTasks === config.maxTasks ? config : { ...config, maxTasks },
    }),
  };
}
