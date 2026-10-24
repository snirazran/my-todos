import type { MacroCategoryId } from './types';

export type StarterCadence = 'daily' | 'weekdays' | 'weekend' | 'custom';

export type StarterMoment = 'wake' | 'morning' | 'day' | 'evening' | 'night';

export const STARTER_MOMENTS: StarterMoment[] = ['wake', 'morning', 'day', 'evening', 'night'];

export type StarterTaskTemplate = {
  id: string;
  text: string;
  cadence: StarterCadence;
  days?: number[];
  emoji?: string;
  moment?: StarterMoment;
  enabled?: boolean;
};

export type StarterPlanItem = {
  id: string;
  categoryId: MacroCategoryId;
  categoryName: string;
  categoryShortLabel?: string;
  categoryAccent?: string;
  text: string;
  cadence: StarterCadence;
  days: number[];
  cadenceLabel: string;
  emoji?: string;
  moment: StarterMoment;
};

export const STARTER_BASICS_CATEGORY_ID = 'basics';

export type StarterPlanConfig = {
  isActive: boolean;
  maxTasks: number;
  maxPerArea: number;
  linkTags: boolean;
  headline: string;
  subheadline: string;
  acceptLabel: string;
  declineLabel: string;
  footnote: string;
};

export const STARTER_PLAN_DEFAULT_CONFIG: StarterPlanConfig = {
  isActive: true,
  maxTasks: 5,
  maxPerArea: 3,
  linkTags: true,
  headline: 'Start small',
  subheadline: "Tiny daily habits you'll actually keep.",
  acceptLabel: 'Add {habits}',
  declineLabel: 'Skip for now',
  footnote: 'Change or remove any of them later.',
};

export const STARTER_PLAN_MAX_TASKS_LIMIT = 8;
export const STARTER_PLAN_MAX_PER_AREA_LIMIT = 5;
export const MAX_STARTER_TASKS_PER_CATEGORY = 12;

export const STARTER_TAG_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
];

const CATEGORY_ACCENT_FALLBACK = '#6366f1';

