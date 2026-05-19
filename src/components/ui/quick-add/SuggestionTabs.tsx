'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { FolderOpen, Sparkles, Clock } from 'lucide-react';
import type {
  FocusCategoryTagMap,
  MacroCategoryId,
} from '@/lib/quests/types';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import { fetcher, formatTimeDisplay } from './utils';

type QuickAddSuggestion = { text: string; emoji: string };
type CategoryListEntry = {
  id: MacroCategoryId;
  name: string;
  quickAddSuggestions: QuickAddSuggestion[];
};
type CategoriesResponse = { categories: CategoryListEntry[] };

type FocusOnboarding = {
  selectedCategoryIds: MacroCategoryId[];
  categoryTagMap: FocusCategoryTagMap[];
};

type QuestsHomeResponse = {
  onboarding?: FocusOnboarding;
};

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
};

type Props = {
  open: boolean;
  /** Optional override; if omitted, SuggestionTabs fetches from /api/quests. */
  focusCategoryIds?: MacroCategoryId[];
  categoryTagMap?: FocusCategoryTagMap[];
  className?: string;
  onPick: (pick: SuggestionPick) => void;
};

function shuffledIndices(length: number) {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

export function SuggestionTabs({
  open,
  focusCategoryIds,
  categoryTagMap,
  className,
  onPick,
}: Props) {
  const hasOverride =
    focusCategoryIds !== undefined && categoryTagMap !== undefined;

  const tz =
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';

  const { data: questsData } = useSWR<QuestsHomeResponse>(
    open && !hasOverride
      ? `/api/quests/focus?timezone=${encodeURIComponent(tz)}`
      : null,
    fetcher,
  );

  const { data: categoriesData } = useSWR<CategoriesResponse>(
    open ? '/api/quests/categories' : null,
    fetcher,
  );
  const focusDataReady =
    categoriesData !== undefined && (hasOverride || questsData !== undefined);

  const resolvedCategoryIds: MacroCategoryId[] = hasOverride
    ? focusCategoryIds!
    : questsData?.onboarding?.selectedCategoryIds ?? [];
  const resolvedTagMap: FocusCategoryTagMap[] = hasOverride
    ? categoryTagMap!
    : questsData?.onboarding?.categoryTagMap ?? [];

  const focusCategories = useMemo(() => {
    const byId = new Map(
      (categoriesData?.categories ?? []).map((c) => [c.id, c]),
    );
    return resolvedCategoryIds
      .map((id) => byId.get(id))
      .filter((c): c is CategoryListEntry => !!c);
  }, [categoriesData, resolvedCategoryIds]);

  const tabs: TabId[] = useMemo(
    () => [...focusCategories.map((c) => c.id), SAVED_TAB],
    [focusCategories],
  );

  const [activeTab, setActiveTab] = useState<TabId>(tabs[0] ?? SAVED_TAB);
  const [displayedCategoryIds, setDisplayedCategoryIds] = useState<
    MacroCategoryId[] | null
  >(null);
  const [displayedSuggestionOrders, setDisplayedSuggestionOrders] = useState<
    Partial<Record<MacroCategoryId, number[]>> | null
  >(null);
  const userPickedTabRef = useRef(false);
  const autoSelectedForOpenRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showBottomFade, setShowBottomFade] = useState(false);

  useEffect(() => {
    if (!tabs.includes(activeTab)) setActiveTab(tabs[0] ?? SAVED_TAB);
  }, [tabs, activeTab]);

  const { data: backlogData } = useSWR<BacklogTask[]>(
    open ? '/api/tasks?view=board&day=-1' : null,
    fetcher,
  );

  useEffect(() => {
    if (!open) {
      userPickedTabRef.current = false;
      autoSelectedForOpenRef.current = false;
      setDisplayedCategoryIds(null);
      setDisplayedSuggestionOrders(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (autoSelectedForOpenRef.current) return;
    if (userPickedTabRef.current) return;
    if (!focusDataReady) return;
    if (backlogData === undefined) return;

    setDisplayedSuggestionOrders(
      Object.fromEntries(
        focusCategories.map((category) => [
          category.id,
          shuffledIndices(category.quickAddSuggestions.length),
        ]),
      ) as Partial<Record<MacroCategoryId, number[]>>,
    );

    const hasBacklog = Array.isArray(backlogData) && backlogData.length > 0;
    if (hasBacklog) {
      setActiveTab(SAVED_TAB);
      setDisplayedCategoryIds(focusCategories.map((c) => c.id));
    } else if (focusCategories.length > 0) {
      const idx = Math.floor(Math.random() * focusCategories.length);
      const reordered = [
        focusCategories[idx].id,
        ...focusCategories
          .filter((_, i) => i !== idx)
          .map((c) => c.id),
      ];
      setDisplayedCategoryIds(reordered);
      setActiveTab(reordered[0]);
    } else {
      setDisplayedCategoryIds([]);
    }
    autoSelectedForOpenRef.current = true;
  }, [open, backlogData, focusCategories, focusDataReady]);

  const orderedCategories = useMemo(() => {
    if (!displayedCategoryIds) return focusCategories;
    const byId = new Map(focusCategories.map((c) => [c.id, c]));
    return displayedCategoryIds
      .map((id) => byId.get(id))
      .filter((c): c is (typeof focusCategories)[number] => !!c);
  }, [displayedCategoryIds, focusCategories]);

  const pickTab = (tab: TabId) => {
    userPickedTabRef.current = true;
    setActiveTab(tab);
  };

  const activeCategory =
    activeTab === SAVED_TAB
      ? null
      : focusCategories.find((c) => c.id === activeTab) ?? null;

  const suggestions = activeCategory?.quickAddSuggestions ?? [];
  const displayedSuggestions = useMemo(() => {
    if (!activeCategory) return suggestions;

    const order = displayedSuggestionOrders?.[activeCategory.id];
    if (!order || order.length !== suggestions.length) return suggestions;

    return order
      .map((index) => suggestions[index])
      .filter((suggestion): suggestion is QuickAddSuggestion => !!suggestion);
  }, [activeCategory, displayedSuggestionOrders, suggestions]);
  const backlog = Array.isArray(backlogData) ? backlogData : [];

  const tagsForCategory = (categoryId: MacroCategoryId): string[] =>
    resolvedTagMap.find((m) => m.categoryId === categoryId)?.tagIds ?? [];

  const updateFade = () => {
    const el = scrollRef.current;
    if (!el) return;
    const more = el.scrollHeight - el.clientHeight - el.scrollTop > 4;
    setShowBottomFade(more);
  };

  useEffect(() => {
    updateFade();
  }, [activeTab, displayedSuggestions.length, backlog.length, open]);

  if (focusCategories.length === 0) return null;

  return (
    <div
      className={cn(
        'mt-3 flex flex-col border-t border-border/60 pt-3',
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1.5 px-1 pb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        <span>Suggestions</span>
      </div>

      <div className="-mx-1 mb-2 shrink-0 overflow-x-auto bg-popover/95 py-1 no-scrollbar">
        <div className="flex min-w-max items-center gap-1 px-1">
          {backlog.length > 0 && (
            <button
              key={`${SAVED_TAB}-first`}
              type="button"
              onClick={() => pickTab(SAVED_TAB)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${
                activeTab === SAVED_TAB
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground [@media(hover:hover)]:hover:bg-muted/50'
              }`}
            >
              <FolderOpen className="h-3 w-3" />
              Saved
            </button>
          )}
          {orderedCategories.map((c) => {
            const isActive = activeTab === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pickTab(c.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground [@media(hover:hover)]:hover:bg-muted/50'
                }`}
              >
                {c.name}
              </button>
            );
          })}
          {backlog.length === 0 && (
            <button
              key={`${SAVED_TAB}-last`}
              type="button"
              onClick={() => pickTab(SAVED_TAB)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${
                activeTab === SAVED_TAB
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground [@media(hover:hover)]:hover:bg-muted/50'
              }`}
            >
              <FolderOpen className="h-3 w-3" />
              Saved
            </button>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={updateFade}
          className="h-full min-h-0 overflow-y-auto px-1 pr-1.5 pb-2 overscroll-contain"
          style={{ scrollbarGutter: 'stable' }}
        >
          {activeTab === SAVED_TAB ? (
            backlog.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground/60">
                <FolderOpen className="h-8 w-8" strokeWidth={1.5} />
                <span className="text-[11px] font-bold uppercase tracking-widest">
                  No saved tasks
                </span>
              </div>
            ) : (
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
                      })
                    }
                    className="group flex items-center gap-2.5 w-full rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-left transition-colors [@media(hover:hover)]:hover:bg-muted/60 active:scale-[0.99]"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-muted-foreground/10 bg-muted">
                      <Fly size={28} y={-3} paused />
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] font-bold text-foreground truncate">
                      {t.text}
                    </span>
                    {t.startTime && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-primary">
                        <Clock className="h-3 w-3" />
                        {formatTimeDisplay(t.startTime)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {displayedSuggestions.map((s, i) => (
                <button
                  key={`${activeTab}-${i}`}
                  type="button"
                  onClick={() =>
                    onPick({
                      text: s.text,
                      tagIds: tagsForCategory(activeTab as MacroCategoryId),
                      sourceTab: activeTab,
                    })
                  }
                  className="group flex items-center gap-2.5 w-full rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-left transition-colors [@media(hover:hover)]:hover:bg-muted/60 active:scale-[0.99]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-muted-foreground/10 bg-muted">
                    <Fly size={28} y={-3} paused />
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] font-bold text-foreground truncate">
                    {s.text}
                  </span>
                </button>
              ))}
            </div>
          )}
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
