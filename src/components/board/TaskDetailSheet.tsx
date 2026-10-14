'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  FileText,
  ListChecks,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Pencil,
  Repeat,
  RotateCcw,
  SkipForward,
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
import {
  LeapStageMark,
  StepPips,
  StreakFlame,
} from '@/components/ui/TaskAdornments';
import { useLeapView } from '@/components/leap/useLeapView';
import { leagueName, leagueTitle } from '@/components/leap/leapCopy';
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
  const [addingSteps, setAddingSteps] = useState(false);
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
      setAddingSteps(false);
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
  const { data: leapView } = useLeapView(open);
  const router = useRouter();

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
  const showLeap = isRepeating && !!leapView?.enabled;
  const hasMeta =
    isCompleted ||
    showLeap ||
    (isRepeating && streak > 0) ||
    (minimal &&
      (!!buddy || isRepeating || !!displayTask.startTime || taskTags.length > 0));
  const buddyFirstName =
    buddy?.partnerName?.trim().split(/\s+/)[0] || 'your buddy';
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
            className={`flex flex-1 min-h-0 flex-col gap-3 overflow-hidden px-3 pt-1 sm:px-1.5 ${
              keyboardActive
                ? 'pb-2'
                : 'pb-[calc(env(safe-area-inset-bottom)+14px)] sm:pb-3'
            }`}
          >
            <div className="relative flex min-h-0 flex-col overflow-hidden rounded-[28px] bg-popover ring-1 ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.18)] sm:shadow-[0_3px_0_0_rgba(0,0,0,0.18),0_24px_56px_-18px_rgba(0,0,0,0.45)]">
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
                      <span className="text-[22px] font-black leading-[28px] tracking-tight text-foreground sm:text-[23px] sm:leading-[29px] short:text-[19px] short:leading-[24px] narrow:text-[19px] narrow:leading-[24px]">
                        {displayTask.text}
                        <Pencil className="mb-1 ml-2 inline-block h-3.5 w-3.5 text-muted-foreground/35 transition-colors group-hover:text-muted-foreground" />
                      </span>
                    </button>
                  ) : (
                    <span className="block text-[22px] font-black leading-[28px] tracking-tight text-foreground sm:text-[23px] sm:leading-[29px] short:text-[19px] short:leading-[24px] narrow:text-[19px] narrow:leading-[24px]">
                      {displayTask.text}
                    </span>
                  )}
                </div>

                {hasMeta && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[13px] font-black short:mt-1.5">
                    {isCompleted && (
                      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-green-500/10 px-2.5 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        Completed
                      </span>
                    )}
                    {showLeap && leapView && (
                      <button
                        type="button"
                        onClick={runAndClose(() => router.push('/quests#leap'))}
                        className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#447d3f]/10 pl-1.5 pr-2.5 text-[#3d7a38] transition active:scale-95 dark:text-emerald-400"
                      >
                        <LeapStageMark />
                        {leagueTitle(leagueName(leapView))}
                      </button>
                    )}
                    {isRepeating && streak > 0 && (
                      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-orange-500/10 px-2.5 text-orange-600 dark:text-orange-400">
                        <StreakFlame />
                        <span className="tabular-nums">{streak} in a row</span>
                      </span>
                    )}
                    {minimal && buddy && (
                      <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#447d3f]/10 pl-1 pr-2.5 text-[#3d7a38] dark:text-emerald-400">
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
                      className="-mx-2 mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2 pb-1 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-width:thin] short:mt-2"
                    >
                      {(() => {
                        const notesShown = editingNotes || !!notesText;
                        const stepsShown = checklist.length > 0 || addingSteps;
                        const emptyTiles = [
                          !stepsShown && (
                            <PropertyTile
                              key="steps"
                              tint="teal"
                              icon={<ListChecks className="h-4 w-4" strokeWidth={2.5} />}
                              placeholder
                              onClick={() => setAddingSteps(true)}
                            >
                              Add steps
                            </PropertyTile>
                          ),
                          !notesShown && (
                            <PropertyTile
                              key="notes"
                              tint="sky"
                              icon={<FileText className="h-4 w-4" strokeWidth={2.5} />}
                              placeholder
                              onClick={() => setEditingNotes(true)}
                            >
                              Add notes
                            </PropertyTile>
                          ),
                        ].filter(Boolean);
                        return (
                          <div className="flex flex-col gap-2">
                            {stepsShown && (
                              <SectionCard
                                tint="teal"
                                icon={<ListChecks className="h-3.5 w-3.5" strokeWidth={2.75} />}
                                title="Steps"
                                aside={
                                  checklist.length > 0 ? (
                                    <span className="flex items-center gap-2">
                                      <span className="text-[12px] font-bold tabular-nums text-muted-foreground">
                                        {stepsDone}/{rewardItems.length}
                                      </span>
                                      <StepPips items={rewardItems} done={stepsDone} />
                                    </span>
                                  ) : null
                                }
                              >
                                <ChecklistEditor
                                  hideRewardTrack
                                  autoFocus={checklist.length === 0 ? 'new' : null}
                                  items={checklist}
                                  onChange={(next, { persist: persistNow }) => {
                                    setChecklist(next);
                                    if (persistNow) persist({ checklist: next });
                                  }}
                                />
                                {rewardHint && (
                                  <p className="flex min-w-0 items-center gap-1.5 px-2 pb-1 pt-0.5 text-[12px] font-semibold text-muted-foreground">
                                    <span className="grid h-4 w-4 shrink-0 place-items-center">
                                      <Fly size={18} x={-1} y={-2} interactive={false} paused />
                                    </span>
                                    <span className="min-w-0 truncate">{rewardHint}</span>
                                  </p>
                                )}
                              </SectionCard>
                            )}

                            {notesShown && (
                              <SectionCard
                                tint="sky"
                                icon={<FileText className="h-3.5 w-3.5" strokeWidth={2.75} />}
                                title="Notes"
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
                                ) : (
                                  <NotesView
                                    value={notes}
                                    onEdit={() => setEditingNotes(true)}
                                  />
                                )}
                              </SectionCard>
                            )}

                            {emptyTiles.length > 0 && (
                              <div
                                className={`grid gap-2 ${emptyTiles.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
                              >
                                {emptyTiles}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                    </div>

                    {!keyboardActive &&
                      (onSetRepeat || onSchedule || onAddTags || canShareWithBuddy) && (
                        <div className="mt-3 grid shrink-0 grid-cols-2 gap-2 short:mt-2 short:gap-1.5 narrow:gap-1.5">
                          {onSetRepeat && (
                            <PropertyTile
                              dataHint="repeat-button"
                              tint="green"
                              icon={<Repeat className="h-4 w-4" strokeWidth={2.5} />}
                              placeholder={!isRepeating}
                              onClick={() => setShowRepeat(true)}
                            >
                              {isRepeating ? repeatChipLabel : 'Repeat'}
                            </PropertyTile>
                          )}
                          {onSchedule && (
                            <PropertyTile
                              tint="amber"
                              icon={<Bell className="h-4 w-4" strokeWidth={2.5} />}
                              placeholder={!displayTask.startTime}
                              onClick={onSchedule}
                            >
                              {displayTask.startTime ? (
                                <span className="min-w-0 truncate tabular-nums">
                                  {displayTask.endTime &&
                                  displayTask.endTime !== displayTask.startTime
                                    ? `${displayTask.startTime}–${displayTask.endTime}`
                                    : displayTask.startTime}
                                </span>
                              ) : (
                                'Remind me'
                              )}
                            </PropertyTile>
                          )}
                          {onAddTags && (
                            <PropertyTile
                              dataHint="task-tags-button"
                              dataTagIds={taskTags.join(',') || undefined}
                              tint="violet"
                              icon={<Tag className="h-4 w-4" strokeWidth={2.5} />}
                              placeholder={!taskTags.some((id) => tagDetails(id))}
                              onClick={onAddTags}
                            >
                              {(() => {
                                const shown = taskTags
                                  .map((id) => tagDetails(id))
                                  .filter((t): t is NonNullable<typeof t> => !!t);
                                if (shown.length === 0) return 'Add tag';
                                return (
                                  <span className="flex min-w-0 items-center gap-1.5">
                                    <span
                                      aria-hidden
                                      className="h-2 w-2 shrink-0 rounded-full"
                                      style={{ backgroundColor: shown[0].color }}
                                    />
                                    <span className="min-w-0 truncate">{shown[0].name}</span>
                                    {shown.length > 1 && (
                                      <span className="shrink-0 text-muted-foreground">
                                        +{shown.length - 1}
                                      </span>
                                    )}
                                  </span>
                                );
                              })()}
                            </PropertyTile>
                          )}
                          {canShareWithBuddy && (
                            <PropertyTile
                              tint="buddy"
                              icon={
                                buddy ? (
                                  <BuddyFrogFace
                                    indices={buddy.partnerIndices}
                                    size={28}
                                  />
                                ) : (
                                  <Users className="h-4 w-4" strokeWidth={2.5} />
                                )
                              }
                              bareIcon={!!buddy}
                              placeholder={!buddy}
                              onClick={
                                buddy ? undefined : () => setShowBuddyInvite(true)
                              }
                            >
                              {buddy
                                ? buddy.status === 'pending'
                                  ? `Waiting for ${buddyFirstName}`
                                  : buddyDoneToday
                                    ? `${buddyFirstName} · done`
                                    : `With ${buddyFirstName}`
                                : 'With a friend'}
                            </PropertyTile>
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
                          className="mt-1.5 self-center rounded-full px-3 py-1.5 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                        >
                          Cancel invite to {buddy.partnerName}
                        </button>
                      )}
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
              <div className="relative flex shrink-0 flex-col gap-2.5">
                {!minimal &&
                  (onStartTimer || (isRepeating && onSkipToday) || onDoLater) && (
                    <div className="relative flex overflow-hidden rounded-[20px] bg-popover ring-1 ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.18)]">
                      {onStartTimer && (
                        <TaskFocusButton
                          taskId={displayTask?.id ?? ''}
                          onClick={runAndClose(onStartTimer)}
                        />
                      )}
                      {onStartTimer &&
                        ((isRepeating && onSkipToday) || onDoLater) && (
                          <span
                            aria-hidden
                            className="my-3 w-px shrink-0 bg-border/80"
                          />
                        )}
                      {((isRepeating && onSkipToday) || onDoLater) && (
                        <button
                          type="button"
                          onClick={runAndClose(
                            isRepeating && onSkipToday ? onSkipToday : onDoLater,
                          )}
                          data-hint={
                            isRepeating && onSkipToday ? undefined : 'save-later-button'
                          }
                          aria-label={isRepeating && onSkipToday ? 'Skip today' : 'Save for later'}
                          className={SIDE_ACTION_CLASS}
                        >
                          {isRepeating && onSkipToday ? (
                            <SkipForward className="h-5 w-5 text-muted-foreground" strokeWidth={2.5} />
                          ) : (
                            <AppIcon name="saved" className="h-6 w-6" />
                          )}
                          {isRepeating && onSkipToday ? 'Skip today' : 'Later'}
                        </button>
                      )}
                    </div>
                  )}
                <button
                  onClick={runAndClose(onComplete)}
                  disabled={!onComplete}
                  className={[
                    'group relative h-14 w-full overflow-hidden rounded-[22px] text-[17px] font-black transition-all short:h-12 narrow:text-[15px] short:text-[15px]',
                    'bg-[#447d3f] text-white',
                    'shadow-[0_4px_0_0_#2c511a] ring-1 ring-[#2c511a]/40',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#447d3f]/40',
                    '[@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[0_5px_0_0_#2c511a] active:translate-y-1 active:shadow-none',
                    'disabled:pointer-events-none disabled:opacity-60 disabled:grayscale',
                  ].join(' ')}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/90 shadow-sm short:h-8 short:w-8 narrow:h-8 narrow:w-8">
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

function SectionCard({
  icon,
  tint,
  title,
  aside,
  children,
}: {
  icon: React.ReactNode;
  tint: keyof typeof PROPERTY_TINT;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-muted/50 p-1.5">
      <div className="flex h-9 items-center gap-2 pl-1 pr-2">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${PROPERTY_TINT[tint]}`}
        >
          {icon}
        </span>
        <span className="text-[14px] font-black text-foreground">{title}</span>
        {aside && <span className="ml-auto">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

const SIDE_ACTION_CLASS =
  'flex h-12 min-w-0 flex-1 items-center justify-center gap-2 text-[15px] font-black leading-none text-foreground transition-colors active:bg-muted/70 [@media(hover:hover)]:hover:bg-muted/40 short:h-11 short:text-[14px]';

const PROPERTY_TINT = {
  sky: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  teal: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
  green: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  buddy: 'bg-[#447d3f]/15 text-[#447d3f] dark:text-emerald-400',
} as const;

function PropertyTile({
  icon,
  tint,
  onClick,
  dataHint,
  dataTagIds,
  placeholder = false,
  bareIcon = false,
  children,
}: {
  icon: React.ReactNode;
  tint: keyof typeof PROPERTY_TINT;
  onClick?: () => void;
  dataHint?: string;
  dataTagIds?: string;
  placeholder?: boolean;
  bareIcon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-hint={dataHint}
      data-tag-ids={dataTagIds}
      onClick={onClick}
      disabled={!onClick}
      className="flex h-12 min-w-0 items-center gap-2 rounded-2xl bg-muted/50 pl-1.5 pr-3 text-left text-[13.5px] font-bold transition-colors disabled:cursor-default enabled:active:bg-muted [@media(hover:hover)]:enabled:hover:bg-muted short:h-11 narrow:h-11 narrow:gap-1.5 narrow:pr-2.5 narrow:text-[13px]"
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl short:h-8 short:w-8 narrow:h-8 narrow:w-8 ${
          bareIcon ? '' : PROPERTY_TINT[tint]
        }`}
      >
        {icon}
      </span>
      <span
        className={`flex min-w-0 flex-1 items-center ${
          placeholder ? 'text-muted-foreground' : 'text-foreground'
        }`}
      >
        {typeof children === 'string' ? (
          <span className="min-w-0 truncate">{children}</span>
        ) : (
          children
        )}
      </span>
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
      className={
        isFocusing
          ? `flex h-12 min-w-0 flex-1 items-center justify-center gap-2 text-[15px] font-black leading-none tabular-nums text-white transition-colors short:h-11 short:text-[14px] ${
              phase === 'focus'
                ? 'bg-[#447d3f] active:bg-[#3b6d37]'
                : 'bg-sky-500 active:bg-sky-600 dark:bg-sky-700'
            }`
          : SIDE_ACTION_CLASS
      }
    >
      {isFocusing ? (
        <TimerClockIcon running={isRunning} className="h-6 w-6" />
      ) : (
        <AppIcon name="clock" label="Focus timer" className="h-6 w-6" />
      )}
      {isFocusing ? formatTimer(timeLeft) : 'Focus'}
    </button>
  );
}
