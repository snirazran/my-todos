'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import TaskCard, { type SelectModifiers } from './TaskCard';
import TaskMenu from './TaskMenu';
import TaskDetailSheet from './TaskDetailSheet';
import { EditScopeDialog } from './EditScopeDialog';
import type { RepeatMode, RepeatRule } from '@/components/ui/quick-add/utils';
import {
  Task,
  draggableIdFor,
  type DisplayDay,
  type ApiDay,
  apiDayFromDisplay,
  relativeDayLabel,
} from './helpers';
import { DeleteDialog } from '@/components/ui/DeleteDialog';
import {
  LeapSessionDeleteSheet,
  useLeapDelete,
  type LeapDeleteImpact,
} from '@/components/pact/LeapSessionDeleteSheet';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import { EditTaskDialog } from '@/components/ui/EditTaskDialog';
import TagsPopup from '@/components/ui/TagsPopup';
import Fly from '@/components/ui/fly';
import { Plus, CalendarClock } from 'lucide-react';
import { TimePopup } from '@/components/ui/TimePopup';
import { useNotification } from '@/components/providers/NotificationProvider';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { patchInventoryFlies } from '@/hooks/useInventory';
import { useBuddyState } from '@/hooks/useBuddyState';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';
import { notifyQuestClaims } from '@/lib/questClaims';
import { useLeftTongue } from './LeftTongue';
import { hapticSuccess, hapticTick } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import {
  matchesTaskFilters,
  sortTasks,
  type TaskFilters,
} from '@/lib/taskFilters';
import { FilteredEmptyState } from '@/components/ui/TaskFilterBar';

const ROW_DIVIDER =
  'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:ml-3.5 before:h-px before:bg-border/60 first:before:hidden md:before:ml-3';
const DRAG_SHIFT_TRANSITION = 'transform 200ms cubic-bezier(0.2, 0, 0, 1)';
const FLIP_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

