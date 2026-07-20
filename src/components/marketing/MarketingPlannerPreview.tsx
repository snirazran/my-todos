'use client';

import { useCallback, useEffect, useState } from 'react';
import { GripVertical } from 'lucide-react';
import DayColumn from '@/components/board/DayColumn';
import TaskCard from '@/components/board/TaskCard';
import BoardDragOverlay from '@/components/board/DragOverlay';
import { useDragManager, type DragState } from '@/components/board/hooks/useDragManager';
import { usePan } from '@/components/board/hooks/usePan';
import type { Task } from '@/components/board/helpers';

type PlannerDay = {
  id: string;
  title: string;
  isToday?: boolean;
  tasks: Task[];
};

const userTags = [
  { id: 'productive', name: 'Productivite', color: '#6366f1' },
  { id: 'fitness', name: 'Fitness', color: '#4d9850' },
  { id: 'mindfulness', name: 'Mindfulness', color: '#a855f7' },
];

const initialDays: PlannerDay[] = [
  {
    id: 'mon',
    title: 'Monday 7/20',
    isToday: true,
    tasks: [
      { id: 'walk', text: 'Walk outside for 10 minutes', order: 0, tags: ['fitness'], startTime: '08:00', repeatMode: 'daily', streak: 5 },
      { id: 'email', text: 'Reply to the email I’ve been avoiding', order: 1, tags: ['productive'], startTime: '09:30', completed: true },
    ],
  },
  {
    id: 'tue',
    title: 'Tuesday 7/21',
    tasks: [
      { id: 'first-paragraph', text: 'Draft the first paragraph', order: 0, tags: ['productive'], startTime: '10:00', frogodoroSession: { date: '2026-07-21', focusTime: 1500, breakTime: 300 } },
      { id: 'dentist', text: 'Book the dentist appointment', order: 1, tags: ['productive'], startTime: '15:30' },
    ],
  },
  {
    id: 'wed',
    title: 'Wednesday 7/22',
    tasks: [
      { id: 'breathe', text: 'Take 10 quiet minutes', order: 0, tags: ['mindfulness'], startTime: '07:30', repeatMode: 'daily', streak: 3 },
      { id: 'read', text: 'Read 10 pages', order: 1, tags: ['mindfulness'], startTime: '20:00' },
    ],
  },
  {
    id: 'thu',
    title: 'Thursday 7/23',
    tasks: [
      { id: 'kitchen-counter', text: 'Clear the kitchen counter', order: 0, tags: ['productive'], startTime: '16:00' },
      { id: 'gym', text: 'Move for 30 minutes', order: 1, tags: ['fitness'], startTime: '18:30', repeatMode: 'weekly', streak: 2 },
    ],
  },
];

type DragManager = ReturnType<typeof useDragManager>;

function RealTaskPreview({
  task,
  dayIndex,
  taskIndex,
  dragging,
  isToday,
  onGrab,
  setCardRef,
}: {
  task: Task;
  dayIndex: number;
  taskIndex: number;
  dragging: boolean;
  isToday: boolean;
  onGrab: DragManager['onGrab'];
  setCardRef: DragManager['setCardRef'];
}) {
  const dragId = `marketing-${task.id}`;

  return (
    <TaskCard
      innerRef={(element) => setCardRef(dragId, element)}
      dragId={dragId}
      task={task}
      occurrenceDate="2026-07-20"
      menuOpen={false}
      onToggleMenu={() => undefined}
      onGrab={(payload) => {
        const tags = task.tags
          ?.map((tagId) => userTags.find((tag) => tag.id === tagId))
          .filter((tag): tag is (typeof userTags)[number] => !!tag);
        onGrab({
          day: dayIndex,
          index: taskIndex,
          taskId: task.id,
          taskText: task.text,
          taskType: task.type,
          clientX: payload.clientX,
          clientY: payload.clientY,
          rectGetter: () =>
            document.querySelector<HTMLElement>(`[data-card-id="${dragId}"]`)?.getBoundingClientRect() ??
            new DOMRect(payload.clientX - 1, payload.clientY - 1, 1, 1),
          tags,
          calendarEventId: task.calendarEventId,
          startTime: task.startTime,
          endTime: task.endTime,
          reminder: task.reminder,
          notes: task.notes,
          checklist: task.checklist,
          frogodoroSession: task.frogodoroSession,
        });
      }}
      hiddenWhileDragging={false}
      isRepeating={task.repeatMode !== undefined && task.repeatMode !== 'none'}
      userTags={userTags}
      isAnyDragging={dragging}
      compact
      onTap={() => undefined}
      onToggleComplete={() => undefined}
      showStreak
      isToday={isToday}
    />
  );
}

