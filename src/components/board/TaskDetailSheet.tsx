'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronRight,
  EyeOff,
  Flame,
  Pen,
  Pencil,
  Repeat,
  RotateCcw,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Icon as AppIcon } from '@/components/ui/Icon';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { TimerClockIcon } from '@/components/ui/TimerClockIcon';
import Fly from '@/components/ui/fly';
import type { ChecklistItem } from '@/hooks/useTaskData';
import type { RepeatMode, RepeatRule } from '@/components/ui/quick-add/utils';
import {
  monthlyRepeatLabel,
  customRepeatLabel,
  formatEndDateLabel,
} from '@/components/ui/quick-add/utils';
import { parseYmd, todayYmd } from '@/components/board/helpers';
import { useBuddyState } from '@/hooks/useBuddyState';
import { BuddyFrogFace } from '@/components/ui/BuddyBadge';
import { BuddyTaskInvite } from '@/components/ui/buddy/BuddyTaskInvite';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { useKeyboardInset } from '@/components/ui/quick-add/useKeyboardInset';
import { ChecklistEditor, checklistRewardHint } from './ChecklistEditor';
import { normalizeChecklistRewards } from '@/lib/checklist';
import { StepPips } from '@/components/ui/TaskAdornments';
import { taskFlyWorthNow } from '@/lib/flyValue';
import { TaskRepeatPopup } from './TaskRepeatPopup';
import RichNotesEditor, { NotesView } from './RichNotesEditor';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface TaskDetailTask {
  id: string;
  text: string;
  type?: string;
  tags?: string[];
  notes?: string;
  checklist?: ChecklistItem[];
  repeatMode?: RepeatMode;
  repeatEndDate?: string;
  repeatRule?: RepeatRule;
  startTime?: string;
  endTime?: string;
  reminder?: string;
  dayOfWeek?: number;
  /** Consecutive-completion streak for a repeating task, as of today. */
  streak?: number;
}

interface TaskDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskDetailTask | null;
  isCompleted: boolean;
  isWeekly: boolean;
  tags?: { id: string; name: string; color: string }[];
  onComplete?: () => void;
  onStartTimer?: () => void;
  onDoLater?: () => void;
  onSkipToday?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSetRepeat?: (
    mode: RepeatMode,
    dayOfWeek?: number,
    endDate?: string | null,
    rule?: RepeatRule | null,
  ) => void;
  onSchedule?: () => void;
  onAddTags?: () => void;
  onUpdateDetails?: (details: {
    notes?: string;
    checklist?: ChecklistItem[];
  }) => void;
  /** Duplicate a completed/past task onto a new day. */
  onDuplicate?: (when: 'today' | 'tomorrow') => void;
  /** Open a calendar to duplicate this task onto a specific picked date. */
  onPickDate?: () => void;
  /** True when the task sits on a past day. Past tasks get the minimal sheet. */
  isPast?: boolean;
  /** Date (YYYY-MM-DD) a new monthly repeat should anchor to. Defaults to today. */
  monthlyAnchorYmd?: string;
}