export function pickStarterTagColor(
  seed: string,
  taken: Set<string>,
  accent?: string,
): string {
  const custom = accent?.trim().toLowerCase();
  if (custom && custom !== CATEGORY_ACCENT_FALLBACK && !taken.has(custom)) {
    return custom;
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  for (let i = 0; i < STARTER_TAG_COLORS.length; i++) {
    const color = STARTER_TAG_COLORS[(hash + i) % STARTER_TAG_COLORS.length];
    if (!taken.has(color)) return color;
  }
  return STARTER_TAG_COLORS[hash % STARTER_TAG_COLORS.length];
}


const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function starterCadenceDays(
  cadence: StarterCadence,
  days?: number[],
): number[] {
  if (cadence === 'daily') return [0, 1, 2, 3, 4, 5, 6];
  if (cadence === 'weekdays') return [1, 2, 3, 4, 5];
  if (cadence === 'weekend') return [0, 6];
  const custom = (days ?? [])
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return Array.from(new Set(custom)).sort((a, b) => a - b);
}

export function starterCadenceLabel(
  cadence: StarterCadence,
  days?: number[],
): string {
  if (cadence === 'daily') return 'Every day';
  if (cadence === 'weekdays') return 'Weekdays';
  if (cadence === 'weekend') return 'Weekends';
  const resolved = starterCadenceDays('custom', days);
  if (resolved.length === 0) return 'Every day';
  if (resolved.length === 7) return 'Every day';
  if (resolved.length === 1) return `Every ${WEEKDAY_LONG[resolved[0]]}`;
  return resolved.map((d) => WEEKDAY_SHORT[d]).join(' · ');
}

export function normalizeStarterTasks(value: unknown): StarterTaskTemplate[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: StarterTaskTemplate[] = [];
  for (const raw of value.slice(0, MAX_STARTER_TASKS_PER_CATEGORY)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const text = typeof entry.text === 'string' ? entry.text.trim().slice(0, 120) : '';
    if (!text) continue;
    const id =
      typeof entry.id === 'string' && entry.id.trim()
        ? entry.id.trim().slice(0, 64)
        : `starter-${out.length}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const cadence: StarterCadence =
      entry.cadence === 'weekdays' ||
      entry.cadence === 'weekend' ||
      entry.cadence === 'custom'
        ? entry.cadence
        : 'daily';
    const days = starterCadenceDays('custom', entry.days as number[] | undefined);
    const emoji = typeof entry.emoji === 'string' ? entry.emoji.trim().slice(0, 8) : '';
    const moment = STARTER_MOMENTS.find((m) => m === entry.moment);
    out.push({
      id,
      text,
      cadence,
      ...(cadence === 'custom' ? { days: days.length > 0 ? days : [1, 3, 5] } : {}),
      ...(emoji ? { emoji } : {}),
      ...(moment ? { moment } : {}),
      enabled: entry.enabled !== false,
    });
  }
  return out;
}

export function normalizeStarterPlanConfig(
  value: Partial<StarterPlanConfig> | null | undefined,
): StarterPlanConfig {
  const base = STARTER_PLAN_DEFAULT_CONFIG;
  if (!value) return { ...base };
  const clampInt = (input: unknown, fallback: number, min: number, max: number) => {
    const n = Math.round(Number(input));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  const text = (input: unknown, fallback: string, max = 160) =>
    typeof input === 'string' && input.trim() ? input.trim().slice(0, max) : fallback;
  return {
    isActive: value.isActive !== false,
    maxTasks: clampInt(value.maxTasks, base.maxTasks, 1, STARTER_PLAN_MAX_TASKS_LIMIT),
    maxPerArea: clampInt(
      value.maxPerArea,
      base.maxPerArea,
      1,
      STARTER_PLAN_MAX_PER_AREA_LIMIT,
    ),
    linkTags: value.linkTags !== false,
    headline: text(value.headline, base.headline, 60),
    subheadline: text(value.subheadline, base.subheadline, 120),
    acceptLabel: text(value.acceptLabel, base.acceptLabel, 40),
    declineLabel: text(value.declineLabel, base.declineLabel, 40),
    footnote: text(value.footnote, base.footnote, 160),
  };
}

const MOMENT_ORDER: Record<StarterMoment, number> = {
  wake: 0,
  morning: 1,
  day: 2,
  evening: 3,
  night: 4,
};

const textKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function buildStarterPlan(args: {
  selectedCategoryIds: MacroCategoryId[];
  categories: Array<{
    id: MacroCategoryId;
    name: string;
    shortLabel?: string;
    accent?: string;
    starterTasks?: StarterTaskTemplate[];
  }>;
  basics?: StarterTaskTemplate[];
  config: StarterPlanConfig;
}): StarterPlanItem[] {
  const { selectedCategoryIds, categories, config } = args;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const picked: StarterPlanItem[] = [];
  const seen = new Set<string>();

  const add = (
    category: { id: string; name: string; shortLabel?: string; accent?: string },
    template: StarterTaskTemplate,
  ) => {
    if (picked.length >= config.maxTasks) return false;
    const key = textKey(template.text);
    if (seen.has(template.id) || seen.has(key)) return false;
    const days = starterCadenceDays(template.cadence, template.days);
    if (days.length === 0) return false;
    seen.add(template.id);
    seen.add(key);
    picked.push({
      id: `${category.id}:${template.id}`,
      categoryId: category.id,
      categoryName: category.name,
      categoryShortLabel: category.shortLabel,
      categoryAccent: category.accent,
      text: template.text,
      cadence: template.cadence,
      days,
      cadenceLabel: starterCadenceLabel(template.cadence, template.days),
      emoji: template.emoji,
      moment: template.moment ?? 'day',
    });
    return true;
  };

  const basicsCategory = { id: STARTER_BASICS_CATEGORY_ID, name: 'Easy wins' };
  for (const template of args.basics ?? []) {
    if (template.enabled !== false) add(basicsCategory, template);
  }

  const pools = selectedCategoryIds
    .map((id) => {
      const category = byId.get(id);
      if (!category) return null;
      const tasks = (category.starterTasks ?? []).filter(
        (task) => task.enabled !== false,
      );
      if (tasks.length === 0) return null;
      return { category, tasks, cursor: 0, taken: 0 };
    })
    .filter(Boolean) as Array<{
    category: { id: string; name: string; shortLabel?: string; accent?: string };
    tasks: StarterTaskTemplate[];
    cursor: number;
    taken: number;
  }>;

  let progressed = true;
  while (progressed && picked.length < config.maxTasks) {
    progressed = false;
    for (const pool of pools) {
      if (pool.taken >= config.maxPerArea) continue;
      while (pool.cursor < pool.tasks.length) {
        const template = pool.tasks[pool.cursor++];
        if (add(pool.category, template)) {
          pool.taken += 1;
          progressed = true;
          break;
        }
      }
    }
  }

  return picked
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        MOMENT_ORDER[a.item.moment] - MOMENT_ORDER[b.item.moment] || a.index - b.index,
    )
    .map(({ item }) => item);
}