function RealDayPreview({
  day,
  dayIndex,
  drag,
  targetDay,
  targetIndex,
  setSlideRef,
  setListRef,
  setCardRef,
  onGrab,
}: {
  day: PlannerDay;
  dayIndex: number;
  drag: DragState | null;
  targetDay: number | null;
  targetIndex: number | null;
  setSlideRef: DragManager['setSlideRef'];
  setListRef: DragManager['setListRef'];
  setCardRef: DragManager['setCardRef'];
  onGrab: DragManager['onGrab'];
}) {
  const activeCount = day.tasks.filter((task) => !task.completed).length;
  const shownTasks = day.tasks.filter(
    (task) => !(drag?.active && drag.fromDay === dayIndex && drag.taskId === task.id),
  );
  const placeholderAt = drag?.active && targetDay === dayIndex
    ? Math.max(0, Math.min(targetIndex ?? shownTasks.length, shownTasks.length))
    : null;

  return (
    <div
      ref={setSlideRef(dayIndex)}
      data-col="true"
      className="h-full w-[82vw] max-w-[330px] shrink-0 snap-center snap-always sm:w-[360px] sm:max-w-none md:w-[330px] lg:w-[310px] xl:w-[292px]"
    >
      <DayColumn
        title={day.title}
        count={activeCount}
        totalCount={day.tasks.length}
        listRef={setListRef(dayIndex)}
        maxHeightClass="max-h-none"
        isToday={day.isToday}
        availableTags={userTags}
        disableVerticalScroll
      >
        <div className="min-h-[260px]">
          {shownTasks.map((task, visibleIndex) => (
            <div key={task.id}>
              {placeholderAt === visibleIndex ? (
                <div data-drop-placeholder style={{ height: drag?.height }} className="mb-1" />
              ) : null}
              <RealTaskPreview
                task={task}
                dayIndex={dayIndex}
                taskIndex={day.tasks.findIndex((item) => item.id === task.id)}
                dragging={!!drag?.active}
                isToday={!!day.isToday}
                onGrab={onGrab}
                setCardRef={setCardRef}
              />
            </div>
          ))}
          {placeholderAt === shownTasks.length ? (
            <div data-drop-placeholder style={{ height: drag?.height }} className="mb-1" />
          ) : null}
        </div>
      </DayColumn>
    </div>
  );
}

export function MarketingPlannerPreview() {
  const [days, setDays] = useState(initialDays);
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
    settleAndEnd,
    registerOverlayEl,
  } = useDragManager();
  const { panActive, startPanIfEligible, onPanMove, endPan } = usePan(scrollerRef);

  const finishDrop = useCallback(() => {
    if (!drag) return;
    const destinationDay = targetDay ?? drag.fromDay;
    const destinationIndex = targetIndex ?? drag.fromIndex;
    const slot = document.querySelector<HTMLElement>('[data-drop-placeholder]');

    settleAndEnd(slot?.getBoundingClientRect() ?? null, () => {
      setDays((current) => {
        const movingTask = current[drag.fromDay]?.tasks.find((task) => task.id === drag.taskId);
        if (!movingTask || !current[destinationDay]) return current;
        const next = current.map((day) => ({ ...day, tasks: day.tasks.filter((task) => task.id !== drag.taskId) }));
        const destination = [...next[destinationDay].tasks];
        destination.splice(Math.max(0, Math.min(destinationIndex, destination.length)), 0, movingTask);
        next[destinationDay] = {
          ...next[destinationDay],
          tasks: destination.map((task, order) => ({ ...task, order })),
        };
        return next;
      });
      endDrag();
    });
  }, [drag, endDrag, settleAndEnd, targetDay, targetIndex]);

  useEffect(() => {
    if (!drag?.active) return;
    const handleUp = () => finishDrop();
    window.addEventListener('pointerup', handleUp, { passive: true });
    window.addEventListener('touchend', handleUp, { passive: true });
    return () => {
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('touchend', handleUp);
    };
  }, [drag?.active, finishDrop]);

  return (
    <div className="min-w-0 max-w-full rounded-[30px] border border-white/15 bg-background p-3 text-foreground shadow-2xl shadow-black/30 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground">Weekly planner</p>
          <p className="mt-0.5 text-base font-black">July 20–26</p>
        </div>
        <span className="rounded-full bg-[#4d9850] px-3 py-1.5 text-[9px] font-black text-white">+ Add task</span>
      </div>

      <p className="mb-2 px-1 text-[9px] font-black text-muted-foreground">
        Swipe the board · hold a task, then move it between days
        <GripVertical className="ml-1 inline h-3 w-3" aria-hidden />
      </p>
      <div
        ref={scrollerRef}
        dir="ltr"
        data-role="board-scroller"
        data-drag={drag?.active ? '1' : '0'}
        onPointerDown={drag?.active ? undefined : startPanIfEligible}
        onPointerMove={drag?.active ? undefined : onPanMove}
        onPointerUp={drag?.active ? undefined : endPan}
        className={[
          'no-scrollbar -mx-3 flex max-w-[calc(100%+1.5rem)] select-none gap-3 overflow-y-hidden overscroll-x-contain px-3 pb-3 sm:mx-0 sm:max-w-full sm:px-0',
          drag?.active ? 'overflow-x-hidden touch-none snap-none' : 'overflow-x-auto touch-pan-x',
          drag?.active || panActive ? 'snap-none' : 'snap-x snap-mandatory scroll-smooth',
        ].join(' ')}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {days.map((day, dayIndex) => (
          <RealDayPreview
            key={day.id}
            day={day}
            dayIndex={dayIndex}
            drag={drag}
            targetDay={targetDay}
            targetIndex={targetIndex}
            setSlideRef={setSlideRef}
            setListRef={setListRef}
            setCardRef={setCardRef}
            onGrab={onGrab}
          />
        ))}
      </div>

      {drag?.active ? (
        <BoardDragOverlay
          x={drag.x}
          y={drag.y}
          dx={drag.dx}
          dy={drag.dy}
          width={drag.width}
          height={drag.height}
          innerRef={registerOverlayEl}
          text={drag.taskText}
          tags={drag.tags}
          taskType={drag.taskType}
          calendarEventId={drag.calendarEventId}
          startTime={drag.startTime}
          endTime={drag.endTime}
          reminder={drag.reminder}
          notes={drag.notes}
          checklist={drag.checklist}
          frogodoroSession={drag.frogodoroSession}
        />
      ) : null}
    </div>
  );
}
