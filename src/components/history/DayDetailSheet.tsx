'use client';

import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar as CalendarIcon, CalendarCheck, CalendarClock, EllipsisVertical, LayoutDashboard } from 'lucide-react';
import { format } from 'date-fns';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { type FrogHandle } from '@/components/ui/frog';
import HistoryTaskCard from './HistoryTaskCard';
import TaskMenu from '../board/TaskMenu';
import { FilterDropdown } from '../ui/FilterDropdown';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { BaseSheet } from '@/components/ui/BaseSheet';

type DayDetailSheetProps = {
  open: boolean;
  onClose: () => void;
  date: string;
  tasks: any[];
  onToggleTask: (id: string, date: string, currentStatus: boolean) => void;
  onDeleteTask?: (id: string, date: string) => void;
  onEditTask?: (id: string, text: string, type?: string) => void;
  frogProps: any;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  showCompleted: boolean;
  onShowCompletedChange: (show: boolean) => void;
};

export default function DayDetailSheet({
  open,
  onClose,
  date,
  tasks,
  onToggleTask,
  onDeleteTask,
  onEditTask,
  frogProps,
  selectedTags,
  onTagsChange,
  showCompleted,
  onShowCompletedChange,
}: DayDetailSheetProps) {
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'tasks' | 'habits'>('all');
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const frogRef = useRef<FrogHandle>(null);
  const frogBoxRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const handleToggleMenu = (taskId: string, anchor: DOMRect) => {
    if (menu?.id === taskId) {
      setMenu(null);
    } else {
      setMenu({ id: taskId, top: anchor.bottom + window.scrollY, left: anchor.left + window.scrollX });
    }
  };

  // Close menu when sheet scrolls
  const handleScroll = () => {
    if (menu) setMenu(null);
    if (showFilterMenu) setShowFilterMenu(false);
  };

  // Split tasks by type
  const regularTasks = React.useMemo(() => tasks.filter((t) => t.type !== 'habit'), [tasks]);
  const habitTasks = React.useMemo(() => tasks.filter((t) => t.type === 'habit'), [tasks]);

  // Filtering Logic
  const filteredRegular = React.useMemo(() => {
    return regularTasks.filter((t) => {
      if (!showCompleted && t.completed) return false;
      if (selectedTags.length > 0) {
        if (!t.tags || !t.tags.some((tagId: string) => selectedTags.includes(tagId))) return false;
      }
      return true;
    });
  }, [regularTasks, selectedTags, showCompleted]);

  const filteredHabits = React.useMemo(() => {
    return habitTasks.filter((t) => {
      if (!showCompleted && t.completed) return false;
      if (selectedTags.length > 0) {
        if (!t.tags || !t.tags.some((tagId: string) => selectedTags.includes(tagId))) return false;
      }
      return true;
    });
  }, [habitTasks, selectedTags, showCompleted]);

  // Split into active and completed
  const activeRegular = React.useMemo(() => filteredRegular.filter((t) => !t.completed), [filteredRegular]);
  const completedRegular = React.useMemo(() => filteredRegular.filter((t) => t.completed), [filteredRegular]);
  const activeHabits = React.useMemo(() => filteredHabits.filter((t) => !t.completed), [filteredHabits]);
  const completedHabitsFiltered = React.useMemo(() => filteredHabits.filter((t) => t.completed), [filteredHabits]);
  const visibleRegularCount = showCompleted ? regularTasks.length : regularTasks.filter((t) => !t.completed).length;
  const visibleHabitCount = showCompleted ? habitTasks.length : habitTasks.filter((t) => !t.completed).length;
  const visibleAllCount = visibleRegularCount + visibleHabitCount;

  const isFiltered = selectedTags.length > 0 || !showCompleted;

  // Animation State
  const flyRefs = useRef<Record<string, HTMLElement | null>>({});
  const {
    vp,
    cinematic,
    grab,
    tipGroupEl,
    tonguePathEl,
    triggerTongue,
    visuallyDone,
  } = useFrogTongue({ frogRef, frogBoxRef, flyRefs, scrollContainerRef });

  // Need to get tag data for tasks
  const { data: tagsData } = useSWR('/api/tags', (url) =>
    fetch(url).then((r) => r.json()),
  );
  const userTags = tagsData?.tags || [];

  // Manage wardrobe locally if needed in popup, or passed down
  const { indices } = useWardrobeIndices(true);

  useEffect(() => {
    if (open) {
      setActiveTab('all');
    }
  }, [open]);

  // Block scrolling inside the popup during cinematic tongue animation
  useEffect(() => {
    if (!cinematic) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    el.addEventListener('touchmove', stop, { passive: false });
    return () => {
      el.removeEventListener('wheel', stop as any);
      el.removeEventListener('touchmove', stop as any);
    };
  }, [cinematic]);

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const completionRate =
    totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const handleToggleProxy = async (
    id: string,
    date: string,
    currentStatus: boolean,
  ) => {
    if (!currentStatus) {
      await triggerTongue({
        key: `${date}::${id}`,
        completed: true,
        onPersist: () => onToggleTask(id, date, currentStatus),
      });
    } else {
      onToggleTask(id, date, currentStatus);
    }
  };

  const renderHistoryCard = (task: any) => {
    const uniqueKey = `${date}::${task.id}`;
    return (
      <HistoryTaskCard
        key={uniqueKey}
        id={task.id}
        text={task.text}
        completed={task.completed}
        type={task.type}
        tags={task.tags}
        date={date}
        completedDates={task.completedDates}
        timesPerWeek={task.timesPerWeek}
        frogodoroSession={task.frogodoroSession}
        onToggle={handleToggleProxy}
        setFlyRef={(el) => {
          if (el) flyRefs.current[uniqueKey] = el;
          else delete flyRefs.current[uniqueKey];
        }}
        isEaten={visuallyDone?.has(uniqueKey)}
        userTags={userTags}
      />
    );
  };

  const renderCompletedDivider = () => (
    <div className="flex items-center gap-3 px-3 py-1.5 mt-1">
      <div className="flex-1 h-px bg-border/50" />
      <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider select-none">
        Completed
      </span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  );

  const renderHistorySection = ({
    title,
    icon,
    activeItems,
    completedItems,
    filteredItems,
    emptyText,
    showHeader = false,
  }: {
    title: string;
    icon: React.ReactNode;
    activeItems: any[];
    completedItems: any[];
    filteredItems: any[];
    emptyText: string;
    showHeader?: boolean;
  }) => (
    <div className={showHeader && filteredItems.length > 0 ? 'space-y-2' : ''}>
      {showHeader && filteredItems.length > 0 && (
        <HistorySectionHeader
          icon={icon}
          title={title}
          count={filteredItems.length}
          detail={showCompleted ? 'visible' : 'left'}
        />
      )}
      <div className="flex flex-col rounded-[22px] bg-card/40 border border-border/50 shadow-sm overflow-hidden">
        <div className="p-1.5 space-y-1 pb-2 min-h-[80px]">
          {filteredItems.length === 0 ? (
            <div className="text-center py-6 px-4 text-muted-foreground bg-muted/5 rounded-2xl border border-dashed border-border/40">
              <p className="font-bold text-sm">
                {isFiltered ? 'No matches found.' : emptyText}
              </p>
            </div>
          ) : (
            <>
              {activeItems.map(renderHistoryCard)}
              {showCompleted && completedItems.length > 0 && (
                <>
                  {activeItems.length > 0 && renderCompletedDivider()}
                  {completedItems.map(renderHistoryCard)}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <BaseSheet
        open={open}
        onOpenChange={(v) => !v && onClose()}
        className="h-[90vh] sm:h-auto sm:max-h-[85vh] sm:max-w-lg bg-background"
        zIndex={1000}
      >
        {({ isDesktop, dragControls }) => {
          const handleSheetDrag = (e: React.PointerEvent, scrollEl: HTMLDivElement | null) => {
            if (isDesktop || !scrollEl || cinematic) return;
            if (scrollEl.scrollTop <= 0 && e.nativeEvent instanceof PointerEvent) {
              dragControls.start(e);
            }
          };

          return (
            <div ref={sheetRef} className="flex flex-col h-full relative">
              {/* Header */}
              <div
                onPointerDown={(e) => !isDesktop && !cinematic && dragControls.start(e)}
                className="px-4 py-4 md:px-6 border-b border-border/50 shrink-0 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-primary/10 shrink-0">
                    <CalendarIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-black tracking-tight text-foreground uppercase leading-none">
                      {format(new Date(date), 'MMMM do')}
                    </h2>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5 opacity-70">
                      {format(new Date(date), 'EEEE')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground transition-all active:scale-95 shrink-0"
                >
                  <X className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>

              {/* Content Scrollable */}
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto p-3 pb-14 space-y-4 scrollbar-hide overscroll-none"
                onScroll={handleScroll}
                onPointerDown={(e) => handleSheetDrag(e, e.currentTarget)}
                style={{ pointerEvents: cinematic ? 'none' : 'auto' }}
              >
                {/* 1. Frog Display Section */}
                <div className="flex justify-center pb-0 border-b border-border/40 border-dashed">
                  <div className="scale-100 transform-origin-center">
                    <FrogDisplay
                      {...frogProps}
                      frogRef={frogRef}
                      frogBoxRef={frogBoxRef}
                      indices={indices}
                      rate={completionRate}
                      done={completedCount}
                      total={totalCount}
                      openWardrobe={wardrobeOpen}
                      onOpenChange={setWardrobeOpen}
                      mouthOpen={!!grab} // Open mouth when grabbing
                      mouthOffset={{ y: -4 }}
                    />
                  </div>
                </div>

                {/* 2. Tab Bar (matches home page design) */}
                <div className="flex items-center w-full p-0.5 rounded-[16px] bg-card/80 backdrop-blur-2xl border border-border/50 shadow-sm relative">
                  <button
                    onClick={() => setActiveTab('all')}
                    className={cn(
                      'flex-1 justify-center relative px-2.5 py-2 text-[10px] font-black uppercase rounded-[11px] transition-all flex items-center gap-2 whitespace-nowrap',
                      activeTab === 'all'
                        ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                    )}
                  >
                    <LayoutDashboard className={cn('w-3.5 h-3.5', activeTab === 'all' ? 'text-primary' : 'text-muted-foreground')} />
                    All
                    {visibleAllCount > 0 && (
                      <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black leading-none text-white shadow-sm">
                        {visibleAllCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('tasks')}
                    className={cn(
                      'flex-1 justify-center relative px-2.5 py-2 text-[10px] font-black uppercase rounded-[11px] transition-all flex items-center gap-2 whitespace-nowrap',
                      activeTab === 'tasks'
                        ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                    )}
                  >
                    <CalendarCheck className={cn('w-3.5 h-3.5', activeTab === 'tasks' ? 'text-primary' : 'text-muted-foreground')} />
                    Tasks
                    {visibleRegularCount > 0 && (
                      <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black leading-none text-white shadow-sm">
                        {visibleRegularCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab('habits')}
                    className={cn(
                      'flex-1 justify-center relative px-2.5 py-2 text-[10px] font-black uppercase rounded-[11px] transition-all flex items-center gap-2 whitespace-nowrap',
                      activeTab === 'habits'
                        ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                    )}
                  >
                    <CalendarClock className={cn('w-3.5 h-3.5', activeTab === 'habits' ? 'text-primary' : 'text-muted-foreground')} />
                    Habits
                    {visibleHabitCount > 0 && (
                      <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black leading-none text-white shadow-sm">
                        {visibleHabitCount}
                      </span>
                    )}
                  </button>

                  <div className="w-[1px] h-5 bg-border/50 mx-0.5" />

                  <div className="relative" ref={filterMenuRef}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowFilterMenu(!showFilterMenu);
                      }}
                      className={cn(
                        'relative p-1.5 rounded-full transition-colors',
                        showFilterMenu || isFiltered
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                      )}
                    >
                      <EllipsisVertical className="w-[18px] h-[18px]" />
                      {isFiltered && (
                        <div className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-emerald-500 border-2 border-card shadow-sm" />
                      )}
                    </button>

                    <FilterDropdown
                      isOpen={showFilterMenu}
                      onClose={() => setShowFilterMenu(false)}
                      triggerRef={filterMenuRef}
                      showTypeFilters={false}
                      availableTags={userTags}
                      selectedTags={selectedTags}
                      onTagsChange={onTagsChange}
                      showCompleted={showCompleted}
                      onShowCompletedChange={onShowCompletedChange}
                    />
                  </div>
                </div>

                <div className={activeTab === 'all' ? 'space-y-2' : 'hidden'}>
                  {habitTasks.length > 0 &&
                    renderHistorySection({
                      title: 'Habits',
                      icon: <CalendarClock className="w-3.5 h-3.5" />,
                      activeItems: activeHabits,
                      completedItems: completedHabitsFiltered,
                      filteredItems: filteredHabits,
                      emptyText: 'No habits for this day.',
                      showHeader: filteredHabits.length > 0,
                    })}
                  {(regularTasks.length > 0 || habitTasks.length === 0) &&
                    renderHistorySection({
                      title: 'Tasks',
                      icon: <CalendarCheck className="w-3.5 h-3.5" />,
                      activeItems: activeRegular,
                      completedItems: completedRegular,
                      filteredItems: filteredRegular,
                      emptyText: 'No tasks for this day.',
                      showHeader: filteredHabits.length > 0 && filteredRegular.length > 0,
                    })}
                </div>

                <div className={activeTab === 'tasks' ? '' : 'hidden'}>
                  {renderHistorySection({
                    title: 'Tasks',
                    icon: <CalendarCheck className="w-3.5 h-3.5" />,
                    activeItems: activeRegular,
                    completedItems: completedRegular,
                    filteredItems: filteredRegular,
                    emptyText: 'No tasks for this day.',
                  })}
                </div>

                <div className={activeTab === 'habits' ? '' : 'hidden'}>
                  {renderHistorySection({
                    title: 'Habits',
                    icon: <CalendarClock className="w-3.5 h-3.5" />,
                    activeItems: activeHabits,
                    completedItems: completedHabitsFiltered,
                    filteredItems: filteredHabits,
                    emptyText: 'No habits for this day.',
                  })}
                </div>
              </div>
            </div>
          );
        }}
      </BaseSheet>

      {/* SVG Tongue Overlay (Z-index high to overlap sheet) */}
      {grab && (() => {
        const sr = sheetRef.current?.getBoundingClientRect();
        const cr = scrollContainerRef.current?.getBoundingClientRect();
        const clipTop = cr ? cr.top : (sr?.top ?? 0);
        const clip = sr
          ? `inset(${clipTop}px ${window.innerWidth - sr.right}px ${window.innerHeight - sr.bottom}px ${sr.left}px round 0 0 32px 32px)`
          : undefined;
        return (
        <svg
          key={grab.startAt}
          className="fixed inset-0 z-[1100] pointer-events-none"
          width={vp.w}
          height={vp.h}
          viewBox={`0 0 ${vp.w} ${vp.h}`}
          preserveAspectRatio="none"
          style={{ width: vp.w, height: vp.h, clipPath: clip }}
        >
          <defs>
            <linearGradient
              id="tongue-grad-history"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop stopColor="#ff6b6b" />
              <stop offset="1" stopColor="#f43f5e" />
            </linearGradient>
          </defs>
          <path
            ref={tonguePathEl}
            d="M0 0 L0 0"
            fill="none"
            stroke="url(#tongue-grad-history)"
            strokeWidth={TONGUE_STROKE}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <g ref={tipGroupEl} style={{ visibility: 'hidden' }}>
            <circle r={10} fill="transparent" />
            <image
              href="/fly.svg"
              x={-24 / 2}
              y={-24 / 2}
              width={24}
              height={24}
            />
          </g>
        </svg>
        );
      })()}
    </>
  );
}

function HistorySectionHeader({
  icon,
  title,
  count,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 pt-1 pb-0">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border/60 shadow-sm text-primary">
          {icon}
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.16em]">
          {title}
        </span>
      </div>
      <span className="text-[10px] font-bold text-muted-foreground/70">
        {count} {detail}
      </span>
    </div>
  );
}
