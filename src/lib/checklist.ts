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

export type ChecklistTier = {
  /** Checklist length this tier starts at. */
  minItems: number;
  /**
   * Where the bonus is delivered inside the list. Each marker pays one fly the
   * moment it is passed. `final` is the last item, `50%` is halfway through,
   * and a bare number is that item's position.
   */
  markers: string[];
};

/**
 * Payout starts at the 3rd item and is sub-linear in length: a 20-item
 * checklist must never pay 20 flies, or every task becomes a checklist and the
 * daily cap turns into the only thing holding the economy up. The bonus is
 * delivered at pinned markers inside the list so the goal-gradient pull works
 * DURING the task, and partial credit is kept — pass a marker, keep the fly
 * even if the list is never finished.
 */
export const DEFAULT_CHECKLIST_TIERS: readonly ChecklistTier[] = [
  { minItems: 1, markers: [] },
  { minItems: 3, markers: ['final'] },
  { minItems: 5, markers: ['3', 'final'] },
  { minItems: 8, markers: ['33%', '67%', 'final'] },
  { minItems: 12, markers: ['25%', '50%', '75%', 'final'] },
];

function tierFor(
  steps: number,
  tiers: readonly ChecklistTier[] = DEFAULT_CHECKLIST_TIERS,
): ChecklistTier | null {
  let match: ChecklistTier | null = null;
  for (const tier of [...tiers].sort((a, b) => a.minItems - b.minItems)) {
    if (steps >= tier.minItems) match = tier;
  }
  return match;
}

/** Resolve one marker spec to a 0-based item index, or null if it can't be. */
function markerIndex(marker: string, steps: number): number | null {
  const raw = String(marker ?? '').trim().toLowerCase();
  if (!raw || steps <= 0) return null;
  if (raw === 'final' || raw === 'last') return steps - 1;
  if (raw.endsWith('%')) {
    const percent = Number(raw.slice(0, -1));
    if (!Number.isFinite(percent)) return null;
    const index = Math.round((steps * percent) / 100) - 1;
    return Math.min(steps - 1, Math.max(0, index));
  }
  const position = Number(raw);
  if (!Number.isFinite(position)) return null;
  return Math.min(steps - 1, Math.max(0, Math.round(position) - 1));
}

/** The item positions that pay, for a list of this length. */
export function checklistMarkerIndexes(
  steps: number,
  tiers: readonly ChecklistTier[] = DEFAULT_CHECKLIST_TIERS,
): number[] {
  const tier = tierFor(steps, tiers);
  if (!tier || steps === 0) return [];
  const indexes = new Set<number>();
  for (const marker of tier.markers) {
    const index = markerIndex(marker, steps);
    if (index !== null) indexes.add(index);
  }
  return Array.from(indexes).sort((a, b) => a - b);
}

/**
 * Bonus flies a checklist pays on TOP of the task's own fly — one per marker,
 * so the table's "bonus flies" column is never able to disagree with where the
 * flies actually land.
 */
export function checklistBonus(
  steps: number,
  tiers: readonly ChecklistTier[] = DEFAULT_CHECKLIST_TIERS,
): number {
  return checklistMarkerIndexes(steps, tiers).length;
}

/**
 * The same items with their reward markers set. Positions are derived purely
 * from the step count, so nothing is remembered per item and reordering steps
 * leaves the flies where they are. A checklist too short to earn a bonus
 * carries no markers at all.
 */
export function normalizeChecklistRewards(
  items: ChecklistItem[],
  budgetOrTiers?: number | readonly ChecklistTier[],
  tiers: readonly ChecklistTier[] = DEFAULT_CHECKLIST_TIERS,
): ChecklistItem[] {
  const steps = items.length;
  if (steps === 0) return items;
  const table = Array.isArray(budgetOrTiers)
    ? (budgetOrTiers as readonly ChecklistTier[])
    : tiers;
  const budget =
    typeof budgetOrTiers === 'number'
      ? budgetOrTiers
      : checklistBonus(steps, table);
  const marked = new Set(
    budget > 0 ? checklistMarkerIndexes(steps, table).slice(0, budget) : [],
  );
  return items.map((it, i) =>
    !!it.reward === marked.has(i) ? it : { ...it, reward: marked.has(i) },
  );
}

export type ChecklistPayout = {
  /** Items with normalized reward markers. */
  items: ChecklistItem[];
  /** Bonus flies this checklist can pay, after any locked-in cap. */
  budget: number;
  /** Bonus flies earned so far. */
  earned: number;
  doneCount: number;
};

/**
 * What a checklist has paid out on top of the task's own fly. A marker pays the
 * moment that many steps are checked and is never clawed back, so an abandoned
 * checklist keeps its partial credit. Completing the task does NOT release the
 * unticked markers — steps are the only way the bonus is earned, so its
 * progress is honest. `budgetLock` is the budget snapshotted the first time this
 * occurrence paid, so padding a finished checklist with extra steps can't mint
 * another fly.
 */
export function checklistPayout(
  items: ChecklistItem[],
  opts: { budgetLock?: number | null; tiers?: readonly ChecklistTier[] } = {},
): ChecklistPayout {
  const { budgetLock } = opts;
  const steps = items.length;
  const tiers = opts.tiers ?? DEFAULT_CHECKLIST_TIERS;
  const full = checklistBonus(steps, tiers);
  const normalized = normalizeChecklistRewards(items, full, tiers);
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
  tiers?: readonly ChecklistTier[],
): ChecklistPayout {
  return checklistPayout(checklistForDate(task, date), {
    budgetLock: task.checklistBudgetByDate?.[date],
    tiers,
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
