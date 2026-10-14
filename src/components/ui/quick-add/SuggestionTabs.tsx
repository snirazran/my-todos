'use client';

import React, { useEffect } from 'react';
import useSWR from 'swr';
import { Check, Pen, ListChecks, Plus } from 'lucide-react';
import { Icon as AppIcon } from '@/components/ui/Icon';
import type {
  FocusCategoryTagMap,
  MacroCategoryId,
} from '@/lib/quests/types';
import type { ChecklistItem } from './types';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import { taskFlyWorthNow } from '@/lib/flyValue';
import { FlyValueBadge } from '@/components/ui/FlyValueBadge';
import { fetcher } from './utils';
import { useDragScroll } from './useDragScroll';

type BacklogTask = {
  id: string;
  text: string;
  tags?: string[];
  startTime?: string;
  endTime?: string;
  reminder?: string;
  notes?: string;
  checklist?: ChecklistItem[];
};

const SAVED_TAB = '__saved__' as const;
type TabId = MacroCategoryId | typeof SAVED_TAB;

export const SAVED_TASKS_KEY = '/api/tasks?view=board&day=-1';

function withMatch(text: string, query: string) {
  if (query.length < 2) return text;
  const at = text.toLowerCase().indexOf(query);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[4px] bg-primary/15 px-px text-inherit">
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  );
}

function AddDot({ picked, size = 'sm' }: { picked: boolean; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full transition-colors',
        size === 'md' ? 'h-9 w-9' : 'h-7 w-7',
        picked
          ? 'bg-primary text-primary-foreground'
          : 'border-[1.5px] border-dashed border-muted-foreground/35 text-muted-foreground',
      )}
    >
      {picked ? (
        <Check className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} strokeWidth={3.5} />
      ) : (
        <Plus className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} strokeWidth={2.75} />
      )}
    </span>
  );
}

export type SuggestionPick = {
  text: string;
  tagIds: string[];
  sourceTab: TabId;
  startTime?: string;
  endTime?: string;
  reminder?: string;
  backlogTaskId?: string;
  notes?: string;
  checklist?: ChecklistItem[];
};

type Props = {
  open: boolean;
  /** Kept for backwards compatibility; no longer used. */
  focusCategoryIds?: MacroCategoryId[];
  categoryTagMap?: FocusCategoryTagMap[];
  className?: string;
  onPick: (pick: SuggestionPick) => void;
  /** Notifies the parent whether there is any saved task to display. */
  onContentChange?: (hasContent: boolean) => void;
  variant?: 'list' | 'chips';
  query?: string;
  selectedId?: string | null;
  onUnpick?: () => void;
};

export function SuggestionTabs({
  open,
  className,
  onPick,
  onContentChange,
  variant = 'list',
  query = '',
  selectedId = null,
  onUnpick,
}: Props) {
  const rail = useDragScroll();

  const { data: backlogData } = useSWR<BacklogTask[]>(
    open ? SAVED_TASKS_KEY : null,
    fetcher,
  );

  const { data: tagsData } = useSWR<{ tags: { id: string; name: string; color: string }[] }>(
    open ? '/api/tags' : null,
    fetcher,
  );
  const getTagDetails = (tagId: string) =>
    tagsData?.tags?.find((t) => t.id === tagId);

  const backlog = Array.isArray(backlogData) ? backlogData : [];

  useEffect(() => {
    onContentChange?.(backlog.length > 0);
  }, [backlog.length, onContentChange]);

  if (backlog.length === 0) return null;

  const pickOf = (t: BacklogTask): SuggestionPick => ({
    text: t.text,
    tagIds: t.tags ?? [],
    sourceTab: SAVED_TAB,
    startTime: t.startTime,
    endTime: t.endTime,
    reminder: t.reminder,
    backlogTaskId: t.id,
    notes: t.notes,
    checklist: t.checklist,
  });

  if (variant === 'chips') {
    const q = query.trim().toLowerCase();
    const selected = backlog.find((t) => t.id === selectedId);
    const searching =
      q.length >= 2 && !(selected && selected.text.trim().toLowerCase() === q);
    const shown = searching
      ? backlog.filter(
          (t) => t.id === selectedId || t.text.toLowerCase().includes(q),
        )
      : selected
        ? [selected]
        : [];
    if (shown.length === 0) return null;
    return (
      <div className={cn('mt-2.5 flex min-w-0 items-center gap-2', className)}>
        <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-black text-muted-foreground">
          <AppIcon name="saved" className="h-4 w-4" />
          {searching ? 'Already saved?' : 'From Saved'}
        </span>
        <div
          ref={rail.ref}
          {...rail.handlers}
          className="-my-1 flex min-w-0 flex-1 cursor-grab select-none gap-2 overflow-x-auto py-1 no-scrollbar active:cursor-grabbing"
          style={{ overscrollBehaviorX: 'none' }}
        >
          {shown.slice(0, 8).map((t) => {
            const isSelected = t.id === selectedId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  isSelected && onUnpick ? onUnpick() : onPick(pickOf(t))
                }
                aria-pressed={isSelected}
                aria-label={isSelected ? `Remove ${t.text}` : `Add saved task: ${t.text}`}
                title={t.text}
                className={cn(
                  'inline-flex h-9 max-w-[230px] shrink-0 items-center gap-1.5 rounded-full pl-1 pr-3 text-[13px] font-bold transition-[background-color,box-shadow]',
                  isSelected
                    ? 'bg-primary/10 text-primary ring-[1.5px] ring-inset ring-primary/45'
                    : 'bg-muted/60 text-foreground [@media(hover:hover)]:hover:bg-muted',
                )}
              >
                <AddDot picked={isSelected} />
                <span className="truncate">{withMatch(t.text, searching ? q : '')}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {backlog.map((t) => {
        const firstTag = t.tags?.length ? getTagDetails(t.tags[0]) : undefined;
        const extraTags = Math.max(0, (t.tags?.length ?? 0) - 1);
        const steps = t.checklist?.length ?? 0;
        const stepsDone = t.checklist?.filter((c) => c.done).length ?? 0;
        const hasMeta = !!firstTag || !!t.startTime || !!t.notes?.trim() || steps > 0;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(pickOf(t))}
            className="flex w-full items-center gap-3 rounded-2xl bg-muted/50 py-2 pl-2 pr-2.5 text-left transition-colors active:bg-muted [@media(hover:hover)]:hover:bg-muted"
          >
            <AddDot picked={false} size="md" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[14.5px] font-bold text-foreground">{t.text}</span>
              {hasMeta && (
                <span className="flex min-w-0 items-center gap-2 text-[12px] font-bold text-muted-foreground">
                  {firstTag && (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: firstTag.color }}
                      />
                      <span className="truncate">{firstTag.name}</span>
                      {extraTags > 0 && <span className="shrink-0">+{extraTags}</span>}
                    </span>
                  )}
                  {t.startTime && <span className="shrink-0 tabular-nums">{t.startTime}</span>}
                  {t.notes?.trim() && (
                    <Pen aria-label="Has notes" className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {steps > 0 && (
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 tabular-nums',
                        stepsDone === steps && 'text-primary',
                      )}
                    >
                      <ListChecks className="h-3.5 w-3.5" />
                      {stepsDone}/{steps}
                    </span>
                  )}
                </span>
              )}
            </span>
            <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card">
              <Fly size={28} y={-3} paused />
              <FlyValueBadge size="sm" value={taskFlyWorthNow({ checklist: t.checklist })} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { SAVED_TAB };
export type { TabId };
