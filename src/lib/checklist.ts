export type ChecklistItem = { id: string; text: string; done: boolean };

type ChecklistCarrier = {
  type?: string;
  checklist?: ChecklistItem[];
  checklistDoneByDate?: Record<string, string[]>;
};

/** Strip per-instance done flags: the stored series checklist is content only. */
export function checklistContent(
  items?: ChecklistItem[] | null,
): ChecklistItem[] | undefined {
  if (!items) return undefined;
  return items.map((it) => ({ id: it.id, text: it.text, done: false }));
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
  return items.map((it) => ({ id: it.id, text: it.text, done: done.has(it.id) }));
}

export function checklistDoneIdsForDate(
  task: ChecklistCarrier,
  date: string,
): string[] {
  return checklistForDate(task, date)
    .filter((it) => it.done)
    .map((it) => it.id);
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
