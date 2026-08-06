'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { Target } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import type { Trackable } from '@/lib/questClaims';
import {
  buildTaskQuestChipLookup,
  type TaskQuestChip,
} from '@/lib/quests/taskQuestChip';

/**
 * Shares the home view's SWR entry rather than fetching its own, so putting a
 * chip on every task row costs no extra request.
 */
export function useTaskQuestChipLookup() {
  const timezone =
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';
  const { data } = useSWR<{ trackables?: Trackable[] }>(
    typeof window === 'undefined'
      ? null
      : `/api/quests?view=home&timezone=${encodeURIComponent(timezone)}`,
    (url: string) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false, revalidateIfStale: false },
  );
  return useMemo(
    () => buildTaskQuestChipLookup(data?.trackables),
    [data?.trackables],
  );
}

export function QuestTaskChip({
  chip,
  className,
  onClick,
}: {
  chip: TaskQuestChip;
  className?: string;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      title={`${chip.categoryName} quest — ${chip.label}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-dashed border-muted-foreground/30 bg-transparent px-1.5 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-muted-foreground',
        onClick && 'transition-colors hover:text-foreground',
        className,
      )}
    >
      <Target className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      <span className="truncate">{chip.label}</span>
      {chip.flies > 0 && (
        <>
          <span aria-hidden className="opacity-40">
            ·
          </span>
          <span className="inline-flex items-center gap-0.5 tabular-nums">
            <Fly className="h-3 w-3 shrink-0" />
            {chip.flies}
          </span>
        </>
      )}
    </Tag>
  );
}
