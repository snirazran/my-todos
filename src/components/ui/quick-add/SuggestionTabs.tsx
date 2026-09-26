'use client';

import React, { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Check, Pen, ListChecks } from 'lucide-react';
import { TimeTag } from '@/components/ui/TimeTag';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showBottomFade, setShowBottomFade] = useState(false);

  const { data: backlogData } = useSWR<BacklogTask[]>(
    open ? '/api/tasks?view=board&day=-1' : null,
    fetcher,
  );

  const { data: tagsData } = useSWR<{ tags: { id: string; name: string; color: string }[] }>(
    open ? '/api/tags' : null,
    fetcher,
  );
  const getTagDetails = (tagId: string) =>
    tagsData?.tags?.find((t) => t.id === tagId);

  const backlog = Array.isArray(backlogData) ? backlogData : [];

  const updateFade = () => {
    const el = scrollRef.current;
    if (!el) return;
    const more = el.scrollHeight - el.clientHeight - el.scrollTop > 4;
    setShowBottomFade(more);
  };

  useEffect(() => {
    updateFade();
  }, [backlog.length, open]);

  useEffect(() => {
    onContentChange?.(backlog.length > 0);
  }, [backlog.length, onContentChange]);

  // Only render when there are actually saved tasks.
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
      : backlog;
    if (shown.length === 0) return null;
    return (
      <div className={cn('mt-3 border-t border-border/60 pt-2.5', className)}>
        <div className="flex items-center gap-1.5 px-0.5 pb-2 text-[12px] font-black text-muted-foreground">
          <AppIcon name="saved" className="h-3.5 w-3.5" />
          <span>{searching ? 'Already saved?' : 'From Saved'}</span>
          <span className="tabular-nums opacity-70">{shown.length}</span>
        </div>
        <div className="-mx-1 flex touch-pan-x gap-1.5 overflow-x-auto px-1 pb-0.5 no-scrollbar">
          {shown.map((t) => {
            const isSelected = t.id === selectedId;
            const firstTag = t.tags?.length ? getTagDetails(t.tags[0]) : undefined;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  isSelected && onUnpick ? onUnpick() : onPick(pickOf(t))
                }
                aria-pressed={isSelected}
                title={t.text}
                className={cn(
                  'inline-flex h-9 max-w-[220px] shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-bold transition-[background-color,border-color,color,transform] active:scale-95',
                  isSelected
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border/70 bg-muted/60 text-foreground [@media(hover:hover)]:hover:border-primary/40',
                )}
              >
                {isSelected ? (
                  <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
                ) : firstTag ? (
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: firstTag.color }}
                  />
                ) : null}
                <span className="truncate">{t.text}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'mt-3 flex flex-col border-t border-border/60 pt-3',
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between px-1 pb-2.5">
        <div className="flex items-center gap-1.5 text-[13px] font-black text-muted-foreground">
          <AppIcon name="saved" className="h-3.5 w-3.5" />
          <span>Saved</span>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black tabular-nums text-muted-foreground">
          {backlog.length}
        </span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={updateFade}
          className="h-full min-h-0 overflow-y-auto px-1 pb-2 overscroll-contain"
        >
          <div className="flex flex-col gap-1.5">
            {backlog.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  onPick({
                    text: t.text,
                    tagIds: t.tags ?? [],
                    sourceTab: SAVED_TAB,
                    startTime: t.startTime,
                    endTime: t.endTime,
                    reminder: t.reminder,
                    backlogTaskId: t.id,
                    notes: t.notes,
                    checklist: t.checklist,
                  })
                }
                className="group flex items-center gap-3 w-full rounded-xl border border-transparent bg-card dark:bg-muted px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.5)] transition-all [@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:bg-primary/5 active:scale-[0.99]"
              >
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  {((t.tags && t.tags.length > 0) || t.startTime) && (
                    <div className="flex flex-wrap items-center gap-1">
                      {t.startTime && (
                        <TimeTag
                          startTime={t.startTime}
                          endTime={t.endTime}
                          reminder={t.reminder}
                        />
                      )}
                      {t.tags?.map((tagId) => {
                        const tag = getTagDetails(tagId);
                        if (!tag) return null;
                        return (
                          <span
                            key={tagId}
                            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-bold tracking-normal shadow-sm"
                            style={{
                              backgroundColor: `${tag.color}20`,
                              color: tag.color,
                              borderColor: `${tag.color}40`,
                            }}
                          >
                            {tag.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="text-[13px] font-bold text-foreground truncate">
                      {t.text}
                    </span>
                    {(t.notes?.trim() ||
                      (t.checklist && t.checklist.length > 0)) && (
                      <span className="inline-flex flex-shrink-0 items-center gap-1.5">
                        {t.notes?.trim() && (
                          <Pen
                            aria-label="Has notes"
                            className="h-3.5 w-3.5 text-muted-foreground/70"
                          />
                        )}
                        {t.checklist &&
                          t.checklist.length > 0 &&
                          (() => {
                            const done = t.checklist.filter(
                              (c) => c.done,
                            ).length;
                            const total = t.checklist.length;
                            return (
                              <span
                                className={`inline-flex items-center gap-1 ${
                                  done === total
                                    ? 'text-primary'
                                    : 'text-muted-foreground/70'
                                }`}
                              >
                                <ListChecks className="h-3.5 w-3.5" />
                                <span className="text-[10px] font-bold tabular-nums">
                                  {done}/{total}
                                </span>
                              </span>
                            );
                          })()}
                      </span>
                    )}
                  </div>
                </div>
                <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-muted-foreground/10 bg-muted">
                  <Fly size={28} y={-3} paused />
                  <FlyValueBadge
                    size="sm"
                    value={taskFlyWorthNow({ checklist: t.checklist })}
                  />
                </span>
              </button>
            ))}
          </div>
        </div>

        {showBottomFade && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-popover/95 to-transparent rounded-b-md"
          />
        )}
      </div>
    </div>
  );
}

export { SAVED_TAB };
export type { TabId };
