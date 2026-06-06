'use client';

import React, { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { FolderOpen, Clock, Bell } from 'lucide-react';
import type {
  FocusCategoryTagMap,
  MacroCategoryId,
} from '@/lib/quests/types';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import { fetcher, formatTimeDisplay } from './utils';

type BacklogTask = {
  id: string;
  text: string;
  tags?: string[];
  startTime?: string;
  endTime?: string;
  reminder?: string;
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
      <div className="flex shrink-0 items-center gap-1.5 px-1 pb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        <FolderOpen className="h-3 w-3" />
        <span>Saved</span>
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
                  })
                }
                className="group flex items-center gap-2.5 w-full rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 text-left transition-colors [@media(hover:hover)]:hover:bg-muted/60 active:scale-[0.99]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-muted-foreground/10 bg-muted">
                  <Fly size={28} y={-3} paused />
                </span>
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  {((t.tags && t.tags.length > 0) || t.startTime) && (
                    <div className="flex flex-wrap gap-1">
                      {t.startTime && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-normal text-primary shadow-sm">
                          <Clock className="w-2.5 h-2.5 shrink-0" />
                          <span>{formatTimeDisplay(t.startTime)}{t.endTime && t.endTime !== t.startTime ? ` - ${formatTimeDisplay(t.endTime)}` : ''}</span>
                          {t.reminder && <Bell className="w-2.5 h-2.5 shrink-0 text-amber-500" />}
                        </span>
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
                  <span className="text-[13px] font-bold text-foreground truncate">
                    {t.text}
                  </span>
                </div>
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
