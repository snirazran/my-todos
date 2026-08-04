import { checklistBonus } from './checklist';
import { streakFlyBonus } from './flyValue';

export type QuickViewId =
  | 'untagged'
  | 'repeating'
  | 'timed'
  | 'checklist'
  | 'rich';

export type TaskSort = 'manual' | 'time' | 'flies' | 'alpha' | 'tag';

export type TaskFilters = {
  search: string;
  tags: string[];
  views: QuickViewId[];
  showCompleted: boolean;
  sort: TaskSort;
};

/** The minimum shape a task needs to be filtered — both client Task types fit. */
export type FilterableTask = {
  id?: string;
  text?: string;
  notes?: string;
  completed?: boolean;
  tags?: string[];
  checklist?: { text?: string; done?: boolean }[] | null;
  type?: string;
  repeatMode?: string;
  startTime?: string;
  streak?: number;
  order?: number;
};

export function createTaskFilters(
  overrides: Partial<TaskFilters> = {},
): TaskFilters {
  return {
    search: '',
    tags: [],
    views: [],
    showCompleted: true,
    sort: 'manual',
    ...overrides,
  };
}

/** Flies the task would pay at best — its own, the streak tier and a full checklist. */
export function taskPotentialFlies(task: FilterableTask): number {
  return (
    1 +
    checklistBonus(task.checklist?.length ?? 0) +
    streakFlyBonus(task.streak ?? 0)
  );
}

export const QUICK_VIEWS: ReadonlyArray<{
  id: QuickViewId;
  label: string;
  match: (task: FilterableTask) => boolean;
}> = [
  { id: 'untagged', label: 'Untagged', match: (t) => !t.tags?.length },
  {
    id: 'repeating',
    label: 'Repeating',
    match: (t) =>
      t.type === 'weekly' || (!!t.repeatMode && t.repeatMode !== 'none'),
  },
  { id: 'timed', label: 'Timed', match: (t) => !!t.startTime },
  { id: 'checklist', label: 'Checklist', match: (t) => !!t.checklist?.length },
  { id: 'rich', label: 'Worth 2+', match: (t) => taskPotentialFlies(t) >= 2 },
];

const VIEW_BY_ID = new Map(QUICK_VIEWS.map((v) => [v.id, v]));

export function quickViewLabel(id: QuickViewId): string {
  return VIEW_BY_ID.get(id)?.label ?? id;
}

function matchesSearch(task: FilterableTask, needle: string): boolean {
  if (task.text?.toLowerCase().includes(needle)) return true;
  if (task.notes?.toLowerCase().includes(needle)) return true;
  return !!task.checklist?.some((it) =>
    it.text?.toLowerCase().includes(needle),
  );
}

/**
 * Whether a task survives the filters. Tags match ANY of the picked ones, while
 * each quick view narrows further — so chips read left to right as "and also".
 * `completed` overrides the task's own flag for surfaces that resolve
 * completion per date (repeating occurrences, grace periods).
 */
export function matchesTaskFilters(
  task: FilterableTask,
  filters: TaskFilters,
  completed?: boolean,
): boolean {
  const isDone = completed ?? !!task.completed;
  if (isDone && !filters.showCompleted) return false;
  if (
    filters.tags.length > 0 &&
    !(task.tags ?? []).some((id) => filters.tags.includes(id))
  )
    return false;
  for (const id of filters.views) {
    if (!VIEW_BY_ID.get(id)?.match(task)) return false;
  }
  const needle = filters.search.trim().toLowerCase();
  if (needle && !matchesSearch(task, needle)) return false;
  return true;
}

const startMinutes = (task: FilterableTask): number => {
  const [h, m] = (task.startTime ?? '').split(':');
  const mins = Number(h) * 60 + Number(m);
  return Number.isFinite(mins) ? mins : Number.MAX_SAFE_INTEGER;
};

/**
 * Rank of the task's own first tag within `tagOrder` — a multi-tag task lands in
 * its earliest tag's group, untagged tasks sink to the bottom. Without an order
 * to go by, tags still group together, just in id order.
 */
