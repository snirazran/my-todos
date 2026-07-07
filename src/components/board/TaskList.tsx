'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import TaskCard from './TaskCard';
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
import { EditTaskDialog } from '@/components/ui/EditTaskDialog';
import TagsPopup from '@/components/ui/TagsPopup';
import Fly from '@/components/ui/fly';
import { Plus, LayoutList, ListTodo, Repeat, CalendarClock } from 'lucide-react';
import { TimePopup } from '@/components/ui/TimePopup';
import { useNotification } from '@/components/providers/NotificationProvider';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { patchInventoryFlies } from '@/hooks/useInventory';
import { useBuddyState } from '@/hooks/useBuddyState';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';
import { notifyQuestClaims } from '@/lib/questClaims';
import { queuePlusIntroOnce } from '@/lib/plusIntro';
import { useLeftTongue } from './LeftTongue';

// Hoisted so the motion wrapper gets a stable transition reference (a new
// object each render would make framer reconfigure the animation every time).
const LAYOUT_TRANSITION = {
  layout: { type: 'spring', stiffness: 500, damping: 40 },
} as const;

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
  filter = 'all',
  selectedTags = [],
  showCompleted = true,
  daysOrder,
  emptyMode = 'add',
  disableDrag = false,
  isFuture = false,
  onPickDuplicateDate,
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
  filter?: 'all' | 'tasks';
  selectedTags?: string[];
  showCompleted?: boolean;
  daysOrder?: ReadonlyArray<Exclude<ApiDay, -1>>;
  /** Controls what to render when there are no items. 'add' = show add-task button (default), 'none' = show "No activities for this day" placeholder. */
  emptyMode?: 'add' | 'none';
  /** When true, tasks in this list cannot be dragged (e.g., past dates). */
  disableDrag?: boolean;
  /** True if this column's date is in the future. Hides "Mark as complete" in the action sheet. */
  isFuture?: boolean;
  /** Open the board-level calendar to duplicate a task onto a specific picked date. */
  onPickDuplicateDate?: (taskId: string) => void;
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

  // Hold content-visibility off for a beat after a drag ends so re-enabling
  // it (a full-column style recalc) doesn't land on the same frame as the
  // drop commit and its layout animations.
  const [dragHold, setDragHold] = useState(false);
  useEffect(() => {
    if (isAnyDragging) {
      setDragHold(true);
      return;
    }
    const id = window.setTimeout(() => setDragHold(false), 300);
    return () => window.clearTimeout(id);
  }, [isAnyDragging]);
  const measurable = isAnyDragging || dragHold;

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
            <span className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
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
        if (completing && !json?.flyStatus?.isPremium) {
          queuePlusIntroOnce();
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
      body: JSON.stringify({ taskId, details, timezone: tz }),
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

  const handleDeleteToday = async () => {
    if (!dialog || busy) return;
    setBusy(true);
    try {
      if (dialogVariant === 'weekly') {
        const date = dateForDisplayDay(dialog.day);
        if (date) {
          await fetch('/api/tasks', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, taskId: dialog.task.id }),
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

  const renderPlaceholder = (k: string) => (
    <div
      key={k}
      data-drop-placeholder
      style={dragHeight ? { height: dragHeight } : undefined}
      className="h-[56px] mb-1.5 border-2 border-dashed rounded-[14px] border-primary/50 bg-primary/10"
    />
  );

  const inGrace = (id: string) => !!gracePeriodIds?.has(id);

  const filteredItems = items.filter((t) => {
    if (!showCompleted && t.completed && !inGrace(t.id)) return false;
    if (selectedTags && selectedTags.length > 0) {
      const hasTag = t.tags?.some((tagId) => selectedTags.includes(tagId));
      if (!hasTag) return false;
    }
    return true;
  });
  // ---- Empty list: render a single placeholder (if targeting index 0) OR themed empty state
  if (filteredItems.length === 0) {
    if (placeholderAt === 0) {
      rows.push(renderPlaceholder(`ph-empty-${day}`));
    } else if (emptyMode === 'none') {
      rows.push(
        <div
          key={`empty-none-${day}`}
          className="flex items-center justify-center w-full py-4 text-center rounded-[14px] border border-dashed border-muted-foreground/20 bg-muted/20"
        >
          <p className="text-xs font-medium text-muted-foreground/80">
            No activities for this day
          </p>
        </div>,
      );
    } else {
      // THEMED EMPTY STATE / ADD BUTTON
      rows.push(
        <button
          key={`empty-state-${day}`}
          onClick={() => onAddRequested('')}
          className="flex flex-col items-center justify-center w-full py-3 text-center transition-all border-2 border-dashed cursor-pointer border-muted-foreground/20 bg-muted/30 hover:bg-muted/50 rounded-[14px] group"
        >
          <div className="flex items-center justify-center w-11 h-11 mb-1.5 transition-all border rounded-full bg-muted border-muted-foreground/10 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100">
            <Fly size={36} y={-3} />
          </div>
          <p className="text-xs font-bold transition-colors text-muted-foreground group-hover:text-primary">
            Add a task
          </p>
        </button>,
      );
    }
    return <>{rows}</>;
  }

  // ---- Non-empty list
  // If inserting at the very start
  if (placeholderAt === 0) {
    rows.push(renderPlaceholder(`ph-top-${day}`));
  }

  let visibleIndex = 0;

  for (let i = 0; i < items.length; i++) {
    const t = items[i];

    // Filter Logic
    if (!showCompleted && t.completed && !inGrace(t.id)) continue;
    if (selectedTags && selectedTags.length > 0) {
      const hasTag = t.tags?.some((tagId) => selectedTags.includes(tagId));
      if (!hasTag) continue;
    }

    const isDraggedHere = isSelfDrag && sourceIndex === i;

    if (!isDraggedHere) {
      const cardKey = `card-${day}-${t.id}`;
      const wrapKey = `wrap-${day}-${t.id}`;
      const afterKey = `ph-${day}-${visibleIndex + 1}`;
      // The card's visual slot including the placeholder — stable for every
      // card the placeholder doesn't displace, so framer only re-measures the
      // cards that actually move.
      const slot =
        placeholderAt != null && placeholderAt <= visibleIndex
          ? visibleIndex + 1
          : visibleIndex;

      rows.push(
        <motion.div
          key={wrapKey}
          layout="position"
          layoutDependency={slot}
          initial={false}
          transition={LAYOUT_TRANSITION}
          className={
            // content-visibility lets long columns skip rendering offscreen
            // cards while scrolling (the p-1/-m-1 pair gives shadows ink room
            // inside the containment box). Disabled during drags (and briefly
            // after the drop) so framer can measure cards for the reorder
            // animations without the re-enable recalc hitting the drop frame.
            measurable
              ? 'relative -m-1 p-1 [contain-intrinsic-size:auto_60px]'
              : 'relative -m-1 p-1 [content-visibility:auto] [contain-intrinsic-size:auto_60px]'
          }
        >
          <TaskCard
            key={cardKey}
            innerRef={(el) => setCardRef(draggableIdFor(day, t.id), el)}
            dragId={draggableIdFor(day, t.id)}
            task={t}
            occurrenceDate={dateKey ?? todayYmdStr()}
            menuOpen={menu?.id === t.id}
            onToggleMenu={(rect) => {
              setMenu((prev) => {
                if (prev?.id === t.id) return null;
                const MENU_W = 160; // Updated width to match TaskMenu min-w
                const MENU_H = 60;
                const GAP = 8;
                const MARGIN = 10;
                const vw =
                  typeof window !== 'undefined' ? window.innerWidth : 480;
                const vh =
                  typeof window !== 'undefined' ? window.innerHeight : 800;
                let left = rect.left + rect.width / 2 - MENU_W / 2;
                left = Math.max(MARGIN, Math.min(left, vw - MENU_W - MARGIN));
                let top = rect.bottom + GAP;
                if (top + MENU_H > vh - MARGIN) {
                  top = rect.top - MENU_H - GAP;
                }
                top = Math.max(MARGIN, Math.min(top, vh - MENU_H - MARGIN));
                return { id: t.id, top, left };
              });
            }}
            onGrab={(payload) => {
              const id = draggableIdFor(day, t.id);
              // Resolve tags
              const resolvedTags = t.tags?.map((tagId) => {
                const found = userTags?.find(
                  (ut) => ut.id === tagId || ut.name === tagId,
                );
                return found || { id: tagId, name: tagId, color: '' };
              });

              onGrab({
                day,
                index: i, // original array index
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
            hiddenWhileDragging={false}
            isRepeating={t.type === 'weekly'}
            userTags={userTags}
            isAnyDragging={isAnyDragging}
            compact
            onTap={() => setActionSheetId(t.id)}
            onToggleComplete={() => handleToggleComplete(t)}
            disableDrag={disableDrag}
            isPast={!!dateKey && !isToday && !isFuture}
            showStreak
          />
        </motion.div>,
      );

      if (placeholderAt === visibleIndex + 1) {
        rows.push(renderPlaceholder(afterKey));
      }

      visibleIndex++;
    }
  }

  return (
    <>
      {rows}
      <TaskMenu
        menu={menu}
        onClose={() => setMenu(null)}
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
