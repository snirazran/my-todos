'use client';

import React, { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Plus, Pen, ListChecks } from 'lucide-react';
import { TimeTag } from '@/components/ui/TimeTag';
import { Icon as AppIcon } from '@/components/ui/Icon';
import type {
  FocusCategoryTagMap,
  MacroCategoryId,
} from '@/lib/quests/types';
import type { ChecklistItem } from './types';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
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
};

export function SuggestionTabs({ open, className, onPick, onContentChange }: Props) {
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

  return (
    <div
      className={cn(
        'mt-3 flex flex-col border-t border-border/60 pt-3',
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between px-1 pb-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
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
          className="h-full min-h-0 overflow-y-auto px-1 pr-1.5 pb-2 overscroll-contain"
          style={{ scrollbarGutter: 'stable' }}
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
                className="group flex items-center gap-3 w-full rounded-2xl border border-border/60 bg-card px-3 py-2.5 text-left transition-all [@media(hover:hover)]:hover:border-primary/40 [@media(hover:hover)]:hover:bg-primary/5 active:scale-[0.99]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-muted-foreground/10 bg-muted">
                  <Fly size={28} y={-3} paused />
                </span>
                <div className="min-w-0 flex-1 flex flex-col gap-1">
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
                            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-normal shadow-sm"
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
                </div>
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors [@media(hover:hover)]:group-hover:bg-primary [@media(hover:hover)]:group-hover:text-primary-foreground"
                >
                  <Plus className="h-4 w-4 stroke-[3]" />
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
