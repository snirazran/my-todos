'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hapticSelect, hapticTick } from '@/lib/haptics';

export const BACKLOG_KEY = '__backlog__';

export type SelectionRef = {
  taskId: string;
  /** The column this instance lives in — a repeating task shares one id across
   *  every date column, so the date is part of a selection's identity. */
  dateKey: string;
  dayIndex: number;
  isRepeating: boolean;
  repeatGroupId?: string;
  completed: boolean;
};

export const selectionKeyFor = (dateKey: string, taskId: string) =>
  `${dateKey}::${taskId}`;

export type TaskSelection = ReturnType<typeof useTaskSelection>;

export function useTaskSelection() {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<ReadonlyMap<string, SelectionRef>>(
    () => new Map(),
  );
  const anchorRef = useRef<{ dateKey: string; taskId: string } | null>(null);
  // Mode can be entered empty (from a column header), so "nothing selected"
  // only means "leave" once the user has actually picked something.
  const pickedSomethingRef = useRef(false);

  const clear = useCallback(() => {
    anchorRef.current = null;
    setSelected((prev) => (prev.size === 0 ? prev : new Map()));
  }, []);

  const exit = useCallback(() => {
    anchorRef.current = null;
    pickedSomethingRef.current = false;
    setActive(false);
    setSelected((prev) => (prev.size === 0 ? prev : new Map()));
  }, []);

  const enter = useCallback((seed?: SelectionRef) => {
    setActive(true);
    if (!seed) {
      pickedSomethingRef.current = false;
      return;
    }
    anchorRef.current = { dateKey: seed.dateKey, taskId: seed.taskId };
    setSelected(() => new Map([[selectionKeyFor(seed.dateKey, seed.taskId), seed]]));
  }, []);

  const toggle = useCallback((ref: SelectionRef) => {
    const key = selectionKeyFor(ref.dateKey, ref.taskId);
    setActive(true);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
        hapticTick();
      } else {
        next.set(key, ref);
        hapticSelect();
      }
      return next;
    });
    anchorRef.current = { dateKey: ref.dateKey, taskId: ref.taskId };
  }, []);

  // Unpicking the last card leaves the mode entirely — a bulk bar reading
  // "0 selected" has nothing to act on and just blocks the board. Done as an
  // effect rather than inside the toggle's updater so it stays a plain
  // post-commit reaction (updaters must be side-effect free).
  useEffect(() => {
    if (!active) return;
    if (selected.size > 0) {
      pickedSomethingRef.current = true;
      return;
    }
    if (pickedSomethingRef.current) setActive(false);
  }, [active, selected.size]);

  /**
   * Shift-click range: selects everything between the anchor and `ref` inside a
   * single column. Falls back to a plain toggle when there's no anchor in this
   * column (ranges never span columns — the visual order between them is
   * ambiguous).
   */
  const selectRange = useCallback(
    (ref: SelectionRef, columnRefs: SelectionRef[]) => {
      const anchor = anchorRef.current;
      if (!anchor || anchor.dateKey !== ref.dateKey) {
        toggle(ref);
        return;
      }
      const from = columnRefs.findIndex((r) => r.taskId === anchor.taskId);
      const to = columnRefs.findIndex((r) => r.taskId === ref.taskId);
      if (from === -1 || to === -1) {
        toggle(ref);
        return;
      }
      const [lo, hi] = from <= to ? [from, to] : [to, from];
      setActive(true);
      setSelected((prev) => {
        const next = new Map(prev);
        for (let i = lo; i <= hi; i++) {
          const r = columnRefs[i];
          next.set(selectionKeyFor(r.dateKey, r.taskId), r);
        }
        return next;
      });
      hapticSelect();
    },
    [toggle],
  );

  const selectAll = useCallback((refs: SelectionRef[]) => {
    setActive(true);
    setSelected((prev) => {
      const next = new Map(prev);
      for (const r of refs) next.set(selectionKeyFor(r.dateKey, r.taskId), r);
      return next;
    });
    hapticSelect();
  }, []);

  const isSelected = useCallback(
    (dateKey: string, taskId: string) =>
      selected.has(selectionKeyFor(dateKey, taskId)),
    [selected],
  );

  const refs = useMemo(() => Array.from(selected.values()), [selected]);

  const stats = useMemo(() => {
    let repeating = 0;
    let completed = 0;
    const dateKeys = new Set<string>();
    for (const r of refs) {
      if (r.isRepeating) repeating++;
      if (r.completed) completed++;
      dateKeys.add(r.dateKey);
    }
    return {
      count: refs.length,
      repeating,
      completed,
      hasRepeating: repeating > 0,
      spansColumns: dateKeys.size > 1,
    };
  }, [refs]);

  return {
    active,
    selected,
    refs,
    stats,
    enter,
    exit,
    clear,
    toggle,
    selectRange,
    selectAll,
    isSelected,
  };
}
