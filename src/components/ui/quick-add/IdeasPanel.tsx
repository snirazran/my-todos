'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ListChecks, Pen, Plus } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { FlyValueBadge } from '@/components/ui/FlyValueBadge';
import { Icon as AppIcon } from '@/components/ui/Icon';
import { TASK_CARD_SURFACE } from '@/components/ui/taskSurfaces';
import { taskFlyWorthNow } from '@/lib/flyValue';
import { burstSparksAt } from '@/lib/taskEntrance';
import { cn } from '@/lib/utils';
import {
  IDEA_CATEGORIES,
  ideaCategory,
  ideasForCategory,
  ideasForMoment,
  momentForHour,
  momentLabel,
  normalizeIdeaText,
  searchIdeas,
  type HabitIdea,
  type IdeaCategoryId,
} from '@/lib/habits/ideaLibrary';
import type { ChecklistItem, SavedTag } from './types';
import { useDragScroll } from './useDragScroll';

export type SavedIdeaTask = {
  id: string;
  text: string;
  tags?: string[];
  startTime?: string;
  endTime?: string;
  reminder?: string;
  notes?: string;
  checklist?: ChecklistItem[];
};

type TapHandlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onClick: () => void;
};

type TabId = 'now' | 'saved' | IdeaCategoryId;

type Props = {
  open: boolean;
  isDesktop: boolean;
  compose?: boolean;
  query: string;
  saved: SavedIdeaTask[];
  savedTags: SavedTag[];
  pickedIdeaId: string | null;
  pickedSavedId: string | null;
  addedIdeaIds: string[];
  existingTexts?: string[];
  bottomPad?: number;
  className?: string;
  sheetClassName?: string;
  tap: (run: () => void) => TapHandlers;
  onPickIdea: (idea: HabitIdea) => void;
  onUnpickIdea: () => void;
  onInstantAdd: (idea: HabitIdea) => void;
  onPickSaved: (task: SavedIdeaTask) => void;
  onUnpickSaved: () => void;
  onListDrag?: () => void;
  onTabColor?: (color: string | null) => void;
};

const FLY_SLOT =
  'rounded-full bg-[#edf6e6] shadow-[inset_0_0_0_1px_rgba(68,125,63,0.13),0_3px_0_0_#d3e7c4] dark:bg-[#b9d3a8] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22),0_3px_0_0_#58774b]';

const TAB_BASE =
  'inline-flex h-10 shrink-0 select-none items-center gap-1.5 rounded-full px-4 text-[14px] font-extrabold transition-[background-color,color,transform,box-shadow] duration-150 ease-out active:scale-[0.96]';
const TAB_ON =
  'bg-[#447d3f] text-white shadow-[0_2px_0_0_#2c511a]';
const TAB_OFF =
  'bg-[hsl(var(--card-raised))] text-foreground/65 shadow-[0_0_0_1px_rgba(15,23,42,0.05),0_2px_0_0_rgba(15,23,42,0.05)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_2px_0_0_rgba(0,0,0,0.3)] [@media(hover:hover)]:hover:text-foreground';

const ROW_BASE = `${TASK_CARD_SURFACE} relative flex min-h-[60px] items-stretch transition-[box-shadow,background-color] duration-150 ease-out`;
const ROW_PICKED =
  '!shadow-[0_0_0_2px_hsl(var(--primary)/0.55),0_2px_0_0_hsl(var(--primary)/0.25)]';

function highlight(text: string, query: string) {
  const token = normalizeIdeaText(query).split(' ')[0] ?? '';
  if (token.length < 2) return text;
  const at = text.toLowerCase().indexOf(token);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[5px] bg-primary/15 px-px text-inherit">
        {text.slice(at, at + token.length)}
      </mark>
      {text.slice(at + token.length)}
    </>
  );
}