const tagRank = (task: FilterableTask, tagOrder?: string[]): number => {
  const ids = task.tags ?? [];
  if (ids.length === 0) return Number.MAX_SAFE_INTEGER;
  if (!tagOrder) return Number.MAX_SAFE_INTEGER - 1;
  let best = Number.MAX_SAFE_INTEGER;
  for (const id of ids) {
    const rank = tagOrder.indexOf(id);
    if (rank >= 0 && rank < best) best = rank;
  }
  return best;
};

const firstTagId = (task: FilterableTask): string =>
  (task.tags ?? [])[0] ?? '￿';

/**
 * Reordered copy for display. `manual` keeps whatever order it was handed.
 * `tagOrder` (tag ids as the user sees them) drives the `tag` sort's grouping.
 */
export function sortTasks<T extends FilterableTask>(
  tasks: T[],
  sort: TaskSort,
  tagOrder?: string[],
): T[] {
  if (sort === 'manual') return tasks;
  const keyed = tasks.map((task, index) => ({ task, index }));
  const compare: Record<
    Exclude<TaskSort, 'manual'>,
    (a: FilterableTask, b: FilterableTask) => number
  > = {
    time: (a, b) => startMinutes(a) - startMinutes(b),
    flies: (a, b) => taskPotentialFlies(b) - taskPotentialFlies(a),
    alpha: (a, b) => (a.text ?? '').localeCompare(b.text ?? ''),
    tag: (a, b) =>
      tagRank(a, tagOrder) - tagRank(b, tagOrder) ||
      firstTagId(a).localeCompare(firstTagId(b)),
  };
  const cmp = compare[sort];
  keyed.sort((a, b) => cmp(a.task, b.task) || a.index - b.index);
  return keyed.map((k) => k.task);
}

export function isTaskFilterActive(
  filters: TaskFilters,
  base: TaskFilters,
): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.tags.length > 0 ||
    filters.views.length > 0 ||
    filters.showCompleted !== base.showCompleted ||
    filters.sort !== base.sort
  );
}

export function taskFilterCount(
  filters: TaskFilters,
  base: TaskFilters,
): number {
  return (
    (filters.search.trim() ? 1 : 0) +
    filters.tags.length +
    filters.views.length +
    (filters.showCompleted !== base.showCompleted ? 1 : 0) +
    (filters.sort !== base.sort ? 1 : 0)
  );
}

export const SORT_LABELS: Record<TaskSort, string> = {
  manual: 'Manual',
  time: 'Time',
  flies: 'Flies',
  alpha: 'A–Z',
  tag: 'Tag',
};

export type FilterChip = {
  key: string;
  label: string;
  color?: string;
  /** The filters this chip's × leaves behind. */
  next: TaskFilters;
};

/** One removable chip per applied filter, in the order they read best. */
export function taskFilterChips(
  filters: TaskFilters,
  base: TaskFilters,
  tags: { id: string; name: string; color?: string }[] = [],
): FilterChip[] {
  const chips: FilterChip[] = [];
  const search = filters.search.trim();
  if (search)
    chips.push({
      key: 'search',
      label: `“${search}”`,
      next: { ...filters, search: '' },
    });
  for (const id of filters.views)
    chips.push({
      key: `view:${id}`,
      label: quickViewLabel(id),
      next: { ...filters, views: filters.views.filter((v) => v !== id) },
    });
  for (const id of filters.tags) {
    const tag = tags.find((t) => t.id === id);
    chips.push({
      key: `tag:${id}`,
      label: tag?.name ?? 'Tag',
      color: tag?.color,
      next: { ...filters, tags: filters.tags.filter((t) => t !== id) },
    });
  }
  if (filters.showCompleted !== base.showCompleted)
    chips.push({
      key: 'completed',
      label: filters.showCompleted ? 'With done' : 'Hiding done',
      next: { ...filters, showCompleted: base.showCompleted },
    });
  if (filters.sort !== base.sort)
    chips.push({
      key: 'sort',
      label: `By ${SORT_LABELS[filters.sort].toLowerCase()}`,
      next: { ...filters, sort: base.sort },
    });
  return chips;
}

/** How many tasks would survive if `patch` were applied on top of `filters`. */
export function previewMatchCount(
  tasks: FilterableTask[],
  filters: TaskFilters,
  patch: Partial<TaskFilters>,
): number {
  const next = { ...filters, ...patch };
  let n = 0;
  for (const task of tasks) if (matchesTaskFilters(task, next)) n++;
  return n;
}
