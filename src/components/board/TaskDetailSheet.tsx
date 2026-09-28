'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
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
import { ChecklistEditor } from './ChecklistEditor';
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
  const hasContent = !!notesText || checklist.length > 0;
  const hasMeta =
    isCompleted ||
    (isRepeating && streak > 0) ||
    !!buddy ||
    (minimal && (isRepeating || !!displayTask.startTime || taskTags.length > 0));

  const chipBase =
    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black leading-none';

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
            {/* Main card — mirrors the QuickAddSheet shell */}
            <div
              className="relative flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[28px] bg-popover ring-1 ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.18)] sm:rounded-[24px] sm:shadow-none sm:ring-0"
            >
              <div
                onPointerDown={(e) => dragControls.start(e)}
                className="flex h-7 shrink-0 items-center justify-center touch-none cursor-grab active:cursor-grabbing sm:hidden"
              >
                <div className="h-1.5 w-10 rounded-full bg-muted-foreground/25" />
              </div>

              <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 sm:right-4 sm:top-4">
                {onDelete && (
                  <button
                    onClick={runAndClose(onDelete)}
                    aria-label="Delete task"
                    title="Delete"
                    className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
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
                      className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
                    >
                      <span className="text-[21px] font-black leading-[27px] tracking-tight text-foreground sm:text-[23px] sm:leading-[29px]">
                        {displayTask.text}
                        <Pencil className="mb-1 ml-2 inline-block h-4 w-4 text-muted-foreground/50" />
                      </span>
                    </button>
                  ) : (
                    <span className="block text-[21px] font-black leading-[27px] tracking-tight text-foreground sm:text-[23px] sm:leading-[29px]">
                      {displayTask.text}
                    </span>
                  )}
                </div>

                {hasMeta && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {isCompleted && (
                      <span className={`${chipBase} bg-green-500/10 text-green-600 dark:text-green-400`}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Completed
                      </span>
                    )}
                    {isRepeating && streak > 0 && (
                      <span
                        className={`${chipBase} bg-orange-500/10 text-orange-500`}
                        title={`${streak} in a row`}
                      >
                        <Flame className="h-3.5 w-3.5" fill="currentColor" />
                        <span className="tabular-nums">×{streak}</span>
                      </span>
                    )}
                    {minimal && displayTask.startTime && (
                      <button
                        onClick={!minimal && onSchedule ? onSchedule : undefined}
                        disabled={minimal || !onSchedule}
                        className={`${chipBase} bg-primary/10 text-primary disabled:pointer-events-none`}
                      >
                        <Bell className="h-3 w-3" />
                        <span className="tabular-nums">{displayTask.startTime}</span>
                      </button>
                    )}
                    {minimal && isRepeating && (
                      <span className={`${chipBase} bg-muted/70 text-muted-foreground`}>
                        <AppIcon name="repeat" label="Repeat" className="h-3 w-3" />
                        {repeatLabel}
                      </span>
                    )}
                    {buddy && buddy.status === 'pending' ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 py-0.5 pl-0.5 pr-2"
                        title={`Waiting for ${buddy.partnerName} to accept`}
                      >
                        <BuddyFrogFace
                          indices={buddy.partnerIndices}
                          size={20}
                          className="opacity-75 ring-2 ring-inset ring-amber-500/40"
                        />
                        <span className="text-[11px] font-black leading-none text-amber-600 dark:text-amber-500">
                          Waiting for {buddy.partnerName}
                        </span>
                      </span>
                    ) : buddy ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-[#4f9149]/10 py-0.5 pl-0.5 pr-2"
                        title={`Shared with ${buddy.partnerName}`}
                      >
                        <BuddyFrogFace indices={buddy.partnerIndices} size={20} />
                        <span className="text-[11px] font-black leading-none text-[#4f9149]">
                          With {buddy.partnerName}
                        </span>
                      </span>
                    ) : null}
                    {minimal && taskTags.map((tagId) => {
                      const t = tagDetails(tagId);
                      if (!t) return null;
                      return (
                        <button
                          key={tagId}
                          onClick={undefined}
                          disabled={minimal || !onAddTags}
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-black tracking-wide leading-4 disabled:pointer-events-none"
                          style={{
                            backgroundColor: `${t.color}20`,
                            color: t.color,
                            borderColor: `${t.color}40`,
                          }}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {!minimal && (
                  <>
                    <div className="mt-3 h-px shrink-0 bg-border/60" />

                    <div
                      style={
                        keyboardActive && vvHeight
                          ? { maxHeight: Math.max(150, vvHeight - 200) }
                          : undefined
                      }
                      className={`-mx-2 mt-2 flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain px-2 pb-1 ${
                        keyboardActive ? '' : 'max-h-[min(460px,50dvh)]'
                      }`}
                    >
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
                        <NotesView
                          value={notes}
                          onEdit={() => setEditingNotes(true)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingNotes(true)}
                          className="flex min-h-[44px] items-center gap-3 rounded-xl px-2 text-left text-[15px] text-muted-foreground/70 transition-colors [@media(hover:hover)]:hover:bg-muted/40"
                        >
                          <span className="grid h-[23px] w-[23px] shrink-0 place-items-center">
                            <Pen className="h-4 w-4" />
                          </span>
                          Add notes…
                        </button>
                      )}

                      <ChecklistEditor
                        items={checklist}
                        onChange={(next, { persist: persistNow }) => {
                          setChecklist(next);
                          if (persistNow) persist({ checklist: next });
                        }}
                      />
                    </div>

                    {!keyboardActive && (
                      <div
                        className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3"
                      >
                        {onSetRepeat && (
                          <PropertyChip
                            dataHint="repeat-button"
                            active={isRepeating}
                            icon={<Repeat className="h-4 w-4" />}
                            onClick={() => setShowRepeat(true)}
                          >
                            {isRepeating ? repeatChipLabel : 'Repeat'}
                          </PropertyChip>
                        )}
                        {onSchedule && (
                          <PropertyChip
                            active={!!displayTask.startTime || !!displayTask.reminder}
                            icon={<Bell className="h-4 w-4" />}
                            onClick={onSchedule}
                          >
                            {displayTask.startTime ? (
                              <span className="tabular-nums">
                                {displayTask.startTime}
                              </span>
                            ) : (
                              'Remind me'
                            )}
                          </PropertyChip>
                        )}
                        {onAddTags && (
                          <span
                            data-hint="task-tags-button"
                            data-tag-ids={taskTags.join(',') || undefined}
                            className="inline-flex flex-wrap items-center gap-1.5"
                          >
                            {taskTags.some((id) => tagDetails(id)) ? (
                              taskTags.map((tagId) => {
                                const t = tagDetails(tagId);
                                if (!t) return null;
                                return (
                                  <button
                                    key={tagId}
                                    type="button"
                                    onClick={onAddTags}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-black transition-transform active:scale-95"
                                    style={{
                                      backgroundColor: `${t.color}1a`,
                                      color: t.color,
                                      borderColor: `${t.color}40`,
                                    }}
                                  >
                                    <Tag className="h-3.5 w-3.5" />
                                    {t.name}
                                  </button>
                                );
                              })
                            ) : (
                              <PropertyChip
                                icon={<Tag className="h-4 w-4" />}
                                onClick={onAddTags}
                              >
                                Tag
                              </PropertyChip>
                            )}
                          </span>
                        )}
                        {canShareWithBuddy && !buddy && (
                          <PropertyChip
                            tone="buddy"
                            icon={<Users className="h-4 w-4" strokeWidth={2.5} />}
                            onClick={() => setShowBuddyInvite(true)}
                          >
                            Do with a friend
                          </PropertyChip>
                        )}
                      </div>
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
                          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border/60 bg-muted/40 text-[13px] font-black tracking-tight text-muted-foreground transition-transform active:scale-[0.99] disabled:opacity-60"
                        >
                          <Clock className="h-4 w-4" strokeWidth={2.5} />
                          Cancel invite to {buddy.partnerName}
                        </button>
                      )}
                  </>
                )}
              </div>
            </div>

            {/* Duplicate options — completed + past tasks */}
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

            {/* Primary action — the chunky CTA, twin of Add Task */}
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
              <button
                onClick={runAndClose(onComplete)}
                disabled={!onComplete}
                className={[
                  'group relative h-14 w-full shrink-0 overflow-hidden rounded-[28px] text-[17px] font-black transition-all',
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
                      {taskFlies}
                    </span>
                  )}
                </span>
              </button>
            )}

            {/* Secondary actions */}
            {!minimal &&
              !keyboardActive &&
              (onStartTimer || (isRepeating && onSkipToday) || onDoLater) && (
                <div className="flex shrink-0 gap-2.5">
                  {onStartTimer && (
                    <TaskFocusButton
                      taskId={displayTask?.id ?? ''}
                      onClick={runAndClose(onStartTimer)}
                    />
                  )}
                  {isRepeating && onSkipToday ? (
                    <SecondaryButton
                      label="Skip today"
                      onClick={runAndClose(onSkipToday)}
                      icon={<EyeOff className="h-5 w-5 text-muted-foreground" />}
                    />
                  ) : onDoLater ? (
                    <SecondaryButton
                      label="Save for later"
                      onClick={runAndClose(onDoLater)}
                      icon={
                        <AppIcon
                          name="saved"
                          label="Save for later"
                          className="h-8 w-8"
                        />
                      }
                      dataHint="save-later-button"
                    />
                  ) : null}
                </div>
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

function PropertyChip({
  icon,
  active = false,
  tone = 'default',
  onClick,
  dataHint,
  children,
}: {
  icon: React.ReactNode;
  active?: boolean;
  tone?: 'default' | 'buddy';
  onClick: () => void;
  dataHint?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-hint={dataHint}
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold transition-[transform,background-color,color] active:scale-95 ${
        tone === 'buddy'
          ? 'bg-[#4f9149]/10 text-[#4f9149] [@media(hover:hover)]:hover:bg-[#4f9149]/[0.16]'
          : active
            ? 'bg-primary/10 text-primary [@media(hover:hover)]:hover:bg-primary/15'
            : 'bg-muted/70 text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground'
      }`}
    >
      <span className="flex shrink-0">{icon}</span>
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}

function SecondaryButton({
  label,
  icon,
  onClick,
  dataHint,
  activePhase = null,
}: {
  label: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  dataHint?: string;
  activePhase?: 'focus' | 'break' | null;
}) {
  return (
    <button
      onClick={onClick}
      data-hint={dataHint}
      className={`flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[22px] text-[14px] font-black ring-1 transition-all active:translate-y-0.5 active:shadow-none [@media(hover:hover)]:hover:-translate-y-0.5 ${
        activePhase === 'focus'
          ? 'bg-[#4f9149] text-white ring-[#34631f]/50 shadow-[0_3px_0_0_#34631f] [@media(hover:hover)]:hover:shadow-[0_4px_0_0_#34631f]'
          : activePhase === 'break'
            ? 'bg-sky-500 text-white ring-sky-700/50 shadow-[0_3px_0_0_#0369a1] [@media(hover:hover)]:hover:shadow-[0_4px_0_0_#0369a1] dark:bg-sky-700'
            : 'bg-popover text-foreground ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.18)] [@media(hover:hover)]:hover:shadow-[0_4px_0_0_rgba(0,0,0,0.18)]'
      }`}
    >
      <span className="flex shrink-0 items-center">{icon}</span>
      <span className="truncate">{label}</span>
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
    <SecondaryButton
      activePhase={isFocusing ? phase : null}
      label={
        isFocusing ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[clamp(11px,3.3vw,14px)] max-[380px]:gap-1">
            <span>{phase === 'break' ? 'On break' : 'Focusing'}</span>
            <span className="tabular-nums text-white/90">
              {formatTimer(timeLeft)}
            </span>
          </span>
        ) : (
          'Focus timer'
        )
      }
      onClick={onClick}
      icon={
        isFocusing ? (
          <TimerClockIcon
            running={isRunning}
            className="h-8 w-8 max-[360px]:hidden"
          />
        ) : (
          <AppIcon name="clock" label="Focus timer" className="h-8 w-8" />
        )
      }
      dataHint="focus-button"
    />
  );
}