function IdeaRow({
  idea,
  state,
  showCategory,
  query,
  tap,
  onPick,
  onUnpick,
  onAdd,
}: {
  idea: HabitIdea;
  state: 'idle' | 'picked' | 'added';
  showCategory: boolean;
  query: string;
  tap: Props['tap'];
  onPick: () => void;
  onUnpick: () => void;
  onAdd: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const category = ideaCategory(idea.categoryId);
  const picked = state === 'picked';
  const added = state === 'added';
  const meta = added
    ? ['On your list']
    : ([
        showCategory ? category.label : null,
        idea.weekly ? 'Weekly' : null,
      ].filter(Boolean) as string[]);
  const rowRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLButtonElement>(null);
  const lastState = useRef(state);
  useEffect(() => {
    const was = lastState.current;
    lastState.current = state;
    if (was === 'added' || state !== 'added') return;
    if (rowRef.current && slotRef.current) {
      burstSparksAt(rowRef.current, slotRef.current, 150);
    }
  }, [state]);

  return (
    <div
      ref={rowRef}
      className={cn(ROW_BASE, picked && ROW_PICKED)}
      data-idea-id={idea.id}
    >
      <button
        type="button"
        aria-pressed={picked}
        disabled={added}
        {...tap(picked ? onUnpick : onPick)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-l-[18px] py-2 pl-2.5 pr-1 text-left outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-primary/50 enabled:active:scale-[0.985]"
      >
        <span
          aria-hidden
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-[13px] text-[20px] leading-none transition-opacity duration-200',
            added && 'opacity-60',
          )}
          style={{ backgroundColor: `${category.color}24` }}
        >
          {idea.emoji}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              'line-clamp-2 text-[15px] font-semibold leading-snug transition-colors duration-200',
              added ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {query ? highlight(idea.text, query) : idea.text}
          </span>
          {meta.length > 0 && (
            <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-bold text-muted-foreground">
              <span className="truncate">{meta.join(', ')}</span>
            </span>
          )}
        </span>
      </button>
      <button
        ref={slotRef}
        type="button"
        disabled={added}
        aria-label={
          added
            ? `${idea.text} is on your list`
            : picked
              ? `Clear ${idea.text}`
              : `Add ${idea.text} every ${idea.weekly ? 'week' : 'day'}`
        }
        {...tap(picked ? onUnpick : onAdd)}
        className="group grid w-[52px] shrink-0 place-items-center rounded-r-[18px] outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {added ? (
            <motion.span
              key="fly"
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -16, scale: 0.7, rotate: -20 }
              }
              animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
              transition={{ type: 'spring', duration: 0.5, bounce: 0.32 }}
              className={cn('relative grid h-9 w-9 place-items-center', FLY_SLOT)}
            >
              <Fly size={27} y={-3} paused interactive={false} />
              <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-[#447d3f] text-white ring-2 ring-[hsl(var(--card-raised))]">
                <Check className="h-2.5 w-2.5" strokeWidth={4} />
              </span>
            </motion.span>
          ) : picked ? (
            <motion.span
              key="picked"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
              className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground dark:bg-[#4a8a44] dark:text-white"
            >
              <Check className="h-4 w-4" strokeWidth={3.5} />
            </motion.span>
          ) : (
            <motion.span
              key="plus"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
              className="grid h-9 w-9 place-items-center rounded-full border-[1.5px] border-dashed border-muted-foreground/40 text-muted-foreground transition-[transform,border-color,color] duration-150 ease-out group-active:scale-90 [@media(hover:hover)]:group-hover:border-primary/60 [@media(hover:hover)]:group-hover:text-primary"
            >
              <Plus className="h-4 w-4" strokeWidth={2.75} />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}

function SavedRow({
  task,
  picked,
  query,
  tagOf,
  tap,
  onPick,
  onUnpick,
}: {
  task: SavedIdeaTask;
  picked: boolean;
  query: string;
  tagOf: (id: string) => SavedTag | undefined;
  tap: Props['tap'];
  onPick: () => void;
  onUnpick: () => void;
}) {
  const firstTag = task.tags?.length ? tagOf(task.tags[0]) : undefined;
  const extraTags = Math.max(0, (task.tags?.length ?? 0) - 1);
  const steps = task.checklist?.length ?? 0;
  const stepsDone = task.checklist?.filter((c) => c.done).length ?? 0;
  const hasNotes = !!task.notes?.trim();

  return (
    <button
      type="button"
      aria-pressed={picked}
      {...tap(picked ? onUnpick : onPick)}
      className={cn(
        ROW_BASE,
        'w-full items-center gap-3 py-2 pl-2.5 pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.985]',
        picked && ROW_PICKED,
      )}
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-foreground/[0.06]"
      >
        <AppIcon name="saved" className="h-[22px] w-[22px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
          {query ? highlight(task.text, query) : task.text}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] font-bold text-muted-foreground">
          <span className="shrink-0">Saved</span>
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
          {task.startTime && (
            <span className="shrink-0 tabular-nums">{task.startTime}</span>
          )}
          {hasNotes && <Pen aria-label="Has notes" className="h-3.5 w-3.5 shrink-0" />}
          {steps > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
              <ListChecks className="h-3.5 w-3.5" />
              {stepsDone}/{steps}
            </span>
          )}
        </span>
      </span>
      {picked ? (
        <span className="mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground dark:bg-[#4a8a44] dark:text-white">
          <Check className="h-4 w-4" strokeWidth={3.5} />
        </span>
      ) : (
        <span className={cn('relative mr-1 grid h-9 w-9 shrink-0 place-items-center', FLY_SLOT)}>
          <Fly size={27} y={-3} paused interactive={false} />
          <FlyValueBadge size="sm" value={taskFlyWorthNow({ checklist: task.checklist })} />
        </span>
      )}
    </button>
  );
}

