'use client';

import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, Calendar as CalendarIcon, CheckCircle2, EllipsisVertical } from 'lucide-react';
import { format } from 'date-fns';
import { FrogDisplay } from '@/components/ui/FrogDisplay';
import { type FrogHandle } from '@/components/ui/frog';
import HistoryTaskCard from './HistoryTaskCard';
import TaskMenu from '../board/TaskMenu';
import { FilterDropdown, FilterType } from '../ui/FilterDropdown';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';

// Stable variant objects (avoid re-triggering springs on re-render)
const mobileVariants = {
  initial: { y: '100%', opacity: 0, scale: 0.96 },
  animate: { y: 0, opacity: 1, scale: 1 },
  exit: { y: '100%', opacity: 0, scale: 0.96 },
};

const desktopVariants = {
  initial: { opacity: 0, scale: 0.95, y: 0 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 0 },
};

type DayDetailSheetProps = {
  open: boolean;
  onClose: () => void;
  date: string;
  tasks: any[];
  onToggleTask: (id: string, date: string, currentStatus: boolean) => void;
  onDeleteTask?: (id: string, date: string) => void;
  onEditTask?: (id: string, text: string, type?: string) => void;
  frogProps: any; // Props for FrogDisplay
  // Filter Props
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
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
  filter,
  onFilterChange,
  selectedTags,
  onTagsChange,
  showCompleted,
  onShowCompletedChange,
}: DayDetailSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
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

  // Filtering Logic
  const filteredTasks = React.useMemo(() => {
    return tasks.filter((t) => {
      if (!showCompleted && t.completed) return false;
      if (filter === 'tasks' && t.type === 'habit') return false;
      if (filter === 'habits' && t.type !== 'habit') return false;
      if (selectedTags.length > 0) {
        if (!t.tags || !t.tags.some((tagId: string) => selectedTags.includes(tagId))) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, filter, selectedTags, showCompleted]);

  const isFiltered = filter !== 'all' || selectedTags.length > 0 || !showCompleted;

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

  // Responsive Check
  const dragControls = useDragControls();
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const checkDesktop = () =>
      setIsDesktop(window.matchMedia('(min-width: 640px)').matches);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
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
    // If we are marking as COMPLETE (currentStatus is false), trigger animation
    if (!currentStatus) {
      await triggerTongue({
        key: `${date}::${id}`,
        completed: true,
        onPersist: () => onToggleTask(id, date, currentStatus),
      });
    } else {
      // Uncheck immediately
      onToggleTask(id, date, currentStatus);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-md"
          />

          {/* Sheet Container */}
          <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center pointer-events-none p-0 sm:p-6">
            <motion.div
              ref={sheetRef}
              variants={isDesktop ? desktopVariants : mobileVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              drag={!isDesktop && !cinematic ? 'y' : false}
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              dragMomentum={false}
              dragSnapToOrigin
              dragDirectionLock
              onDragEnd={(_e, { offset, velocity }) => {
                if (offset.y > 100 || velocity.y > 500) {
                  onClose();
                }
              }}
              className="pointer-events-auto w-full sm:max-w-lg h-[90vh] sm:h-auto sm:max-h-[85vh] flex flex-col bg-background/95 backdrop-blur-2xl rounded-t-[32px] sm:rounded-[40px] shadow-2xl border-t sm:border border-border/40 overflow-hidden relative"
            >
              {/* Drag Handle (Mobile Only) */}
              {!isDesktop && (
                <div
                  className="absolute top-0 left-0 right-0 h-8 z-50 touch-none flex justify-center items-center"
                  onPointerDown={(e) => dragControls.start(e)}
                >
                  <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full mt-3" />
                </div>
              )}

              {/* Header (Compact) */}
              <div className="flex-shrink-0 px-5 py-3.5 flex items-center justify-between border-b border-border/40 bg-background/20">
                <div>
                  <h2 className="text-xl font-black tracking-tighter flex items-center gap-2 text-foreground">
                    <CalendarIcon className="w-5 h-5 text-primary" />
                    {format(new Date(date), 'MMMM do')}
                  </h2>
                </div>

                <button
                  onClick={onClose}
                  className="p-1.5 bg-muted/50 hover:bg-red-500/10 hover:text-red-500 rounded-full transition-all text-muted-foreground"
                >
                  <X className="w-4 h-4" strokeWidth={3} />
                </button>
              </div>

              {/* Content Scrollable */}
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-hide"
                onScroll={handleScroll}
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

                {/* 2. Tasks Section (Wrapped like a DayColumn) */}
                <div className="flex flex-col rounded-[24px] bg-card/40 border border-border/50 shadow-sm overflow-hidden">
                  {/* Column Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-500">
                        <CheckCircle2 size={16} />
                      </div>
                      <span className="text-sm font-black tracking-tight text-foreground uppercase">
                        {completedCount} / {totalCount}
                      </span>
                    </div>

                    <div className="relative" ref={filterMenuRef}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowFilterMenu(!showFilterMenu);
                        }}
                        className={cn(
                          'flex items-center justify-center w-7 h-7 rounded-xl transition-all active:scale-90',
                          showFilterMenu || isFiltered
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <EllipsisVertical size={16} />
                        {isFiltered && (
                          <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border-2 border-background shadow-sm" />
                        )}
                      </button>

                      <FilterDropdown
                        isOpen={showFilterMenu}
                        onClose={() => setShowFilterMenu(false)}
                        triggerRef={filterMenuRef}
                        filter={filter}
                        onFilterChange={onFilterChange}
                        availableTags={userTags}
                        selectedTags={selectedTags}
                        onTagsChange={onTagsChange}
                        showCompleted={showCompleted}
                        onShowCompletedChange={onShowCompletedChange}
                      />
                    </div>
                  </div>

                  {/* Tasks List Area */}
                  <div className="p-2 space-y-1 pb-4 min-h-[120px]">
                    {filteredTasks.length === 0 ? (
                      <div className="text-center py-8 px-4 text-muted-foreground bg-muted/5 rounded-2xl border border-dashed border-border/40">
                        <p className="font-bold text-sm">
                          {isFiltered ? 'No matches found.' : 'No tasks for this day.'}
                        </p>
                      </div>
                    ) : (
                      filteredTasks.map((task) => {
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
                      })
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

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
      )}
    </AnimatePresence>,
    document.body,
  );
}
