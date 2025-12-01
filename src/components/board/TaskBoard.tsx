'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Task,
  DAYS,
  todayDisplayIndex,
  type DisplayDay,
  type ApiDay,
} from './helpers';
import DayColumn from './DayColumn';
import TaskList from './TaskList';
import PaginationDots from './PaginationDots';
import DragOverlay from './DragOverlay';
import { useDragManager } from './hooks/useDragManager';
import { usePan } from './hooks/usePan';
import QuickAddSheet from '@/components/ui/QuickAddSheet';
import Fly from '../ui/fly';
import { AddTaskButton } from '../ui/AddTaskButton';
import BacklogBox from './BacklogBox';
import BacklogTray from './BacklogTray';

type RepeatChoice = 'this-week' | 'weekly';

export default function TaskBoard({
  titles,
  week,
  setWeek,
  saveDay,
  removeTask,
  onRequestAdd,
  onQuickAdd,
}: {
  titles: string[];
  week: Task[][];
  setWeek: React.Dispatch<React.SetStateAction<Task[][]>>;
  saveDay: (day: DisplayDay, tasks: Task[]) => Promise<void>;
  removeTask: (day: DisplayDay, id: string) => Promise<void>;
  onRequestAdd: (
    day: DisplayDay | null,
    text?: string,
    afterIndex?: number | null,
    repeat?: RepeatChoice
  ) => void;
  onQuickAdd?: (data: {
    text: string;
    days: ApiDay[];
    repeat: RepeatChoice;
  }) => Promise<void> | void;
}) {
  const pathname = usePathname();
  const {
    scrollerRef,
    setSlideRef,
    setListRef,
    setCardRef,
    drag,
    targetDay,
    targetIndex,
    onGrab,
    endDrag,
    cancelDrag,
  } = useDragManager();

  useEffect(() => {
    cancelDrag();
  }, [pathname, cancelDrag]);

  const [pageIndex, setPageIndex] = useState<DisplayDay>(
    todayDisplayIndex() as DisplayDay
  );
  const recomputeCanPanRef = useRef<() => void>();

  // Backlog State
  const [backlogOpen, setBacklogOpen] = useState(false);
  const backlogBoxRef = useRef<HTMLDivElement>(null);
  const backlogTrayRef = useRef<HTMLDivElement>(null);
  const [isDragOverBacklog, setIsDragOverBacklog] = useState(false);
  const [backlogProximity, setBacklogProximity] = useState(0); // 0..1
  const [trayCloseProgress, setTrayCloseProgress] = useState(0); // 0..1 (0=open, 1=closed)

  const centerColumnSmooth = (day: DisplayDay) => {
    const s = scrollerRef.current;
    // If we target day 7 (backlog) but it's not in the DOM columns, do nothing or snap to end
    if (day >= DAYS - 1) return;
    
    const col = (document.querySelectorAll('[data-col="true"]')[day] ??
      null) as HTMLElement | null;
    if (!s || !col) return;
    s.scrollTo({
      left: col.offsetLeft - (s.clientWidth - col.clientWidth) / 2,
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    const s = scrollerRef.current;
    const t = todayDisplayIndex() as DisplayDay;
    const col = (document.querySelectorAll('[data-col="true"]')[t] ??
      null) as HTMLElement | null;
    if (!s || !col) return;
    s.scrollTo({
      left: col.offsetLeft - (s.clientWidth - col.clientWidth) / 2,
      // @ts-ignore
      behavior: 'instant',
    });
    setPageIndex(t);
    recomputeCanPanRef.current?.();
  }, []);

  useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;
    const handler = () => {
      const cols = Array.from(
        document.querySelectorAll<HTMLElement>('[data-col="true"]')
      );
      const idx = cols.findIndex((col) => {
        const colCenter = col.offsetLeft + col.clientWidth / 2;
        const scrollCenter = s.scrollLeft + s.clientWidth / 2;
        return Math.abs(colCenter - scrollCenter) < col.clientWidth / 2;
      });
      if (idx >= 0) setPageIndex(idx as DisplayDay);
    };
    s.addEventListener('scroll', handler, { passive: true });
    return () => s.removeEventListener('scroll', handler);
  }, []);

  const { panActive, startPanIfEligible, onPanMove, endPan, recomputeCanPan } =
    usePan(scrollerRef);
  recomputeCanPanRef.current = recomputeCanPan;

  const snapSuppressed = !!drag?.active || panActive;

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickText, setQuickText] = useState('');

  // Derived state for masking targetDay (Placeholder Suppression)
  let effectiveTargetDay = targetDay;
  if (drag?.active && backlogOpen && backlogTrayRef.current) {
     // If dragging within the visual bounds of the tray, suppress column placeholders
     // The tray might be animating down (trayCloseProgress > 0).
     // We consider it "covering" if we are below its current visual top.
     
     const trayHeight = backlogTrayRef.current.offsetHeight;
     // Calculate visual top based on close progress (0=open, 1=closed/down)
     const visualTrayTop = window.innerHeight - (trayHeight * (1 - trayCloseProgress));
     
     if (drag.y > visualTrayTop) {
        effectiveTargetDay = null;
     }
  }

  // Detect drag over backlog box
  useEffect(() => {
    // 1. Handle Tray Animation (Dragging FROM backlog)
    if (drag?.active && backlogOpen && drag.fromDay === 7 && backlogTrayRef.current) {
        const trayRect = backlogTrayRef.current.getBoundingClientRect();
        const trayTop = trayRect.top;
        
        // Threshold: Start closing when above trayTop. Fully closed after 150px.
        const EXIT_DIST = 200;
        if (drag.y < trayTop) {
            const distOut = trayTop - drag.y;
            const progress = Math.min(1, distOut / EXIT_DIST);
            setTrayCloseProgress(progress);
        } else {
            setTrayCloseProgress(0);
        }
        // Don't return here, we might still want proximity logic if we drag back near the box? 
        // Actually, if tray is open, box proximity is less relevant, or maybe we want it to highlight if we drop back "into" the button?
        // For simplicity, let's prioritize tray animation.
        setIsDragOverBacklog(false); 
        setBacklogProximity(0);
        return;
    } 
    
    // Reset tray progress if not dragging from backlog
    setTrayCloseProgress(0);


    // 2. Handle Box Proximity (Dragging TO backlog)
    if (!drag?.active || !backlogBoxRef.current) {
      setIsDragOverBacklog(false);
      setBacklogProximity(0);
      return;
    }

    const r = backlogBoxRef.current.getBoundingClientRect();
    
    // 1. Hit Test (Strict)
    const hit =
      drag.x >= r.left &&
      drag.x <= r.right &&
      drag.y >= r.top &&
      drag.y <= r.bottom;
    setIsDragOverBacklog(hit);

    // 2. Proximity Calculation
    // Center of the box
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Distance from pointer to center
    const dist = Math.hypot(drag.x - cx, drag.y - cy);
    
    // Radius of influence (e.g., 200px)
    const MAX_DIST = 200;
    // Normalize 0..1 (1 is closest)
    const prox = Math.max(0, 1 - dist / MAX_DIST);
    setBacklogProximity(prox);

  }, [drag?.x, drag?.y, drag?.active, backlogOpen, drag?.fromDay]);

  const commitDragReorder = useCallback(
    (toDay: DisplayDay, toIndex: number) => {
      if (!drag) return;
      const sameSpot = drag.fromDay === toDay && drag.fromIndex === toIndex;
      if (sameSpot) return;

      setWeek((prev) => {
        const next = prev.map((d) => d.slice());
        
        // Remove from source
        const [moved] = next[drag.fromDay].splice(drag.fromIndex, 1);
        
        // Insert into dest
        let insertIndex = toIndex;
        // Fix index if moving within same list downwards
        if (drag.fromDay === toDay && drag.fromIndex < toIndex) {
          insertIndex = Math.max(0, toIndex - 1);
        }
        
        // Safety for backlog array
        if (!next[toDay]) next[toDay] = [];
        
        next[toDay].splice(Math.min(insertIndex, next[toDay].length), 0, moved);

        // If moved to backlog, update type
        if (toDay === 7) {
            moved.type = 'backlog';
        } else if (drag.fromDay === 7) {
            // If moved FROM backlog, revert to regular (unless it was weekly, but let's assume regular for now)
            if (moved.type === 'backlog') moved.type = 'regular';
        }

        Promise.all(
          drag.fromDay === toDay
            ? [saveDay(toDay, next[toDay])]
            : [
                saveDay(drag.fromDay as DisplayDay, next[drag.fromDay]),
                saveDay(toDay, next[toDay]),
              ]
        ).catch(() => {});
        return next;
      });
    },
    [drag, saveDay, setWeek]
  );

  const onDrop = useCallback(() => {
    if (!drag) return;

    // Check Backlog Drop
    let finalToDay = (targetDay ?? drag.fromDay) as DisplayDay;
    let finalToIndex = targetIndex ?? drag.fromIndex;

    // 1. If hovering the box, force drop to backlog (Index 7)
    if (isDragOverBacklog) {
        finalToDay = 7 as DisplayDay;
        finalToIndex = week[7]?.length || 0; // Append to end
    } 
    // 2. If hovering the tray (while open), force drop to backlog to avoid "ghost drop" onto background column
    //    BUT only if we haven't dragged it "out" (trayCloseProgress < 1)
    else if (backlogOpen && backlogTrayRef.current && trayCloseProgress < 0.9) {
        const tr = backlogTrayRef.current.getBoundingClientRect();
        // Only capture if we are physically over the tray (or what's left of it)
        // Although with the animation, the tray moves down. 
        // But conceptually, if the user is dragging "out", we want them to hit the columns.
        if (
            drag.x >= tr.left &&
            drag.x <= tr.right &&
            drag.y >= tr.top &&
            drag.y <= tr.bottom
        ) {
            finalToDay = 7 as DisplayDay;
            if (drag.fromDay === 7) {
                finalToIndex = drag.fromIndex;
            } else {
                finalToIndex = week[7]?.length || 0;
            }
        }
    }
    // 3. If we dragged it OUT of the tray (trayCloseProgress >= 0.9), we implicitly "close" the tray logic for this drop.
    //    So we let it fall through to the calculated `finalToDay` (which is based on column geometry).
    
    // If we dropped effectively "outside" (which means valid column drop), we should also close the backlog UI
    if (backlogOpen && finalToDay !== 7) {
        setBacklogOpen(false);
    }

    // 1. Commit changes first
    if (finalToDay < 7) {
        centerColumnSmooth(finalToDay);
    }
    commitDragReorder(finalToDay, finalToIndex);

    // 2. End drag
    endDrag();
    setIsDragOverBacklog(false);
    setTrayCloseProgress(0); // Reset
  }, [
    drag,
    targetDay,
    targetIndex,
    isDragOverBacklog,
    week,
    backlogOpen, 
    trayCloseProgress, // Added dependency
    commitDragReorder,
    endDrag,
  ]);

  useEffect(() => {
    if (!drag?.active) return;
    const handleUp = () => onDrop();
    window.addEventListener('pointerup', handleUp, { passive: true });
    window.addEventListener('touchend', handleUp as any, { passive: true });
    return () => {
      window.removeEventListener('pointerup', handleUp as any);
      window.removeEventListener('touchend', handleUp as any);
    };
  }, [drag, onDrop]);

  return (
    <div className="relative w-full h-full">
      {/* SCROLLER */}
      <div
        ref={scrollerRef}
        dir="ltr"
        data-role="board-scroller"
        data-drag={drag?.active ? '1' : '0'}
        onPointerDown={startPanIfEligible}
        onPointerMove={onPanMove}
        onPointerUp={endPan}
        className={[
          'no-scrollbar absolute inset-0 w-full h-full',
          'flex flex-col items-start overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x', // 🟢 Added items-start
          snapSuppressed ? 'snap-none' : 'snap-x snap-mandatory scroll-smooth',
        ].join(' ')}
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: snapSuppressed ? 'auto' : undefined,
        }}
      >
        <div className="flex mx-auto gap-3 px-4 pt-4 md:px-6 md:pt-6 lg:pt-8 pb-[220px] sm:pb-[180px] md:pb-[188px]">
          {/* Render only 0..6 (Exclude Backlog Column 7) */}
          {Array.from({ length: DAYS - 1 }, (_, day) => ({
            day: day as DisplayDay,
            key: `day-${day}`,
          })).map(({ day, key }) => (
            <div
              key={key}
              ref={setSlideRef(day)}
              data-col="true"
              className="shrink-0 snap-center w-[88vw] sm:w-[360px] md:w-[330px] lg:w-[310px] xl:w-[292px] h-full"
            >
              <DayColumn
                title={titles[day]}
                listRef={setListRef(day)}
                maxHeightClass="max-h-[73svh]"
              >
                <TaskList
                  day={day}
                  items={week[day]}
                  drag={drag}
                  targetDay={effectiveTargetDay as DisplayDay | null}
                  targetIndex={targetIndex}
                  removeTask={removeTask}
                  onGrab={onGrab}
                  setCardRef={setCardRef}
                />
              </DayColumn>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination - Only show dots for actual days */}
      <div
        className="absolute left-0 right-0 z-[60] flex justify-center pointer-events-none bottom-[calc(env(safe-area-inset-bottom)+176px)] md:bottom-[calc(env(safe-area-inset-bottom)+112px)]"
      >
        <div className="pointer-events-auto">
          <PaginationDots count={DAYS - 1} activeIndex={Math.min(pageIndex, 6) as any} />
        </div>
      </div>

      {/* GLOBAL BOTTOM AREA - Floating Toolbar */}
      <div className="absolute bottom-0 left-0 right-0 z-[40] px-4 sm:px-6 pb-[calc(env(safe-area-inset-bottom)+84px)] md:pb-[calc(env(safe-area-inset-bottom)+20px)] pointer-events-none">
        <div className="pointer-events-auto mx-auto w-full max-w-[400px] flex items-center gap-3">
          
          {/* Backlog Trigger (Left) */}
          <div className="shrink-0">
             <BacklogBox
                count={week[7]?.length || 0}
                isDragOver={isDragOverBacklog}
                isDragging={!!drag?.active}
                proximity={backlogProximity}
                onClick={() => setBacklogOpen(true)}
                forwardRef={backlogBoxRef}
             />
          </div>

          {/* Add Task Button (Main) */}
          <div className="flex-1 min-w-0">
             <div className="rounded-full bg-white/80 dark:bg-slate-900/70 backdrop-blur-2xl ring-1 ring-slate-200/80 dark:ring-slate-700/60 shadow-[0_8px_32px_rgba(0,0,0,.18)] p-1">
                <AddTaskButton
                  onClick={() => {
                    setQuickText('');
                    setShowQuickAdd(true);
                  }}
                  disabled={!!drag?.active}
                />
             </div>
          </div>

        </div>
      </div>

      {/* Backlog Tray Overlay */}
      <BacklogTray
        isOpen={backlogOpen}
        onClose={() => setBacklogOpen(false)}
        tasks={week[7] || []}
        onGrab={onGrab}
        setCardRef={setCardRef}
        drag={drag}
        trayRef={backlogTrayRef}
        closeProgress={trayCloseProgress}
      />

      <QuickAddSheet
        open={showQuickAdd}
        onOpenChange={setShowQuickAdd}
        initialText={quickText}
        defaultRepeat="this-week"
        onSubmit={async ({ text, days, repeat }) => {
          if (onQuickAdd) {
            await onQuickAdd({
              text,
              days,
              repeat: repeat as RepeatChoice,
            });
          } else {
            onRequestAdd(null, text, null, repeat as RepeatChoice);
          }
          setShowQuickAdd(false);
        }}
      />

      {/* Drag overlay - Rendered LAST to ensure top z-index */}
      {drag?.active && (
        <DragOverlay
          x={drag.x}
          y={drag.y}
          dx={drag.dx}
          dy={drag.dy}
          width={drag.width}
          height={drag.height}
          text={drag.taskText}
        />
      )}

      <style jsx global>{`
        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }

        html.dragging,
        html.dragging body {
          touch-action: none !important;
          overscroll-behavior: none !important;
          overflow: hidden !important;
          user-select: none !important;
          -webkit-user-select: none !important;
        }

        html.dragging [data-role='board-scroller'] {
          touch-action: none !important;
          overflow: hidden !important;
          scroll-snap-type: none !important;
          overscroll-behavior: none !important;
        }

        html.dragging [data-card-id] {
          touch-action: none !important;
        }
      `}</style>
    </div>
  );
}
