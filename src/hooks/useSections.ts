'use client';

import useSWR from 'swr';

export const SECTIONS_KEY = '/api/sections';

export interface SectionSummary {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
  tagIds: string[];
}

const fetcher = (url: string) =>
  fetch(url).then((res) => (res.ok ? res.json() : { sections: [] }));

/**
 * Standalone sections list for surfaces that don't load the today view
 * (planner, buddy invites). The home view gets its sections from useTaskData.
 */
export function useSections(enabled = true) {
  const { data } = useSWR<{ sections?: SectionSummary[] }>(
    enabled ? SECTIONS_KEY : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  return (data?.sections ?? []).map((s) => ({
    ...s,
    tagIds: s.tagIds ?? [],
  }));
}