export default function TaskDetailSheet({
  open,
  onOpenChange,
  task,
  isCompleted,
  isWeekly,
  tags = [],
  onComplete,
  onStartTimer,
  onDoLater,
  onSkipToday,
  onEdit,
  onDelete,
  onSetRepeat,
  onSchedule,
  onAddTags,
  onUpdateDetails,
  onDuplicate,
  onPickDate,
  isPast = false,
  monthlyAnchorYmd,
}: TaskDetailSheetProps) {
  // Keep the last task around so the slide-down exit animation can still
  // render content after the parent clears `task` on close.
  const lastTaskRef = useRef<TaskDetailTask | null>(task);
  useEffect(() => {
    if (task) lastTaskRef.current = task;
  }, [task]);
  const displayTask = task ?? lastTaskRef.current;

  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [editingNotes, setEditingNotes] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);

  const { inset: kbInset, height: vvHeight } = useKeyboardInset(open);
  const [inputFocused, setInputFocused] = useState(false);
  const keyboardActive = inputFocused && kbInset > 0;

  // Seed local state only when a *different* task opens — not on every task
  // object change. Otherwise persisting a checklist edit re-runs this and snaps
  // the tab back to Notes.
  useEffect(() => {
    if (open && task) {
      setNotes(task.notes ?? '');
      setChecklist(task.checklist ?? []);
      setEditingNotes(false);
      setShowRepeat(false);
      setInputFocused(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  const isEditableTarget = (el: EventTarget | null) => {
    const node = el as HTMLElement | null;
    if (!node) return false;
    return (
      node.tagName === 'INPUT' ||
      node.tagName === 'TEXTAREA' ||
      !!node.closest?.('[contenteditable="true"]')
    );
  };

  // Focus hopping between checklist rows fires blur→focus back-to-back; the
  // short delay keeps keyboardActive stable so the layout doesn't flash.
  const blurTimerRef = useRef<number | null>(null);
  const handleFocusCapture = (e: React.FocusEvent) => {
    if (!isEditableTarget(e.target)) return;
    if (blurTimerRef.current !== null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setInputFocused(true);
  };
  const handleBlurCapture = (e: React.FocusEvent) => {
    if (!isEditableTarget(e.target)) return;
    if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current);
    blurTimerRef.current = window.setTimeout(() => {
      blurTimerRef.current = null;
      setInputFocused(false);
    }, 120);
  };
  useEffect(
    () => () => {
      if (blurTimerRef.current !== null)
        window.clearTimeout(blurTimerRef.current);
    },
    [],
  );

  const nestedOpenRef = useRef(false);
  const escapeRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || nestedOpenRef.current)
        return;
      e.preventDefault();
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        active.blur();
        return;
      }
      escapeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const tagDetails = useMemo(() => {
    const byId = new Map(tags.map((t) => [t.id, t] as const));
    const byName = new Map(tags.map((t) => [t.name, t] as const));
    return (id: string) => byId.get(id) ?? byName.get(id);
  }, [tags]);

  const buddyByTaskId = useBuddyState(open);
  const buddy = displayTask ? buddyByTaskId[displayTask.id] : undefined;
  const [showBuddyInvite, setShowBuddyInvite] = useState(false);
  nestedOpenRef.current = showRepeat || showBuddyInvite;
  const [cancelling, setCancelling] = useState(false);

  const notesText = useMemo(() => {
    if (!notes) return '';
    if (typeof window === 'undefined') return '';
    const doc = new DOMParser().parseFromString(notes, 'text/html');
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  }, [notes]);

  if (!displayTask) return null;

  // Past tasks (done or not) get the stripped-down sheet: a single primary
  // action (Undo when done, Complete otherwise) plus the duplicate options.
  // No notify/tags/notes/checklist/repeat editing on a past day.
  const minimal = isCompleted || isPast;

  const flushDetails = () => {
    commitNotes();
    const trimmed = checklist.filter((it) => it.text.trim());
    if (trimmed.length !== checklist.length) {
      setChecklist(trimmed);
      persist({ checklist: trimmed });
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) flushDetails();
    onOpenChange(next);
  };

  const close = () => handleOpenChange(false);
  escapeRef.current = close;
  const runAndClose = (fn?: () => void) => () => {
    flushDetails();
    fn?.();
    onOpenChange(false);
  };

  const persist = (next: { notes?: string; checklist?: ChecklistItem[] }) =>
    onUpdateDetails?.(next);

  const commitNotes = () => {
    if ((displayTask.notes ?? '') !== notes) persist({ notes });
  };

  const taskFlies = taskFlyWorthNow({
    checklist,
    streak: (displayTask.streak ?? 0) + (isCompleted ? 0 : 1),
  });
  // For weekly tasks use their stored weekday; otherwise anchor to the date the
  // task sits on (the column being edited), falling back to today.
  const repeatDay =
    displayTask.dayOfWeek ??
    (monthlyAnchorYmd
      ? parseYmd(monthlyAnchorYmd).getDay()
      : new Date().getDay());
  const repeatMode: RepeatMode =
    displayTask.repeatMode ?? (isWeekly ? 'weekly' : 'none');
  const repeatChipLabel =
    repeatMode === 'daily'
      ? 'Daily'
      : repeatMode === 'weekdays'
        ? 'Weekdays'
        : repeatMode === 'weekly'
          ? `Every ${DAY_NAMES[repeatDay]}`
          : repeatMode === 'monthly'
            ? 'Monthly'
            : repeatMode === 'custom'
              ? 'Custom'
              : 'Repeat';
  const repeatBaseLabel =
    repeatMode === 'daily'
      ? 'Every day'
      : repeatMode === 'weekdays'
        ? 'Every weekday'
        : repeatMode === 'weekly'
          ? `Every ${DAY_NAMES[repeatDay]}`
          : repeatMode === 'monthly'
            ? monthlyRepeatLabel(monthlyAnchorYmd ?? todayYmd())
            : repeatMode === 'custom' && displayTask.repeatRule
              ? customRepeatLabel(displayTask.repeatRule)
              : 'Does not repeat';
  const repeatLabel =
    repeatMode !== 'none' && displayTask.repeatEndDate
      ? `${repeatBaseLabel} · until ${formatEndDateLabel(displayTask.repeatEndDate)}`
      : repeatBaseLabel;
  const isRepeating = repeatMode !== 'none' || isWeekly;
  // A saved (backlog) task has no day yet, so there is no occurrence to share.
  const canShareWithBuddy = displayTask.type !== 'backlog';
  const streak = displayTask.streak ?? 0;

  const taskTags = displayTask.tags ?? [];
  const rewardItems = normalizeChecklistRewards(checklist);
  const stepsDone = rewardItems.filter((item) => item.done).length;
  const rewardHint = checklistRewardHint(rewardItems);
  const hasContent = !!notesText || checklist.length > 0;
  const hasMeta =
    isCompleted ||
    (isRepeating && streak > 0) ||
    (minimal &&
      (!!buddy || isRepeating || !!displayTask.startTime || taskTags.length > 0));
  const buddyDoneToday =
    !!buddy &&
    buddy.status === 'active' &&
    (buddy.oneTime
      ? buddy.partnerCompletedDates.length > 0
      : buddy.partnerCompletedDates.includes(todayYmd()));

  return (
    <>
      <BaseSheet
        open={open}
        onOpenChange={handleOpenChange}
        className="sm:max-w-[500px] max-h-[92vh] !border-0 !bg-transparent !shadow-none"
        zIndex={1400}
        hideHandle
        showClose={false}
        bottomInset={keyboardActive ? kbInset : 0}
        panelStyle={
          keyboardActive && vvHeight
            ? { maxHeight: Math.max(260, vvHeight - 8) }
            : undefined
        }
      >
        {({ bindScroll, dragControls }) => (
          <div
            ref={bindScroll}
            role="dialog"
            aria-modal="true"
            aria-label={displayTask.text}
            onFocusCapture={handleFocusCapture}
            onBlurCapture={handleBlurCapture}
            className={`flex flex-1 min-h-0 flex-col gap-3 overflow-hidden px-3 pt-1 sm:gap-2.5 sm:rounded-[32px] sm:bg-popover sm:p-3 sm:shadow-[0_24px_64px_-16px_rgba(0,0,0,0.45)] sm:ring-1 sm:ring-border/70 ${
              keyboardActive
                ? 'pb-2'
                : 'pb-[calc(env(safe-area-inset-bottom)+14px)] sm:pb-2'
            }`}
          >
            <div className="relative flex min-h-0 flex-col overflow-hidden rounded-[28px] bg-popover ring-1 ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.18)] sm:rounded-[24px] sm:shadow-none sm:ring-0">
              <div
                onPointerDown={(e) => dragControls.start(e)}
                className="flex h-7 shrink-0 items-center justify-center touch-none cursor-grab active:cursor-grabbing sm:hidden"
              >
                <div className="h-1.5 w-10 rounded-full bg-muted-foreground/25" />
              </div>

              <div className="absolute right-3 top-3 z-10 flex items-center gap-1 sm:right-4 sm:top-4">
                {onDelete && (
                  <button
                    onClick={runAndClose(onDelete)}
                    aria-label="Delete task"
                    title="Delete"
                    className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground/50 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <button
                  onClick={close}
                  aria-label="Close"
                  className="grid h-8 w-8 place-items-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col px-5 pb-4 pt-1 sm:pt-5">
                <div className={onDelete ? 'pr-[76px]' : 'pr-9'}>
                  {!minimal && onEdit ? (
                    <button
                      onClick={onEdit}
                      className="group w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <span className="text-[22px] font-black leading-[28px] tracking-tight text-foreground sm:text-[23px] sm:leading-[29px]">
                        {displayTask.text}
                        <Pencil className="mb-1 ml-2 inline-block h-3.5 w-3.5 text-muted-foreground/35 transition-colors group-hover:text-muted-foreground" />
                      </span>
                    </button>
                  ) : (
                    <span className="block text-[22px] font-black leading-[28px] tracking-tight text-foreground sm:text-[23px] sm:leading-[29px]">
                      {displayTask.text}
                    </span>
                  )}
                </div>

                {hasMeta && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[13px] font-black">
                    {isCompleted && (
                      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-green-500/10 px-2.5 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        Completed
                      </span>
                    )}
                    {isRepeating && streak > 0 && (
                      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-orange-500/10 px-2.5 text-orange-600 dark:text-orange-400">
                        <Flame className="h-4 w-4" fill="currentColor" strokeWidth={0} />
                        <span className="tabular-nums">{streak} in a row</span>
                      </span>
                    )}
                    {minimal && buddy && (
                      <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#4f9149]/10 pl-1 pr-2.5 text-[#3d7a38] dark:text-emerald-400">
                        <BuddyFrogFace indices={buddy.partnerIndices} size={20} />
                        With {buddy.partnerName}
                      </span>
                    )}
                    {minimal && isRepeating && (
                      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-muted/70 px-2.5 text-muted-foreground">
                        <Repeat className="h-3.5 w-3.5" />
                        {repeatLabel}
                      </span>
                    )}
                    {minimal && displayTask.startTime && (
                      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-muted/70 px-2.5 tabular-nums text-muted-foreground">
                        <Bell className="h-3.5 w-3.5" />
                        {displayTask.startTime}
                      </span>
                    )}
                    {minimal &&
                      taskTags.map((tagId) => {
                        const t = tagDetails(tagId);
                        if (!t) return null;
                        return (
                          <span
                            key={tagId}
                            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted/70 px-2.5 text-muted-foreground"
                          >
                            <span
                              aria-hidden
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: t.color }}
                            />
                            {t.name}
                          </span>
                        );
                      })}
                  </div>
                )}

                {!minimal && (
                  <>
                    <div
                      style={
                        keyboardActive && vvHeight
                          ? { maxHeight: Math.max(150, vvHeight - 200) }
                          : undefined
                      }
                      className="-mx-2 mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2 pb-1"
                    >
                      {(editingNotes || notesText) && (
                        <SectionLabel>Notes</SectionLabel>
                      )}
                      {editingNotes ? (
                        <RichNotesEditor
                          value={notes}
                          onChange={setNotes}
                          autoFocus
                          onBlur={() => {
                            commitNotes();
                            setEditingNotes(false);
                          }}
                        />
                      ) : notesText ? (
                        <div className="rounded-2xl bg-muted/45 py-0.5">
                          <NotesView
                            value={notes}
                            onEdit={() => setEditingNotes(true)}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingNotes(true)}
                          className="flex min-h-[44px] items-center gap-3 rounded-xl px-2 text-left text-[15px] text-muted-foreground/60 transition-colors [@media(hover:hover)]:hover:bg-muted/40"
                        >
                          <span className="grid h-[23px] w-[23px] shrink-0 place-items-center">
                            <Pen className="h-4 w-4" />
                          </span>
                          Add notes
                        </button>
                      )}

                      {checklist.length > 0 && (
                        <SectionLabel
                          aside={
                          <span className="flex items-center gap-2">
                            <span className="text-[12px] font-bold tabular-nums text-muted-foreground">
                              {stepsDone}/{rewardItems.length}
                            </span>
                            <StepPips items={rewardItems} done={stepsDone} />
                          </span>
                          }
                        >
                          Steps
                        </SectionLabel>
                      )}

                      <ChecklistEditor
                        hideRewardTrack
                        items={checklist}
                        onChange={(next, { persist: persistNow }) => {
                          setChecklist(next);
                          if (persistNow) persist({ checklist: next });
                        }}
                      />

                      {rewardHint && (
                        <p className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[12px] font-semibold text-muted-foreground">
                          <span className="grid h-4 w-4 place-items-center">
                            <Fly size={18} x={-1} y={-2} interactive={false} paused />
                          </span>
                          {rewardHint}
                        </p>
                      )}

                    {!keyboardActive &&
                      (onSetRepeat || onSchedule || onAddTags || canShareWithBuddy) && (
                        <>
                        <SectionLabel>Details</SectionLabel>
                        <div className="overflow-hidden rounded-2xl bg-muted/45">
                          {onSetRepeat && (
                            <PropertyRow
                              dataHint="repeat-button"
                              tint="green"
                              icon={<Repeat className="h-4 w-4" strokeWidth={2.5} />}
                              label="Repeat"
                              onClick={() => setShowRepeat(true)}
                            >
                              {isRepeating ? repeatLabel : 'Never'}
                            </PropertyRow>
                          )}
                          {onSchedule && (
                            <PropertyRow
                              tint="amber"
                              icon={<Bell className="h-4 w-4" strokeWidth={2.5} />}
                              label="Time"
                              onClick={onSchedule}
                            >
                              {displayTask.startTime ? (
                                <span className="tabular-nums">
                                  {displayTask.endTime &&
                                  displayTask.endTime !== displayTask.startTime
                                    ? `${displayTask.startTime}–${displayTask.endTime}`
                                    : displayTask.startTime}
                                  {displayTask.reminder ? ' · Reminder' : ''}
                                </span>
                              ) : (
                                'None'
                              )}
                            </PropertyRow>
                          )}
                          {onAddTags && (
                            <PropertyRow
                              dataHint="task-tags-button"
                              dataTagIds={taskTags.join(',') || undefined}
                              tint="violet"
                              icon={<Tag className="h-4 w-4" strokeWidth={2.5} />}
                              label="Tags"
                              onClick={onAddTags}
                            >
                              {taskTags.some((id) => tagDetails(id)) ? (
                                <span className="flex min-w-0 items-center justify-end gap-2.5">
                                  {taskTags.map((tagId) => {
                                    const t = tagDetails(tagId);
                                    if (!t) return null;
                                    return (
                                      <span
                                        key={tagId}
                                        className="inline-flex min-w-0 items-center gap-1"
                                      >
                                        <span
                                          aria-hidden
                                          className="h-2 w-2 shrink-0 rounded-full"
                                          style={{ backgroundColor: t.color }}
                                        />
                                        <span className="truncate">{t.name}</span>
                                      </span>
                                    );
                                  })}
                                </span>
                              ) : (
                                'None'
                              )}
                            </PropertyRow>
                          )}
                          {canShareWithBuddy && (
                            <PropertyRow
                              tint="buddy"
                              icon={<Users className="h-4 w-4" strokeWidth={2.5} />}
                              label="Buddy"
                              onClick={
                                buddy ? undefined : () => setShowBuddyInvite(true)
                              }
                            >
                              {buddy ? (
                                <span className="inline-flex min-w-0 items-center gap-1.5">
                                  <BuddyFrogFace
                                    indices={buddy.partnerIndices}
                                    size={20}
                                  />
                                  <span className="truncate">
                                    {buddy.status === 'pending'
                                      ? `Waiting for ${buddy.partnerName}`
                                      : buddyDoneToday
                                        ? `${buddy.partnerName} · done`
                                        : buddy.partnerName}
                                  </span>
                                </span>
                              ) : (
                                'Do it with a friend'
                              )}
                            </PropertyRow>
                          )}
                        </div>
                        </>
                      )}

                    {!keyboardActive &&
                      buddy?.status === 'pending' &&
                      buddy.invitedByMe && (
                        <button
                          type="button"
                          disabled={cancelling}
                          onClick={async () => {
                            if (cancelling) return;
                            setCancelling(true);
                            try {
                              await fetch(`/api/buddy/${buddy.bondId}/cancel`, {
                                method: 'POST',
                              });
                              mutateFriendsCaches();
                            } finally {
                              setCancelling(false);
                            }
                          }}
                          className="mt-1.5 self-center rounded-full px-3 py-1.5 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                        >
                          Cancel invite to {buddy.partnerName}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {minimal && onDuplicate && (
              <div className="shrink-0 rounded-[28px] bg-popover p-3 ring-1 ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.18)]">
                <p className="mb-2 text-center text-[13px] font-black text-muted-foreground">
                  Duplicate to
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={runAndClose(() => onDuplicate('today'))}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-border/60 bg-muted/40 py-3 text-[14px] font-bold text-foreground transition-colors hover:bg-muted"
                  >
                    <CalendarPlus className="h-4 w-4 text-primary" /> Today
                  </button>
                  <button
                    onClick={runAndClose(() => onDuplicate('tomorrow'))}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-border/60 bg-muted/40 py-3 text-[14px] font-bold text-foreground transition-colors hover:bg-muted"
                  >
                    <CalendarPlus className="h-4 w-4 text-primary" /> Tomorrow
                  </button>
                  {onPickDate && (
                    <button
                      onClick={runAndClose(onPickDate)}
                      className="col-span-2 flex items-center justify-center gap-1.5 rounded-2xl border border-border/60 bg-muted/40 py-3 text-[14px] font-bold text-foreground transition-colors hover:bg-muted"
                    >
                      <CalendarDays className="h-4 w-4 text-primary" /> Pick a date…
                    </button>
                  )}
                </div>
              </div>
            )}

            {keyboardActive ? null : isCompleted ? (
              onComplete && (
                <button
                  onClick={runAndClose(onComplete)}
                  className="flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-[28px] bg-popover text-[16px] font-black text-foreground ring-1 ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.18)] transition-all active:translate-y-0.5 active:shadow-none [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[0_4px_0_0_rgba(0,0,0,0.18)]"
                >
                  <RotateCcw className="h-5 w-5 text-muted-foreground" />
                  Undo
                </button>
              )
            ) : (
              <div className="flex shrink-0 items-stretch gap-2.5">
                {!minimal && onStartTimer && (
                  <TaskFocusButton
                    taskId={displayTask?.id ?? ''}
                    onClick={runAndClose(onStartTimer)}
                  />
                )}
                <button
                  onClick={runAndClose(onComplete)}
                  disabled={!onComplete}
                  className={[
                    'group relative h-14 min-w-0 flex-1 overflow-hidden rounded-[28px] text-[17px] font-black transition-all',
                    'bg-[#4f9149] text-white',
                    'shadow-[0_4px_0_0_#34631f] ring-1 ring-[#34631f]/40',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f9149]/40',
                    '[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[0_5px_0_0_#34631f] active:translate-y-1 active:shadow-none',
                    'disabled:pointer-events-none disabled:opacity-60 disabled:grayscale',
                  ].join(' ')}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow-sm">
                      <Fly size={30} y={-2} interactive={false} />
                    </span>
                    <span>{onComplete ? 'Complete' : 'Upcoming'}</span>
                    {!!onComplete && taskFlies > 1 && (
                      <span
                        title={`Completing this now catches ${taskFlies} flies`}
                        className="rounded-full bg-white/25 px-2 py-1 text-[13px] font-black leading-none tabular-nums"
                      >
                        +{taskFlies}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            )}

            {!minimal &&
              !keyboardActive &&
              ((isRepeating && onSkipToday) || onDoLater) && (
                <button
                  type="button"
                  onClick={runAndClose(
                    isRepeating && onSkipToday ? onSkipToday : onDoLater,
                  )}
                  data-hint={
                    isRepeating && onSkipToday ? undefined : 'save-later-button'
                  }
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 self-center rounded-full bg-popover px-4 text-[13px] font-bold text-muted-foreground ring-1 ring-border/70 shadow-[0_2px_0_0_rgba(0,0,0,0.12)] transition-colors active:translate-y-px [@media(hover:hover)]:hover:text-foreground"
                >
                  {isRepeating && onSkipToday ? (
                    <>
                      <EyeOff className="h-4 w-4" />
                      Skip today
                    </>
                  ) : (
                    <>
                      <AppIcon name="saved" className="h-5 w-5" />
                      Save for later
                    </>
                  )}
                </button>
              )}
          </div>
        )}
      </BaseSheet>

      {displayTask && (
        <BuddyTaskInvite
          open={showBuddyInvite}
          taskId={displayTask.id}
          taskText={displayTask.text}
          onClose={() => setShowBuddyInvite(false)}
        />
      )}

      <TaskRepeatPopup
        open={showRepeat}
        onClose={() => setShowRepeat(false)}
        currentMode={repeatMode}
        repeatDayLabel={DAY_NAMES[repeatDay]}
        monthlyLabel={monthlyRepeatLabel(monthlyAnchorYmd ?? todayYmd())}
        currentEndDate={displayTask?.repeatEndDate ?? null}
        currentRule={displayTask?.repeatRule ?? null}
        anchorYmd={monthlyAnchorYmd ?? todayYmd()}
        onChange={(mode, endDate, rule) => {
          onSetRepeat?.(mode, repeatDay, endDate, rule);
          setShowRepeat(false);
        }}
      />
    </>
  );
}

function SectionLabel({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-1 mt-4 flex items-center justify-between gap-3 px-2 first:mt-1">
      <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground/70">
        {children}
      </span>
      {aside}
    </div>
  );
}

const PROPERTY_TINT = {
  green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  buddy: 'bg-[#4f9149]/15 text-[#4f9149] dark:text-emerald-400',
} as const;

function PropertyRow({
  icon,
  tint,
  label,
  onClick,
  dataHint,
  dataTagIds,
  children,
}: {
  icon: React.ReactNode;
  tint: keyof typeof PROPERTY_TINT;
  label: string;
  onClick?: () => void;
  dataHint?: string;
  dataTagIds?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-hint={dataHint}
      data-tag-ids={dataTagIds}
      onClick={onClick}
      disabled={!onClick}
      className="flex min-h-[50px] w-full items-center gap-3 border-border/50 px-3.5 text-left transition-colors disabled:cursor-default [&:not(:first-child)]:border-t enabled:active:bg-muted [@media(hover:hover)]:enabled:hover:bg-muted/70"
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${PROPERTY_TINT[tint]}`}
      >
        {icon}
      </span>
      <span className="shrink-0 text-[15px] font-semibold text-foreground">
        {label}
      </span>
      <span className="ml-auto flex min-w-0 items-center justify-end text-right text-[14px] font-semibold text-muted-foreground">
        <span className="min-w-0 truncate">{children}</span>
      </span>
      {onClick && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
      )}
    </button>
  );
}

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function TaskFocusButton({
  taskId,
  onClick,
}: {
  taskId: string;
  onClick: () => void;
}) {
  const isFocusing = useFrogodoroStore(
    (state) => state.timerActive && state.selectedTaskId === taskId,
  );
  const timeLeft = useFrogodoroStore((state) =>
    state.timerActive && state.selectedTaskId === taskId ? state.timeLeft : 0,
  );
  const phase = useFrogodoroStore((state) => state.phase);
  const isRunning = useFrogodoroStore(
    (state) =>
      state.timerActive &&
      state.isRunning &&
      state.selectedTaskId === taskId,
  );

  return (
    <button
      type="button"
      onClick={onClick}
      data-hint="focus-button"
      aria-label={isFocusing ? 'Open focus timer' : 'Focus timer'}
      title="Focus timer"
      className={`flex h-14 shrink-0 items-center justify-center gap-1.5 rounded-[28px] text-[14px] font-black ring-1 transition-all active:translate-y-0.5 active:shadow-none [@media(hover:hover)]:hover:-translate-y-0.5 ${
        isFocusing ? 'px-4' : 'w-14'
      } ${
        isFocusing && phase === 'focus'
          ? 'bg-[#4f9149] text-white ring-[#34631f]/50 shadow-[0_3px_0_0_#34631f]'
          : isFocusing
            ? 'bg-sky-500 text-white ring-sky-700/50 shadow-[0_3px_0_0_#0369a1] dark:bg-sky-700'
            : 'bg-popover text-foreground ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.18)]'
      }`}
    >
      {isFocusing ? (
        <>
          <TimerClockIcon running={isRunning} className="h-7 w-7" />
          <span className="tabular-nums">{formatTimer(timeLeft)}</span>
        </>
      ) : (
        <AppIcon name="clock" label="Focus timer" className="h-8 w-8" />
      )}
    </button>
  );
}
