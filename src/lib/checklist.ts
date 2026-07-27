export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
  /** A fly is earned once this step's position in the list is reached. */
  reward?: boolean;
};

type ChecklistCarrier = {
  type?: string;
  checklist?: ChecklistItem[];
  checklistDoneByDate?: Record<string, string[]>;
};

export const CHECKLIST_MAX_ITEMS = 20;

/**
 * The fly budget a checklist task is worth. Deliberately sub-linear: a
 * checklist is always worth less per box than the same number of separate
 * tasks, so nesting deeper never pays better.
 */
export function checklistBudget(steps: number): number {
  if (steps <= 0) return 0;
  if (steps <= 2) return 1;
  if (steps <= 6) return 2;
  return 3;
}

/** Evenly spread `count` marker slots over `steps`, never on the last step. */
function defaultMarkerIndexes(count: number, steps: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= count; i++) {
    let idx = Math.max(
      0,
      Math.min(steps - 2, Math.round((i * steps) / (count + 1)) - 1),
    );
    while (out.includes(idx) && idx < steps - 2) idx++;
    while (out.includes(idx) && idx > 0) idx--;
    if (!out.includes(idx)) out.push(idx);
  }
  return out.sort((a, b) => a - b);
}

/**
 * The same items with their reward markers set. Positions are derived purely
 * from the step count — evenly spread, with the last always on the final step
 * so the budget can never be stacked onto one early checkbox. Because nothing
 * is remembered per item, reordering steps leaves the flies where they are.
 */
export function normalizeChecklistRewards(
  items: ChecklistItem[],
  budget: number = checklistBudget(items.length),
): ChecklistItem[] {
  const steps = items.length;
  if (steps === 0) return items;
  const free = Math.max(0, Math.min(budget - 1, steps - 1));
  const marked = new Set([...defaultMarkerIndexes(free, steps), steps - 1]);
  return items.map((it, i) =>
    !!it.reward === marked.has(i) ? it : { ...it, reward: marked.has(i) },
  );
}

export type ChecklistPayout = {
  /** Items with normalized reward markers. */
  items: ChecklistItem[];
  /** Flies this checklist can pay in total, after any locked-in cap. */
  budget: number;
  /** Flies earned so far. */
  earned: number;
  doneCount: number;
};

/**
 * What a checklist has paid out. A marker pays the moment that many steps are
 * checked and is never clawed back, so an abandoned checklist keeps its
 * partial credit. Completing the task does NOT release the unticked markers —
 * steps are the only way a checklist earns, so its progress is honest.
 * `budgetLock` is the budget snapshotted the first time this occurrence paid,
 * so padding a finished checklist with extra steps can't mint another fly.
 */
export function checklistPayout(
  items: ChecklistItem[],
  opts: { budgetLock?: number | null } = {},
): ChecklistPayout {
  const { budgetLock } = opts;
  const steps = items.length;
  const full = checklistBudget(steps);
  const normalized = normalizeChecklistRewards(items, full);
  const budget =
    typeof budgetLock === 'number' && budgetLock >= 0
      ? Math.min(full, budgetLock)
      : full;
  const doneCount = normalized.filter((it) => it.done).length;
  const passed = normalized.filter(
    (it, i) => it.reward && doneCount > 0 && i + 1 <= doneCount,
  ).length;
  return {
    items: normalized,
    budget,
    earned: Math.min(passed, budget),
    doneCount,
  };
}

/** Strip per-instance done flags: the stored series checklist is content only. */
export function checklistContent(
  items?: ChecklistItem[] | null,
): ChecklistItem[] | undefined {
  if (!items) return undefined;
  return items.map((it) => ({
    id: it.id,
    text: it.text,
    done: false,
    ...(it.reward ? { reward: true } : {}),
  }));
}

/**
 * The checklist as it should appear on `date`. Repeating (weekly-type) tasks
 * share the item list across the whole series and keep the checked state
 * per-date in `checklistDoneByDate`; one-off tasks keep flags on the items.
 */
export function checklistForDate(
  task: ChecklistCarrier,
  date: string,
): ChecklistItem[] {
  const items = task.checklist ?? [];
  if (task.type !== 'weekly') return items;
  const done = new Set(task.checklistDoneByDate?.[date] ?? []);
  return items.map((it) => ({
    id: it.id,
    text: it.text,
    done: done.has(it.id),
    ...(it.reward ? { reward: true } : {}),
  }));
}

export function checklistDoneIdsForDate(
  task: ChecklistCarrier,
  date: string,
): string[] {
  return checklistForDate(task, date)
    .filter((it) => it.done)
    .map((it) => it.id);
}

/** What a task's checklist has paid out on `date` (repeat-aware). */
export function checklistPayoutForDate(
  task: ChecklistCarrier & { checklistBudgetByDate?: Record<string, number> },
  date: string,
): ChecklistPayout {
  return checklistPayout(checklistForDate(task, date), {
    budgetLock: task.checklistBudgetByDate?.[date],
  });
}

const DONE_MAP_KEEP_DAYS = 90;

/** New done-state map with `date` set to `doneIds`, dropping stale entries. */
export function withChecklistDone(
  map: Record<string, string[]> | undefined,
  date: string,
  doneIds: string[],
): Record<string, string[]> {
  const cutoffMs = Date.parse(`${date}T00:00:00Z`) - DONE_MAP_KEEP_DAYS * 86400000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  const next: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(map ?? {})) {
    if (k !== date && k >= cutoff && Array.isArray(v) && v.length) next[k] = v;
  }
  if (doneIds.length) next[date] = doneIds;
  return next;
}

/** New budget-lock map with `date` pinned to `budget`, dropping stale entries. */
export function withChecklistBudget(
  map: Record<string, number> | undefined,
  date: string,
  budget: number,
): Record<string, number> {
  const cutoffMs = Date.parse(`${date}T00:00:00Z`) - DONE_MAP_KEEP_DAYS * 86400000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(map ?? {})) {
    if (k !== date && k >= cutoff && typeof v === 'number') next[k] = v;
  }
  next[date] = budget;
  return next;
}
