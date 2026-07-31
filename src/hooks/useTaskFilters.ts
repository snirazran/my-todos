'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createTaskFilters,
  isTaskFilterActive,
  taskFilterCount,
  type TaskFilters,
} from '@/lib/taskFilters';

export type FilterPreset = {
  id: string;
  name: string;
  filters: TaskFilters;
};

const PRESETS_KEY = 'frogs.filterPresets';
const filtersKey = (surface: string) => `frogs.filters.${surface}`;

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/**
 * Filter state for one surface (home list, planner board, saved tray), restored
 * from localStorage on mount. Presets are shared across every surface, so a
 * combo saved on the board can be reapplied at home.
 */
export function useTaskFilters(surface: string, base?: Partial<TaskFilters>) {
  const baseFilters = useMemo(() => createTaskFilters(base), [base]);
  const [filters, setFilters] = useState<TaskFilters>(baseFilters);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readJson<Partial<TaskFilters>>(filtersKey(surface));
    if (stored) setFilters(createTaskFilters({ ...base, ...stored }));
    setPresets(readJson<FilterPreset[]>(PRESETS_KEY) ?? []);
    setHydrated(true);
    // Restoring is a mount-time concern; later prop changes must not clobber
    // what the user has since picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface]);

  useEffect(() => {
    if (hydrated) writeJson(filtersKey(surface), filters);
  }, [filters, hydrated, surface]);

  const reset = useCallback(() => setFilters(baseFilters), [baseFilters]);

  const savePreset = useCallback(
    (name: string) => {
      const preset: FilterPreset = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim().slice(0, 24),
        filters,
      };
      setPresets((prev) => {
        const next = [...prev.filter((p) => p.name !== preset.name), preset];
        writeJson(PRESETS_KEY, next);
        return next;
      });
    },
    [filters],
  );

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      writeJson(PRESETS_KEY, next);
      return next;
    });
  }, []);

  return {
    filters,
    setFilters,
    baseFilters,
    reset,
    presets,
    savePreset,
    deletePreset,
    isActive: isTaskFilterActive(filters, baseFilters),
    activeCount: taskFilterCount(filters, baseFilters),
  };
}