export function IdeasPanel({
  open,
  isDesktop,
  compose = false,
  query,
  saved,
  savedTags,
  pickedIdeaId,
  pickedSavedId,
  addedIdeaIds,
  existingTexts,
  bottomPad = 0,
  className,
  sheetClassName,
  tap,
  onPickIdea,
  onUnpickIdea,
  onInstantAdd,
  onPickSaved,
  onUnpickSaved,
  onListDrag,
  onTabColor,
}: Props) {
  const rail = useDragScroll();
  const listRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabId>('now');
  const [searchClosedFor, setSearchClosedFor] = useState('');

  const moment = useMemo(
    () => momentForHour(new Date().getHours()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const taken = useMemo(() => {
    const set: Record<string, true> = {};
    (existingTexts ?? []).forEach((text) => {
      set[text] = true;
    });
    return set;
  }, [existingTexts]);

  const [takenAtOpen, setTakenAtOpen] = useState<Record<string, true>>({});
  const [openSeen, setOpenSeen] = useState(false);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) {
      setTab('now');
      setSearchClosedFor('');
      setTakenAtOpen(taken);
    }
  }

  const activeTab: TabId = tab === 'saved' && saved.length === 0 ? 'now' : tab;
  const stateOf = (idea: HabitIdea): 'idle' | 'picked' | 'added' => {
    if (addedIdeaIds.indexOf(idea.id) >= 0) return 'added';
    if (idea.id === pickedIdeaId) return 'picked';
    if (taken[normalizeIdeaText(idea.text)]) return 'added';
    return 'idle';
  };

  const q = query.trim();
  const search = useMemo(() => {
    if (q.length < 3) return null;
    const lower = q.toLowerCase();
    const savedHits = saved.filter((task) => task.text.toLowerCase().indexOf(lower) >= 0);
    const ideaHits = searchIdeas(q);
    if (savedHits.length === 0 && ideaHits.length === 0) return null;
    return { savedHits: savedHits.slice(0, 6), ideaHits };
  }, [q, saved]);
  const searching = !!search && searchClosedFor !== q;

  const tabIdeas = useMemo(() => {
    const wasTaken = (idea: HabitIdea) =>
      !!takenAtOpen[normalizeIdeaText(idea.text)];
    if (activeTab === 'now') return ideasForMoment(moment, wasTaken);
    if (activeTab === 'saved') return [];
    const all = ideasForCategory(activeTab);
    return all
      .filter((idea) => !wasTaken(idea))
      .concat(all.filter(wasTaken));
  }, [activeTab, moment, takenAtOpen]);

  const showResults = searching && !compose;
  const listKey = showResults ? 'search' : activeTab;
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [listKey]);

  const tabColor =
    !open || searching || activeTab === 'now' || activeTab === 'saved'
      ? null
      : ideaCategory(activeTab).color;
  useEffect(() => {
    onTabColor?.(tabColor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabColor]);

  const selectTab = (id: TabId, el: HTMLElement) => {
    setTab(id);
    setSearchClosedFor(q);
    const scroller = rail.ref.current;
    if (!scroller) return;
    scroller.scrollTo({
      left: el.offsetLeft - (scroller.clientWidth - el.offsetWidth) / 2,
      behavior: 'smooth',
    });
  };

  const tagOf = (id: string) => savedTags.find((t) => t.id === id);

  const tabs: Array<{ id: TabId; label: string; icon?: React.ReactNode }> = [
    { id: 'now', label: momentLabel(moment) },
    ...(saved.length > 0
      ? [
          {
            id: 'saved' as TabId,
            label: `Saved ${saved.length}`,
            icon: <AppIcon name="saved" className="h-[18px] w-[18px]" />,
          },
        ]
      : []),
    ...IDEA_CATEGORIES.map((category) => ({
      id: category.id as TabId,
      label: category.label,
    })),
  ];

  const ideaRow = (idea: HabitIdea, showCategory: boolean) => (
    <IdeaRow
      key={idea.id}
      idea={idea}
      state={stateOf(idea)}
      showCategory={showCategory}
      query={searching ? q : ''}
      tap={tap}
      onPick={() => onPickIdea(idea)}
      onUnpick={onUnpickIdea}
      onAdd={() => onInstantAdd(idea)}
    />
  );
  const savedRow = (task: SavedIdeaTask) => (
    <SavedRow
      key={task.id}
      task={task}
      picked={task.id === pickedSavedId}
      query={searching ? q : ''}
      tagOf={tagOf}
      tap={tap}
      onPick={() => onPickSaved(task)}
      onUnpick={onUnpickSaved}
    />
  );

  const resultRows = (found: NonNullable<typeof search>) => [
    ...found.savedHits.map(savedRow),
    ...found.ideaHits.map((idea) => ideaRow(idea, true)),
  ];

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div
        className={cn(
          'grid shrink-0 transition-[grid-template-rows,opacity,visibility] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
          compose
            ? 'invisible grid-rows-[0fr] opacity-0'
            : 'visible grid-rows-[1fr] opacity-100',
        )}
      >
      <div className="min-h-0 overflow-hidden">
      <div
        ref={rail.ref}
        {...rail.handlers}
        role="tablist"
        aria-label="Habit ideas"
        className="flex cursor-grab select-none items-center gap-2 overflow-x-auto overscroll-x-none px-3 pb-0.5 pt-3.5 no-scrollbar touch-pan-x active:cursor-grabbing sm:px-5"
        style={{ overscrollBehaviorX: 'none' }}
      >
        {tabs.map((t) => {
          const on = !searching && t.id === activeTab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onPointerDown={(e) => {
                if (e.pointerType !== 'mouse') e.preventDefault();
              }}
              onClick={(e) => {
                const el = e.currentTarget;
                rail.guard(() => selectTab(t.id, el))();
              }}
              className={cn(
                TAB_BASE,
                on ? TAB_ON : TAB_OFF,
              )}
            >
              {t.icon}
              <span className="whitespace-nowrap">{t.label}</span>
            </button>
          );
        })}
      </div>
      </div>
      </div>

      <div
        className={cn(
          'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[28px] transition-[margin] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
          compose ? 'mt-1' : 'mt-3.5',
        )}
      >
        <div
          aria-hidden={compose}
          className={cn(
            'absolute inset-0 flex flex-col transition-[transform,opacity,visibility] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
            sheetClassName,
            compose
              ? 'invisible translate-y-5 opacity-0'
              : 'visible translate-y-0 opacity-100',
          )}
        >
          <div
            ref={listRef}
            role="tabpanel"
            onTouchMove={onListDrag}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-4 no-scrollbar sm:px-5"
            style={{ paddingBottom: bottomPad + 16 }}
          >
            <div
              key={listKey}
              className="grid grid-cols-1 gap-2 animate-in fade-in-0 duration-150 sm:grid-cols-2"
            >
              {showResults && search
                ? resultRows(search)
                : activeTab === 'saved'
                  ? saved.map(savedRow)
                  : tabIdeas.map((idea) => ideaRow(idea, activeTab === 'now'))}
            </div>
            {isDesktop ? null : (
              <div aria-hidden className="h-[env(safe-area-inset-bottom)]" />
            )}
          </div>
        </div>
        {compose && searching && search && (
          <div
            onTouchMove={onListDrag}
            className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-2 no-scrollbar animate-in fade-in-0 duration-150"
          >
            <div className="grid grid-cols-1 gap-2">{resultRows(search)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
