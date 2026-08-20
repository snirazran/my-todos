import QuestCategoryModel from '@/lib/models/QuestCategory';
import StarterPlanConfigModel, {
  STARTER_PLAN_CONFIG_ID,
} from '@/lib/models/StarterPlanConfig';
import {
  buildStarterPlan,
  normalizeStarterPlanConfig,
  normalizeStarterTasks,
  type StarterPlanConfig,
  type StarterPlanItem,
  type StarterTaskTemplate,
} from './starterPlan';
import { defaultStarterTasksFor } from './starterPlanDefaults';

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

export async function buildStarterPlanForAreas(args: {
  selectedCategoryIds: string[];
  config?: StarterPlanConfig;
}): Promise<{ config: StarterPlanConfig; items: StarterPlanItem[] }> {
  const config = args.config ?? (await loadStarterPlanConfig());
  const ids = Array.from(new Set(args.selectedCategoryIds)).slice(0, 20);
  if (ids.length === 0 || !config.isActive) return { config, items: [] };

  const docs = await QuestCategoryModel.find({ categoryId: { $in: ids } })
    .select('categoryId name shortLabel starterTasks')
    .lean<
      Array<{
        categoryId: string;
        name: string;
        shortLabel?: string;
        starterTasks?: StarterTaskTemplate[];
      }>
    >();

  const categories = docs.map((doc) => ({
    id: doc.categoryId,
    name: doc.name,
    starterTasks: starterTasksForCategory(doc),
  }));

  return {
    config,
    items: buildStarterPlan({
      selectedCategoryIds: ids,
      categories,
      config,
    }),
  };
}
