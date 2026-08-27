import type { MacroCategoryId } from './types';

export type StarterCadence = 'daily' | 'weekdays' | 'weekend' | 'custom';

export type StarterTaskTemplate = {
  id: string;
  text: string;
  cadence: StarterCadence;
  days?: number[];
  startTime?: string;
  reminder?: string;
  anchor?: string;
  enabled?: boolean;
};

export type StarterPlanItem = {
  id: string;
  categoryId: MacroCategoryId;
  categoryName: string;
  text: string;
  cadence: StarterCadence;
  days: number[];
  cadenceLabel: string;
  timeLabel?: string;
  startTime?: string;
  reminder?: string;
  anchor?: string;
};

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
  headline: 'Your starting plan',
  subheadline: 'Small on purpose. Change anything later.',
  acceptLabel: 'Start with this plan',
  declineLabel: "I'll add my own",
  footnote: 'You can edit, reschedule or delete any of these anytime.',
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

export type StarterDayStart = 'early' | 'usual' | 'late';

export const STARTER_DAY_START_DEFAULT: StarterDayStart = 'usual';

export const STARTER_DAY_START_OPTIONS: Array<{
  id: StarterDayStart;
  label: string;
  shiftMinutes: number;
}> = [
  { id: 'early', label: 'Early', shiftMinutes: -120 },
  { id: 'usual', label: 'Usual', shiftMinutes: 0 },
  { id: 'late', label: 'Late', shiftMinutes: 120 },
];

const DAY_START_EARLIEST_MINUTES = 4 * 60;
const DAY_START_LATEST_MINUTES = 23 * 60 + 30;

export function normalizeStarterDayStart(value: unknown): StarterDayStart {
  return value === 'early' || value === 'late'
    ? value
    : STARTER_DAY_START_DEFAULT;
}

export function shiftStarterTime(
  startTime: string | undefined,
  dayStart: StarterDayStart,
): string | undefined {
  if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) return startTime;
  const shift =
    STARTER_DAY_START_OPTIONS.find((option) => option.id === dayStart)
      ?.shiftMinutes ?? 0;
  if (shift === 0) return startTime;
  const [hour, minute] = startTime.split(':').map(Number);
  const total = Math.min(
    DAY_START_LATEST_MINUTES,
    Math.max(DAY_START_EARLIEST_MINUTES, hour * 60 + minute + shift),
  );
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function applyStarterDayStart(
  items: StarterPlanItem[],
  dayStart: StarterDayStart,
): StarterPlanItem[] {
  if (dayStart === STARTER_DAY_START_DEFAULT) return items;
  return items.map((item) => {
    const startTime = shiftStarterTime(item.startTime, dayStart);
    return { ...item, startTime, timeLabel: starterTimeLabel(startTime) };
  });
}

export function earliestStarterTime(items: StarterPlanItem[]): string | undefined {
  let earliest: string | undefined;
  for (const item of items) {
    if (!item.startTime) continue;
    if (!earliest || item.startTime < earliest) earliest = item.startTime;
  }
  return earliest;
}

export function starterTimeLabel(startTime?: string): string | undefined {
  if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) return undefined;
  const [hourRaw, minute] = startTime.split(':');
  const hour = Number(hourRaw);
  if (!Number.isInteger(hour)) return undefined;
  const suffix = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return minute === '00'
    ? `${displayHour} ${suffix}`
    : `${displayHour}:${minute} ${suffix}`;
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
    const startTime =
      typeof entry.startTime === 'string' && /^\d{2}:\d{2}$/.test(entry.startTime)
        ? entry.startTime
        : undefined;
    out.push({
      id,
      text,
      cadence,
      ...(cadence === 'custom' ? { days: days.length > 0 ? days : [1, 3, 5] } : {}),
      ...(startTime ? { startTime } : {}),
      ...(typeof entry.reminder === 'string' && entry.reminder
        ? { reminder: entry.reminder.slice(0, 16) }
        : {}),
      ...(typeof entry.anchor === 'string' && entry.anchor.trim()
        ? { anchor: entry.anchor.trim().slice(0, 160) }
        : {}),
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

export function buildStarterPlan(args: {
  selectedCategoryIds: MacroCategoryId[];
  categories: Array<{
    id: MacroCategoryId;
    name: string;
    starterTasks?: StarterTaskTemplate[];
  }>;
  config: StarterPlanConfig;
}): StarterPlanItem[] {
  const { selectedCategoryIds, categories, config } = args;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const pools = selectedCategoryIds
    .map((id) => {
      const category = byId.get(id);
      if (!category) return null;
      const tasks = (category.starterTasks ?? []).filter(
        (task) => task.enabled !== false,
      );
      if (tasks.length === 0) return null;
      return { category, tasks };
    })
    .filter(Boolean) as Array<{
    category: { id: string; name: string };
    tasks: StarterTaskTemplate[];
  }>;

  if (pools.length === 0) return [];

  const picked: StarterPlanItem[] = [];
  const deepest = Math.max(...pools.map((pool) => pool.tasks.length));
  for (let round = 0; round < Math.min(deepest, config.maxPerArea); round++) {
    for (const pool of pools) {
      if (picked.length >= config.maxTasks) return picked;
      const template = pool.tasks[round];
      if (!template) continue;
      const days = starterCadenceDays(template.cadence, template.days);
      if (days.length === 0) continue;
      picked.push({
        id: `${pool.category.id}:${template.id}`,
        categoryId: pool.category.id,
        categoryName: pool.category.name,
        text: template.text,
        cadence: template.cadence,
        days,
        cadenceLabel: starterCadenceLabel(template.cadence, template.days),
        timeLabel: starterTimeLabel(template.startTime),
        startTime: template.startTime,
        reminder: template.reminder,
        anchor: template.anchor,
      });
    }
  }
  return picked;
}