export default React.memo(function TaskList({
  day,
  items,
  gracePeriodIds,
  isDragging,
  dragFromDay,
  dragFromIndex,
  targetDay,
  targetIndex,
  dragHeight,
  removeTask,
  onGrab,
  setCardRef,
  userTags,
  onToggleRepeat,
  isAnyDragging,
  onAddRequested,
  onEditTask,
  onDoLater,
  onScheduleTask,
  onStartTimer,
  onPatchTask,
  dateKey,
  isToday = false,
  filters,
  filtersActive = false,
  onClearFilters,
  daysOrder,
  emptyMode = 'add',
  disableDrag = false,
  isFuture = false,
  onPickDuplicateDate,
  selection,
  hiddenIds,
}: {
  day: DisplayDay;
  items: Task[];
  /** Just-completed tasks held in their active slot during the grace period. */
  gracePeriodIds?: ReadonlySet<string>;
  isDragging: boolean;
  dragFromDay?: number;
  dragFromIndex?: number;
  targetDay: DisplayDay | null;
  targetIndex: number | null;
  /** Height of the card being dragged, so the placeholder holds its exact space. */
  dragHeight?: number;
  removeTask: (day: DisplayDay, id: string) => Promise<void>;
  onGrab: (p: {
    day: DisplayDay;
    index: number;
    taskId: string;
    taskText: string;
    taskType?: 'weekly' | 'regular' | 'backlog';
    clientX: number;
    clientY: number;
    pointerType: 'mouse' | 'touch';
    rectGetter: () => DOMRect;
    tags?: { id: string; name: string; color: string }[];
    calendarEventId?: string;
    startTime?: string;
    endTime?: string;
    reminder?: string;
    notes?: string;
    checklist?: { id: string; text: string; done: boolean }[];
    frogodoroSession?: {
      date: string;
      focusTime: number;
      breakTime: number;
    } | null;
  }) => void;
  setCardRef: (id: string, el: HTMLDivElement | null) => void;
  onAddRequested: (text: string) => void;
  userTags?: { id: string; name: string; color: string }[];
  onToggleRepeat?: (taskId: string, day: DisplayDay) => void;
  isAnyDragging?: boolean;
  onEditTask?: (
    day: DisplayDay,
    taskId: string,
    newText: string,
  ) => Promise<void>;
  onDoLater?: (day: DisplayDay, taskId: string) => Promise<void>;
  onScheduleTask?: (
    taskId: string,
    data: { startTime: string; endTime: string; reminder: string },
  ) => Promise<void> | void;
  onStartTimer?: (task: Task) => void;
  /** Optimistically patch a task (and its group when scope='all') in the planner's local state. */
  onPatchTask?: (
    taskId: string,
    patch: Partial<Task>,
    scope?: 'one' | 'all',
    groupId?: string,
    /** Limit a scope='one' patch to the task instance in this date column. */
    dateKey?: string,
  ) => void;
  dateKey?: string;
  isToday?: boolean;
  filters: TaskFilters;
  /** True when the board filter is narrowing anything, for the empty state. */
  filtersActive?: boolean;
  onClearFilters?: () => void;
  daysOrder?: ReadonlyArray<Exclude<ApiDay, -1>>;
  /** Controls what to render when there are no items. 'add' = show add-task button (default), 'none' = show "No activities for this day" placeholder. */
  emptyMode?: 'add' | 'none';
  /** When true, tasks in this list cannot be dragged (e.g., past dates). */
  disableDrag?: boolean;
  /** True if this column's date is in the future. Hides "Mark as complete" in the action sheet. */
  isFuture?: boolean;
  /** Open the board-level calendar to duplicate a task onto a specific picked date. */
  onPickDuplicateDate?: (taskId: string) => void;
  /** Board-wide multi-select, owned by TaskBoard so a selection can span days. */
  selection?: {
    active: boolean;
    isSelected: (taskId: string) => boolean;
    /** `visible` is this column's rendered order, for shift-click ranges. */
    toggle: (task: Task, mods: SelectModifiers, visible: Task[]) => void;
    enter: (task: Task) => void;
  };
  /**
   * Task ids to leave out of this column entirely — the other cards travelling
   * inside an in-flight multi-card drag, so the whole bundle visibly lifts off
   * the board instead of just the one under the finger.
   */
  hiddenIds?: ReadonlySet<string>;
}) {
  const [menu, setMenu] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [dialog, setDialog] = useState<{
    task: Task;
    day: DisplayDay;
    kind?: 'edit';
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const [tagPopup, setTagPopup] = useState<{
    open: boolean;
    taskId: string | null;
  }>({ open: false, taskId: null });
  const [scheduleDialog, setScheduleDialog] = useState<{ task: Task } | null>(
    null,
  );
  // Store only the id so the open sheet always reflects the latest task data
  // after a board refresh (repeat/tags/notify/name edits update live).
  const [actionSheetId, setActionSheetId] = useState<string | null>(null);
  const [pendingScope, setPendingScope] = useState<{
    run: (scope: 'one' | 'all') => void;
  } | null>(null);

  const [dragSession, setDragSession] = useState<{ items: Task[] } | null>(
    null,
  );
  const [settleBack, setSettleBack] = useState(false);
  if (isDragging && !dragSession) setDragSession({ items });
  if (!isDragging && dragSession) {
    setDragSession(null);
    setSettleBack(dragSession.items === items);
  }
  useEffect(() => {
    if (!settleBack) return;
    const id = window.setTimeout(() => setSettleBack(false), 260);
    return () => window.clearTimeout(id);
  }, [settleBack]);

  const rowElsRef = useRef(new Map<string, HTMLDivElement>());
  const lastTopsRef = useRef(new Map<string, number>());
  const wasDraggingRef = useRef(false);
  useLayoutEffect(() => {
    if (isDragging) {
      wasDraggingRef.current = true;
      return;
    }
    const animate =
      !wasDraggingRef.current &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    wasDraggingRef.current = false;
    const next = new Map<string, number>();
    rowElsRef.current.forEach((el, id) => {
      const top = el.offsetTop;
      next.set(id, top);
      const prev = lastTopsRef.current.get(id);
      if (!animate || prev === undefined || Math.abs(prev - top) < 1) return;
      el.animate(
        [
          { transform: `translate3d(0, ${prev - top}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: 280, easing: FLIP_EASING },
      );
    });
    lastTopsRef.current = next;
  });

  const tz =
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';
  const todayYmdStr = () => ymdLocal(new Date());

  // Ask "this / all repeats" before applying when the task is part of a group.
  const maybeScoped = (
    isGrouped: boolean,
    run: (scope: 'one' | 'all') => void,
  ) => {
    if (isGrouped) setPendingScope({ run });
    else run('one');
  };

  // The live task for the open detail sheet (re-derived as items refresh).
  const sheetTask = actionSheetId
    ? items.find((t) => t.id === actionSheetId) ?? null
    : null;

  // Planner mutations go straight to the API and refresh via the board event.
  const refresh = () => window.dispatchEvent(new Event('board-refresh'));
  const { showNotification } = useNotification();
  const buddyState = useBuddyState();
  const { triggerTongue, isBusy } = useLeftTongue();

  const groupIdOf = (taskId: string) =>
    items.find((t) => t.id === taskId)?.repeatGroupId;

  // When completing the task that owns the active focus timer, flush its
  // unsaved time and stop it (mirrors the home page behaviour).
  const stopTimerIfActive = (taskId: string) => {
    const s = useFrogodoroStore.getState();
    if (s.selectedTaskId !== taskId || !s.timerActive) return;
    const phaseDuration =
      s.phase === 'focus'
        ? s.settings.focusDuration * 60
        : s.settings.breakDuration * 60;
    const unsaved = Math.max(0, phaseDuration - s.timeLeft - s.phaseElapsed);
    if (unsaved > 0) {
      fetch(`/api/tasks/${taskId}/frogodoro`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session: {
            date: todayYmdStr(),
            focusTime: s.phase === 'focus' ? unsaved : 0,
            breakTime: s.phase === 'break' ? unsaved : 0,
          },
          timezone: tz,
        }),
      })
        .then(refresh)
        .catch(() => {});
    }
    s.stopTimer();
  };

  const handleToggleComplete = (t: Task) => {
    if (isFuture) {
      showNotification(
        <div className="flex items-center gap-3 pr-2">
          <CalendarClock className="h-6 w-6 shrink-0 text-primary" />
          <div className="flex flex-col leading-none">
            <span className="text-base font-black">Not so fast!</span>
            <span className="mt-0.5 text-[13px] font-bold text-muted-foreground">
              This task isn&rsquo;t due yet
            </span>
          </div>
        </div>,
      );
      return;
    }
    toggleComplete(t);
  };

  const toggleComplete = (t: Task) => {
    const completing = !t.completed;
    if (completing && isBusy()) return;
    if (completing) stopTimerIfActive(t.id);
    if (completing) hapticSuccess();
    else hapticTick();

    const persist = () => {
      // Scope to this column's date so sibling instances of a repeating task
      // don't all flash completed and then revert on refetch.
      onPatchTask?.(t.id, { completed: completing }, 'one', undefined, dateKey);
      return fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateKey ?? todayYmdStr(),
          taskId: t.id,
          completed: completing,
          timezone: tz,
        }),
      })
        .then((r) => r.json().catch(() => ({})))
        .then((json) => {
          refresh();
        void notifyQuestClaims(showNotification);
        if (typeof json?.flyStatus?.balance === 'number') {
          patchInventoryFlies(json.flyStatus.balance);
        }
        if (completing && json?.flyStatus?.justHitLimit) {
          showNotification(
            <div className="flex items-center gap-3 pr-1">
              <Fly size={28} y={-4} />
              <span className="font-bold text-red-500">
                Daily Target Reached!
              </span>
            </div>,
          );
        }
      })
        .catch(refresh);
    };

    // Completing on the planner: the tongue reaches in from the left edge,
    // grabs the fly and drags it off-screen, persisting once it's gone. If no
    // fly is on screen (or the tongue is busy), just persist directly.
    if (
      completing &&
      triggerTongue({ key: draggableIdFor(day, t.id), onPersist: persist })
    )
      return;
    void persist();
  };

  const setRepeatDirect = (
    taskId: string,
    mode: RepeatMode,
    dayOfWeek?: number,
    endDate?: string | null,
    rule?: RepeatRule | null,
  ) => {
    // Shared buddy task: a schedule change needs the partner's approval, so
    // route it through a request instead of applying it directly.
    const buddy = buddyState[taskId];
    if (buddy) {
      fetch(`/api/buddy/${buddy.bondId}/repeat-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setRepeat: { mode, dayOfWeek, endDate: endDate ?? null, rule: rule ?? null },
          date: dateKey ?? todayYmdStr(),
          timezone: tz,
        }),
      }).then(() => {
        mutateFriendsCaches();
        showNotification('Change requested — waiting for your buddy to approve');
      });
      return;
    }
    onPatchTask?.(taskId, {
      repeatMode: mode,
      type: mode === 'none' ? 'regular' : 'weekly',
      repeatEndDate: mode === 'none' ? undefined : endDate ?? undefined,
      repeatRule: mode === 'custom' ? rule ?? undefined : undefined,
    });
    fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId,
        date: dateKey ?? todayYmdStr(),
        setRepeat: { mode, dayOfWeek, endDate: endDate ?? null, rule: rule ?? null },
        timezone: tz,
      }),
    }).then(refresh);
  };

  const updateDetails = (
    taskId: string,
    details: { notes?: string; checklist?: { id: string; text: string; done: boolean }[] },
  ) => {
    onPatchTask?.(taskId, details);
    fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId,
        details,
        date: dateKey ?? todayYmdStr(),
        timezone: tz,
      }),
    }).then(refresh);
  };

  const duplicateToDate = (taskId: string, dateYmd: string) => {
    fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duplicateFrom: taskId,
        date: dateYmd,
        timezone: tz,
      }),
    }).then(() => {
      refresh();
      showNotification(`Duplicated to ${relativeDayLabel(dateYmd)}`);
    });
  };

  const duplicate = (taskId: string, when: 'today' | 'tomorrow') => {
    const d = new Date();
    if (when === 'tomorrow') d.setDate(d.getDate() + 1);
    duplicateToDate(taskId, ymdLocal(d));
  };

  const placeholderAt =
    isDragging && targetDay === day && targetIndex != null ? targetIndex : null;

  const isSelfDrag = isDragging && dragFromDay === day;
  const sourceIndex =
    isSelfDrag && dragFromIndex != null ? dragFromIndex : null;

  const variantFor = (t: Task): 'regular' | 'weekly' | 'backlog' => {
    if (t.type === 'weekly') return 'weekly';
    if (t.type === 'backlog') return 'backlog';
    return 'regular';
  };

  const pad = (n: number) => String(n).padStart(2, '0');
  const ymdLocal = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dateForDisplayDay = (displayDay: DisplayDay) => {
    const apiDay = apiDayFromDisplay(displayDay, daysOrder);
    if (apiDay === -1) return null;
    const base = new Date();
    const sunday = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
    );
    sunday.setDate(base.getDate() - base.getDay());
    const target = new Date(sunday);
    target.setDate(sunday.getDate() + apiDay);
    return ymdLocal(target);
  };

  const dialogVariant: 'regular' | 'weekly' | 'backlog' = dialog
    ? variantFor(dialog.task)
    : 'regular';

  // Deleting a Leap session changes a goal, a reward and possibly a streak, so
  // it asks with those numbers in hand before the ordinary delete runs.
  const { mutate } = useSWRConfig();
  const leap = useLeapDelete();
  const [leapPending, setLeapPending] = useState<{
    impact: LeapDeleteImpact;
    run: () => Promise<void>;
  } | null>(null);
  const [leapPlusOpen, setLeapPlusOpen] = useState(false);
  const askLeap = (taskIds: string[], run: () => Promise<void>) => {
    const impact = leap.impactFor(taskIds);
    if (!impact) return false;
    setLeapPending({ impact, run });
    return true;
  };

  const handleDeleteToday = async () => {
    if (!dialog || busy) return;
    if (
      dialogVariant === 'weekly' &&
      askLeap([dialog.task.id], () => runDeleteToday())
    ) {
      return;
    }
    await runDeleteToday();
  };

  const runDeleteToday = async () => {
    if (!dialog || busy) return;
    setBusy(true);
    try {
      if (dialogVariant === 'weekly') {
        const date = dateForDisplayDay(dialog.day);
        if (date) {
          await fetch('/api/tasks', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, taskId: dialog.task.id, timezone: tz }),
          });
          window.dispatchEvent(new Event('board-refresh'));
        }
      } else {
        await removeTask(dialog.day, dialog.task.id);
      }
    } finally {
      setBusy(false);
      setDialog(null);
      setMenu(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!dialog || busy) return;
    if (askLeap([dialog.task.id], () => runDeleteAll())) return;
    await runDeleteAll();
  };

  const runDeleteAll = async () => {
    if (!dialog || busy) return;
    setBusy(true);
    try {
      await removeTask(dialog.day, dialog.task.id);
    } finally {
      setBusy(false);
      setDialog(null);
      setMenu(null);
    }
  };

  // Delete the whole repeat series — the linked group (daily/weekdays) or a
  // lone weekly task across all weeks.
  const handleDeleteSeries = async () => {
    if (!dialog || busy) return;
    if (
      askLeap(
        leap.seriesIdsFor(dialog.task.id, dialog.task.repeatGroupId),
        () => runDeleteSeries(),
      )
    ) {
      return;
    }
    await runDeleteSeries();
  };

  const runDeleteSeries = async () => {
    if (!dialog || busy) return;
    setBusy(true);
    try {
      await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: dialog.task.id,
          deleteSeries: true,
          timezone: tz,
        }),
      });
      refresh();
    } finally {
      setBusy(false);
      setDialog(null);
      setMenu(null);
    }
  };

  const handleTagSave = async (
    taskId: string,
    newTags: string[],
    scope: 'one' | 'all' = 'one',
  ) => {
    onPatchTask?.(taskId, { tags: newTags }, scope, groupIdOf(taskId));
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, tags: newTags, scope }),
      });

      window.dispatchEvent(new Event('tags-updated'));
    } catch (e) {
      console.error('Failed to update tags', e);
    }
  };

  if (process.env.NODE_ENV !== 'production') {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const t of items) seen.has(t.id) ? dups.push(t.id) : seen.add(t.id);
    if (dups.length)
      console.warn(`TaskList day=${day} duplicate task ids:`, dups);
  }

  const rows: React.ReactNode[] = [];
  const shiftHeight = dragHeight ?? 64;

  const inGrace = (id: string) => !!gracePeriodIds?.has(id);

  const keep = (t: Task) =>
    !hiddenIds?.has(t.id) &&
    matchesTaskFilters(t, filters, t.completed && !inGrace(t.id));
  const filteredItems = sortTasks(
    items.filter(keep),
    filters.sort,
    (userTags ?? []).map((t) => t.id),
  );

  const isPastColumn = !!dateKey && !isToday && !isFuture;
  const toggleChecklistItem = (t: Task, itemId: string) => {
    if (!t.checklist) return;
    const next = t.checklist.map((it) =>
      it.id === itemId ? { ...it, done: !it.done } : it,
    );
    const wasComplete = t.checklist.every((it) => it.done);
    if (next.every((it) => it.done) && !wasComplete) hapticSuccess();
    else hapticTick();
    onPatchTask?.(t.id, { checklist: next }, 'one', undefined, dateKey);
    fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: t.id,
        details: { checklist: next },
        date: dateKey ?? todayYmdStr(),
        timezone: tz,
      }),
    }).then(refresh);
  };

  const others = filteredItems.filter(
    (t) => !(isSelfDrag && sourceIndex === items.indexOf(t)),
  );
  const dragPos = (() => {
    if (!isSelfDrag || sourceIndex == null) return null;
    const i = filteredItems.findIndex((t) => items.indexOf(t) === sourceIndex);
    return i === -1 ? null : i;
  })();
  const collapse = (k: number) =>
    dragPos != null && k >= dragPos ? shiftHeight : 0;
  const shiftFor = (k: number) =>
    -collapse(k) + (placeholderAt != null && k >= placeholderAt ? shiftHeight : 0);

  const slotTop = (() => {
    if (placeholderAt == null || others.length === 0) return 0;
    const at = Math.min(placeholderAt, others.length);
    const ref = at < others.length ? others[at] : others[others.length - 1];
    const el = rowElsRef.current.get(ref.id);
    if (!el) return 0;
    const k = at < others.length ? at : others.length - 1;
    const top = el.offsetTop - collapse(k);
    return at < others.length ? top : top + el.offsetHeight;
  })();

  const renderSlot = () => (
    <div
      key={`slot-${day}`}
      data-drop-placeholder
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 z-0 bg-muted/60"
      style={{
        height: shiftHeight,
        transform: `translate3d(0, ${slotTop}px, 0)`,
        transition: DRAG_SHIFT_TRANSITION,
      }}
    />
  );

  if (filteredItems.length === 0 || (others.length === 0 && !isSelfDrag)) {
    if (placeholderAt != null) {
      return (
        <>
          {renderSlot()}
          <div aria-hidden style={{ height: shiftHeight }} />
        </>
      );
    }
    if (hiddenIds?.size && items.length > 0) {
      return null;
    }
    if (filtersActive && items.length > 0) {
      return (
        <div className="px-2 py-3">
          <FilteredEmptyState
            hidden={items.length}
            onClearAll={() => onClearFilters?.()}
            compact
          />
        </div>
      );
    }
    if (emptyMode === 'none') {
      return (
        <p className="px-3.5 py-4 text-[13px] font-semibold text-muted-foreground/60 md:px-3">
          Nothing planned
        </p>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onAddRequested('')}
        className="group flex w-full items-center gap-2.5 py-2.5 pl-3.5 pr-2.5 text-left transition-colors active:bg-muted/50 md:gap-2 md:pl-3 md:pr-2 [@media(hover:hover)]:hover:bg-muted/40"
      >
        <span className="min-w-0 flex-1 text-[15px] font-semibold text-muted-foreground transition-colors group-hover:text-foreground md:text-[14px]">
          {isToday ? 'Add a task for today' : 'Plan something'}
        </span>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-muted-foreground/30 text-muted-foreground transition-colors group-hover:border-primary/50 group-hover:text-primary md:h-10 md:w-10">
          <Plus className="h-5 w-5" strokeWidth={2.5} />
        </span>
      </button>
    );
  }

  let k = 0;
  for (const t of filteredItems) {
    const sourceIdx = items.indexOf(t);
    const isDraggedHere = isSelfDrag && sourceIndex === sourceIdx;
    const shift = isDragging && !isDraggedHere ? shiftFor(k) : 0;
    const visuallyFirst =
      isDragging && !isDraggedHere && k === 0 && placeholderAt !== 0;
    const id = draggableIdFor(day, t.id);

    rows.push(
      <div
        key={`wrap-${day}-${t.id}`}
        ref={(el) => {
          if (el) rowElsRef.current.set(t.id, el);
          else rowElsRef.current.delete(t.id);
        }}
        data-row
        data-drag-source={isDraggedHere ? 'true' : undefined}
        className={cn(
          'relative z-[1]',
          ROW_DIVIDER,
          isDraggedHere && 'pointer-events-none opacity-0',
          visuallyFirst && 'before:hidden',
        )}
        style={
          isDragging || settleBack
            ? {
                transform: shift ? `translate3d(0, ${shift}px, 0)` : undefined,
                transition: DRAG_SHIFT_TRANSITION,
              }
            : undefined
        }
      >
        <TaskCard
          innerRef={(el) => setCardRef(id, el)}
          dragId={id}
          task={t}
          occurrenceDate={dateKey ?? todayYmdStr()}
          menuOpen={menu?.id === t.id}
          onToggleMenu={() => {}}
          onGrab={(payload) => {
            const resolvedTags = t.tags?.map((tagId) => {
              const found = userTags?.find(
                (ut) => ut.id === tagId || ut.name === tagId,
              );
              return found || { id: tagId, name: tagId, color: '' };
            });

            onGrab({
              day,
              index: sourceIdx,
              taskId: t.id,
              taskText: t.text,
              taskType: t.type,
              clientX: payload.clientX,
              clientY: payload.clientY,
              pointerType: payload.pointerType,
              rectGetter: () => {
                const el =
                  document.querySelector<HTMLElement>(
                    `[data-card-id="${id}"]`,
                  ) ?? null;
                return (
                  el?.getBoundingClientRect() ??
                  new DOMRect(payload.clientX - 1, payload.clientY - 1, 1, 1)
                );
              },
              tags: resolvedTags,
              calendarEventId: t.calendarEventId,
              startTime: t.startTime,
              endTime: t.endTime,
              reminder: t.reminder,
              notes: t.notes,
              checklist: t.checklist,
              frogodoroSession: t.frogodoroSession,
            });
          }}
          isRepeating={t.type === 'weekly'}
          userTags={userTags}
          isAnyDragging={isAnyDragging}
          compact
          onTap={() => setActionSheetId(t.id)}
          onToggleComplete={() => handleToggleComplete(t)}
          onToggleChecklistItem={
            t.completed || isFuture
              ? undefined
              : (itemId) => toggleChecklistItem(t, itemId)
          }
          disableDrag={disableDrag}
          isPast={isPastColumn}
          showStreak
          isToday={isToday}
          flyPaused={!isToday}
          selectionMode={!!selection?.active}
          selected={!!selection?.isSelected(t.id)}
          selectable={!!selection}
          onSelectToggle={
            selection
              ? (mods) => selection.toggle(t, mods, filteredItems)
              : undefined
          }
        />
      </div>,
    );

    if (!isDraggedHere) k++;
  }

  if (placeholderAt != null) {
    rows.push(renderSlot());
    if (!isSelfDrag) {
      rows.push(
        <div key={`spacer-${day}`} aria-hidden style={{ height: shiftHeight }} />,
      );
    }
  }

  return (
    <>
      {rows}
      <TaskMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onSelectTasks={
          selection
            ? () => {
                const t = items.find((it) => it.id === menu?.id);
                if (t) selection.enter(t);
              }
            : undefined
        }
        onAddTags={(id) => setTagPopup({ open: true, taskId: id })}
        addTagsPosition="second"
        onToggleRepeat={
          onToggleRepeat
            ? () => {
                if (menu) {
                  onToggleRepeat(menu.id, day);
                  setMenu(null);
                }
              }
            : undefined
        }
        isWeekly={
          menu ? items.find((t) => t.id === menu.id)?.type === 'weekly' : false
        }
        onDelete={() => {
          if (menu) {
            const t = items.find((it) => it.id === menu.id);
            if (t) setDialog({ task: t, day });
          }
          setMenu(null);
        }}
        onEdit={(taskId) => {
          if (menu) {
            const t = items.find((it) => it.id === menu.id);
            if (t && onEditTask) {
              setDialog({ task: t, day, kind: 'edit' });
            }
          }
          setMenu(null);
        }}
        onDoLater={
          onDoLater
            ? () => {
                if (menu && onDoLater) {
                  onDoLater(day, menu.id);
                  setMenu(null);
                }
              }
            : undefined
        }
        onSchedule={
          onScheduleTask
            ? () => {
                if (menu) {
                  const t = items.find((it) => it.id === menu.id);
                  if (t) setScheduleDialog({ task: t });
                }
                setMenu(null);
              }
            : undefined
        }
      />
      <TagsPopup
        open={tagPopup.open}
        taskId={tagPopup.taskId}
        initialTags={items.find((t) => t.id === tagPopup.taskId)?.tags}
        onClose={() => setTagPopup({ open: false, taskId: null })}
        onSave={(taskId, newTags) => {
          const t = items.find((x) => x.id === taskId);
          maybeScoped(!!t?.repeatGroupId, (scope) =>
            handleTagSave(taskId, newTags, scope),
          );
        }}
      />

      <TimePopup
        open={!!scheduleDialog}
        taskName={scheduleDialog?.task.text ?? ''}
        initialStartTime={scheduleDialog?.task.startTime || ''}
        initialReminder={scheduleDialog?.task.reminder || ''}
        onClose={() => setScheduleDialog(null)}
        onSave={async (data) => {
          if (!scheduleDialog) return;
          const t = scheduleDialog.task;
          setScheduleDialog(null);
          maybeScoped(!!t.repeatGroupId, (scope) => {
            onPatchTask?.(
              t.id,
              {
                startTime: data.startTime || undefined,
                endTime: data.endTime || undefined,
                reminder: data.reminder || undefined,
              },
              scope,
              t.repeatGroupId,
            );
            fetch('/api/tasks', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskId: t.id,
                schedule: data,
                scope,
                timezone: tz,
              }),
            }).then(refresh);
          });
        }}
      />

      <EditTaskDialog
        open={dialog?.kind === 'edit'}
        initialText={dialog?.task.text ?? ''}
        busy={busy}
        onClose={() => setDialog(null)}
        onSave={async (newText) => {
          if (!dialog) return;
          const t = dialog.task;
          setDialog(null);
          maybeScoped(!!t.repeatGroupId, (scope) => {
            onPatchTask?.(t.id, { text: newText }, scope, t.repeatGroupId);
            fetch('/api/tasks', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskId: t.id,
                text: newText,
                scope,
                timezone: tz,
              }),
            }).then(refresh);
          });
        }}
      />

      <DeleteDialog
        open={!!dialog && dialog.kind !== 'edit'}
        variant={dialogVariant}
        itemLabel={dialog?.task.text}
        repeatMode={dialog?.task.repeatMode}
        dayLabel={dateKey ? relativeDayLabel(dateKey) : undefined}
        busy={busy}
        onClose={() => setDialog(null)}
        onDeleteToday={
          dialogVariant !== 'backlog' ? handleDeleteToday : handleDeleteAll
        }
        onDeleteAll={
          dialogVariant === 'weekly'
            ? handleDeleteSeries
            : dialogVariant === 'backlog'
              ? handleDeleteToday
              : undefined
        }
      />

      <LeapSessionDeleteSheet
        open={!!leapPending}
        impact={leapPending?.impact ?? null}
        busy={busy}
        onClose={() => setLeapPending(null)}
        onConfirm={async () => {
          const pending = leapPending;
          setLeapPending(null);
          await pending?.run();
          void mutate(
            (key) => typeof key === 'string' && key.startsWith('/api/pact'),
          );
        }}
        onUpgrade={() => {
          setLeapPending(null);
          setLeapPlusOpen(true);
        }}
      />

      <PlusUpgradeModal
        open={leapPlusOpen}
        onClose={() => setLeapPlusOpen(false)}
        placement="leap_task_delete"
      />

      <TaskDetailSheet
        open={!!sheetTask}
        onOpenChange={(o) => {
          if (!o) setActionSheetId(null);
        }}
        task={
          sheetTask
            ? ({
                ...sheetTask,
                dayOfWeek:
                  day < 7 ? apiDayFromDisplay(day, daysOrder) : sheetTask.dayOfWeek,
              } as any)
            : null
        }
        tags={userTags}
        isCompleted={!!sheetTask?.completed}
        isWeekly={sheetTask?.type === 'weekly'}
        onComplete={
          sheetTask && !isFuture
            ? () => toggleComplete(sheetTask)
            : undefined
        }
        onStartTimer={
          sheetTask && isToday && onStartTimer
            ? () => onStartTimer(sheetTask)
            : undefined
        }
        onEdit={
          sheetTask
            ? () => setDialog({ task: sheetTask, day, kind: 'edit' })
            : undefined
        }
        onAddTags={
          sheetTask
            ? () => setTagPopup({ open: true, taskId: sheetTask.id })
            : undefined
        }
        onSchedule={
          sheetTask ? () => setScheduleDialog({ task: sheetTask }) : undefined
        }
        monthlyAnchorYmd={dateKey}
        onSetRepeat={
          sheetTask
            ? (mode, dow, endDate, rule) =>
                setRepeatDirect(sheetTask.id, mode, dow, endDate, rule)
            : undefined
        }
        onDoLater={
          sheetTask && onDoLater && sheetTask.type !== 'weekly'
            ? () => onDoLater(day, sheetTask.id)
            : undefined
        }
        onSkipToday={
          sheetTask?.type === 'weekly'
            ? () => removeTask(day, sheetTask.id)
            : undefined
        }
        onDelete={
          sheetTask ? () => setDialog({ task: sheetTask, day }) : undefined
        }
        onUpdateDetails={
          sheetTask
            ? (details) => updateDetails(sheetTask.id, details)
            : undefined
        }
        onDuplicate={
          sheetTask ? (when) => duplicate(sheetTask.id, when) : undefined
        }
        onPickDate={
          sheetTask && onPickDuplicateDate
            ? () => onPickDuplicateDate(sheetTask.id)
            : undefined
        }
        isPast={!!dateKey && !isToday && !isFuture}
      />

      <EditScopeDialog
        open={!!pendingScope}
        onClose={() => setPendingScope(null)}
        onChoose={(scope) => {
          pendingScope?.run(scope);
          setPendingScope(null);
        }}
      />
    </>
  );
});
