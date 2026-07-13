'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronUp,
  EyeOff,
  Flame,
  ListChecks,
  Pen,
  Pencil,
  Plus,
  Repeat,
  RotateCcw,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { Icon as AppIcon } from '@/components/ui/Icon';
import { BaseSheet } from '@/components/ui/BaseSheet';
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
import { randomUUID } from '@/lib/uuid';
import { TaskRepeatPopup } from './TaskRepeatPopup';
import RichNotesEditor from './RichNotesEditor';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Common-sense limits for the task card.
const ITEM_MAX = 120;
const MAX_ITEMS = 20;
const PREVIEW_ITEMS = 3;

export interface TaskDetailTask {
  id: string;
  text: string;
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

const newId = () => randomUUID();

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
  const [newItem, setNewItem] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tab, setTab] = useState<'notes' | 'checklist'>('notes');
  const [expanded, setExpanded] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);

  const newItemRef = useRef<HTMLInputElement>(null);

  // Seed local state only when a *different* task opens — not on every task
  // object change. Otherwise persisting a checklist edit re-runs this and snaps
  // the tab back to Notes.
  useEffect(() => {
    if (open && task) {
      setNotes(task.notes ?? '');
      setChecklist(task.checklist ?? []);
      setNewItem('');
      setEditingId(null);
      const hasNotes = !!(task.notes ?? '').trim();
      const hasChecklist = (task.checklist?.length ?? 0) > 0;
      setTab(hasNotes || !hasChecklist ? 'notes' : 'checklist');
      setExpanded(false);
      setShowRepeat(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  const tagDetails = useMemo(() => {
    const byId = new Map(tags.map((t) => [t.id, t] as const));
    const byName = new Map(tags.map((t) => [t.name, t] as const));
    return (id: string) => byId.get(id) ?? byName.get(id);
  }, [tags]);

  const buddyByTaskId = useBuddyState(open);
  const buddy = displayTask ? buddyByTaskId[displayTask.id] : undefined;

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

  const close = () => onOpenChange(false);
  const runAndClose = (fn?: () => void) => () => {
    fn?.();
    close();
  };

  const persist = (next: { notes?: string; checklist?: ChecklistItem[] }) =>
    onUpdateDetails?.(next);

  const commitNotes = () => {
    if ((displayTask.notes ?? '') !== notes) persist({ notes });
  };

  const openEditor = (which: 'notes' | 'checklist') => {
    setTab(which);
    setExpanded(true);
  };

  const collapseEditor = () => {
    commitNotes();
    setExpanded(false);
  };

  const setAndPersistChecklist = (next: ChecklistItem[]) => {
    setChecklist(next);
    persist({ checklist: next });
  };

  const addItem = () => {
    const text = newItem.trim().slice(0, ITEM_MAX);
    if (!text || checklist.length >= MAX_ITEMS) return;
    setAndPersistChecklist([...checklist, { id: newId(), text, done: false }]);
    setNewItem('');
  };

  const toggleItem = (id: string) =>
    setAndPersistChecklist(
      checklist.map((it) => (it.id === id ? { ...it, done: !it.done } : it)),
    );

  const editItem = (id: string, text: string) =>
    setChecklist((cur) =>
      cur.map((it) => (it.id === id ? { ...it, text } : it)),
    );

  const removeItem = (id: string) =>
    setAndPersistChecklist(checklist.filter((it) => it.id !== id));

  const doneCount = checklist.filter((it) => it.done).length;
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
  const streak = displayTask.streak ?? 0;

  const taskTags = displayTask.tags ?? [];
  const hasContent = !!notesText || checklist.length > 0;
  const hasMeta =
    isCompleted ||
    !!displayTask.startTime ||
    (isRepeating && streak > 0) ||
    !!buddy ||
    (minimal && isRepeating) ||
    taskTags.length > 0;

  const chipBase =
    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black leading-none';

  return (
    <>
      <BaseSheet
        open={open}
        onOpenChange={onOpenChange}
        className="sm:max-w-md max-h-[92vh] !border-0 !bg-transparent !shadow-none"
        zIndex={1400}
        hideHandle
        showClose={false}
      >
        {({ bindScroll, dragControls }) => (
          <div
            ref={bindScroll}
            className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden px-3 pt-1 pb-[calc(env(safe-area-inset-bottom)+14px)] sm:pb-2"
          >
            {/* Main card — mirrors the QuickAddSheet shell */}
            <div
              className="relative flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[28px] bg-popover ring-1 ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.18)]"
            >
              <div
                onPointerDown={(e) => dragControls.start(e)}
                className="flex h-7 shrink-0 items-center justify-center touch-none cursor-grab active:cursor-grabbing sm:hidden"
              >
                <div className="h-1.5 w-10 rounded-full bg-muted-foreground/25" />
              </div>

              <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 sm:right-4 sm:top-4">
                {isCompleted && onDelete && (
                  <button
                    onClick={runAndClose(onDelete)}
                    aria-label="Delete task"
                    title="Delete"
                    className="grid h-8 w-8 place-items-center rounded-full bg-rose-500/10 text-rose-500 transition-colors hover:bg-rose-500/20"
                  >
                    <Trash2 size={15} />
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
                <div className={isCompleted && onDelete ? 'pr-[76px]' : 'pr-9'}>
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
                    {displayTask.startTime && (
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
                    {buddy && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-[#4f9149]/10 py-0.5 pl-0.5 pr-2"
                        title={`Shared with ${buddy.partnerName}`}
                      >
                        <BuddyFrogFace indices={buddy.partnerIndices} size={20} />
                        <span className="text-[11px] font-black leading-none text-[#4f9149]">
                          With {buddy.partnerName}
                        </span>
                      </span>
                    )}
                    {taskTags.map((tagId) => {
                      const t = tagDetails(tagId);
                      if (!t) return null;
                      return (
                        <button
                          key={tagId}
                          onClick={!minimal && onAddTags ? onAddTags : undefined}
                          disabled={minimal || !onAddTags}
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide leading-4 disabled:pointer-events-none"
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

                    {!expanded && (
                      <div className="flex flex-col pt-2.5">
                        {hasContent ? (
                          <>
                            {notesText && (
                              <button
                                onClick={() => openEditor('notes')}
                                className="flex items-start gap-2.5 rounded-xl px-1 py-1.5 text-left transition-colors [@media(hover:hover)]:hover:bg-muted/40"
                              >
                                <Pen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
                                <span className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-snug text-muted-foreground">
                                  {notesText}
                                </span>
                              </button>
                            )}
                            {checklist.slice(0, PREVIEW_ITEMS).map((it) => (
                              <div
                                key={it.id}
                                className="flex items-center gap-2.5 rounded-xl px-1 py-1.5"
                              >
                                <button
                                  onClick={() => toggleItem(it.id)}
                                  aria-label={it.done ? 'Mark not done' : 'Mark done'}
                                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors ${
                                    it.done
                                      ? 'border-primary bg-primary text-primary-foreground'
                                      : 'border-muted-foreground/40 text-transparent hover:border-primary/60'
                                  }`}
                                >
                                  <Check className="h-3 w-3" strokeWidth={3.5} />
                                </button>
                                <button
                                  onClick={() => openEditor('checklist')}
                                  className={`min-w-0 flex-1 truncate text-left text-[14px] leading-snug transition-colors ${
                                    it.done
                                      ? 'text-muted-foreground line-through'
                                      : 'text-foreground'
                                  }`}
                                >
                                  {it.text}
                                </button>
                              </div>
                            ))}
                            {checklist.length > PREVIEW_ITEMS && (
                              <button
                                onClick={() => openEditor('checklist')}
                                className="rounded-xl px-1 py-1 text-left text-[12px] font-bold text-primary"
                              >
                                +{checklist.length - PREVIEW_ITEMS} more ·{' '}
                                <span className="tabular-nums">
                                  {doneCount}/{checklist.length} done
                                </span>
                              </button>
                            )}
                          </>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditor('notes')}
                              className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 text-[12px] font-bold text-muted-foreground transition-colors active:scale-[0.98] [@media(hover:hover)]:hover:bg-muted/60 [@media(hover:hover)]:hover:text-foreground"
                            >
                              <Pen className="h-3.5 w-3.5 shrink-0" />
                              Add notes
                            </button>
                            <button
                              onClick={() => openEditor('checklist')}
                              className="flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 text-[12px] font-bold text-muted-foreground transition-colors active:scale-[0.98] [@media(hover:hover)]:hover:bg-muted/60 [@media(hover:hover)]:hover:text-foreground"
                            >
                              <ListChecks className="h-4 w-4 shrink-0" />
                              Add checklist
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {expanded && (
                      <div className="mt-3 flex h-[min(320px,40dvh)] shrink-0 flex-col">
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="flex flex-1 gap-1 rounded-full bg-muted/70 p-1">
                            <TabButton
                              active={tab === 'notes'}
                              onClick={() => setTab('notes')}
                            >
                              Notes
                            </TabButton>
                            <TabButton
                              active={tab === 'checklist'}
                              onClick={() => setTab('checklist')}
                            >
                              Checklist
                              {checklist.length > 0 && (
                                <span className="ml-1 tabular-nums opacity-70">
                                  {doneCount}/{checklist.length}
                                </span>
                              )}
                            </TabButton>
                          </div>
                          <button
                            onClick={collapseEditor}
                            aria-label="Collapse"
                            title="Collapse"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <ChevronUp className="h-[18px] w-[18px]" />
                          </button>
                        </div>

                        <div className="mt-3 flex min-h-0 flex-1 flex-col">
                          {tab === 'notes' ? (
                            <RichNotesEditor
                              value={notes}
                              onChange={setNotes}
                              onBlur={commitNotes}
                            />
                          ) : (
                            <div className="flex min-h-0 flex-1 flex-col">
                              {checklist.length > 0 ? (
                                <div className="mb-3 flex shrink-0 items-center gap-2.5">
                                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                                      style={{
                                        width: `${(doneCount / checklist.length) * 100}%`,
                                      }}
                                    />
                                  </div>
                                  <span className="shrink-0 text-[12px] font-bold tabular-nums text-muted-foreground">
                                    {doneCount}/{checklist.length}
                                  </span>
                                  <span
                                    title="Each checked step adds a bonus fly when you complete the task"
                                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[12px] font-black tabular-nums leading-none text-primary"
                                  >
                                    <Fly size={16} y={-1} interactive={false} paused={doneCount === 0} />
                                    +{doneCount}
                                  </span>
                                </div>
                              ) : (
                                <div className="mb-2 flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl bg-muted/30 px-6 py-4 text-center">
                                  <Fly size={38} y={-2} interactive={false} />
                                  <p className="text-[14px] font-black text-foreground">
                                    Break it into steps
                                  </p>
                                  <p className="text-[12px] font-medium leading-snug text-muted-foreground">
                                    Each step you check off adds{' '}
                                    <span className="font-black text-primary">+1 fly</span>{' '}
                                    when you complete the task.
                                  </p>
                                </div>
                              )}

                              <div
                                className={`min-h-0 overflow-y-auto ${
                                  checklist.length > 0 ? 'flex-1' : 'shrink-0'
                                }`}
                              >
                                <div className="space-y-2">
                                {checklist.map((it) => {
                                  const isEditing = editingId === it.id;
                                  return (
                                    <div
                                      key={it.id}
                                      className={`group flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 transition-all focus-within:border-primary/50 focus-within:bg-card ${
                                        it.done
                                          ? 'border-primary/30 bg-primary/[0.06]'
                                          : 'border-border/50 bg-muted/30 hover:bg-muted/50'
                                      }`}
                                    >
                                      <button
                                        onClick={() => toggleItem(it.id)}
                                        aria-label={it.done ? 'Mark not done' : 'Mark done'}
                                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition-colors ${
                                          it.done
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-muted-foreground/40 text-transparent hover:border-primary/60'
                                        }`}
                                      >
                                        <Check className="h-4 w-4" strokeWidth={3} />
                                      </button>

                                      {isEditing ? (
                                        <input
                                          autoFocus
                                          value={it.text}
                                          maxLength={ITEM_MAX}
                                          onChange={(e) => editItem(it.id, e.target.value)}
                                          onBlur={() => {
                                            persist({ checklist });
                                            setEditingId(null);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === 'Escape') {
                                              e.preventDefault();
                                              e.currentTarget.blur();
                                            }
                                          }}
                                          className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground focus:outline-none sm:text-[15px]"
                                        />
                                      ) : (
                                        <button
                                          onClick={() => setEditingId(it.id)}
                                          className={`min-w-0 flex-1 break-words text-left text-[16px] transition-colors sm:text-[15px] ${
                                            it.done
                                              ? 'text-muted-foreground line-through'
                                              : 'text-foreground'
                                          }`}
                                        >
                                          {it.text || (
                                            <span className="text-muted-foreground/50">
                                              Untitled step
                                            </span>
                                          )}
                                        </button>
                                      )}

                                      {isEditing ? (
                                        <button
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() => {
                                            persist({ checklist });
                                            setEditingId(null);
                                          }}
                                          aria-label="Done editing"
                                          className="shrink-0 rounded-lg p-1.5 text-primary transition-colors hover:bg-primary/10"
                                        >
                                          <Check className="h-[18px] w-[18px]" strokeWidth={3} />
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => removeItem(it.id)}
                                          aria-label="Remove item"
                                          className="shrink-0 rounded-lg p-1.5 text-muted-foreground/40 transition-opacity hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100"
                                        >
                                          <X className="h-4 w-4" />
                                        </button>
                                      )}
                                      <Fly
                                        size={26}
                                        y={-2}
                                        interactive={false}
                                        paused={!it.done}
                                        className={`shrink-0 transition-all duration-300 ${
                                          it.done ? 'opacity-100' : 'opacity-30 grayscale'
                                        }`}
                                      />
                                    </div>
                                  );
                                })}
                                </div>

                              {checklist.length < MAX_ITEMS && (
                                <div className="mt-2 flex shrink-0 items-center gap-3 rounded-2xl border-2 border-dashed border-border/60 px-3 py-2.5 transition-colors focus-within:border-primary/50">
                                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 border-dashed border-muted-foreground/40 text-muted-foreground">
                                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                                  </span>
                                  <input
                                    ref={newItemRef}
                                    value={newItem}
                                    maxLength={ITEM_MAX}
                                    onChange={(e) => setNewItem(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addItem();
                                      }
                                    }}
                                    onBlur={addItem}
                                    placeholder="Add an item…"
                                    className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none sm:text-[15px]"
                                  />
                                  {newItem.trim() && (
                                    <button
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={addItem}
                                      className="shrink-0 rounded-lg bg-primary px-3 py-1 text-[13px] font-black text-primary-foreground transition-transform active:scale-95"
                                    >
                                      Add
                                    </button>
                                  )}
                                </div>
                              )}

                              {checklist.length >= MAX_ITEMS && (
                                <p className="mt-2 px-1 text-[11px] font-bold text-muted-foreground">
                                  Maximum {MAX_ITEMS} items reached.
                                </p>
                              )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Toolbar — same anatomy as the QuickAddSheet bottom row */}
                    <div className="mt-3 flex shrink-0 items-center gap-1.5">
                      {onSetRepeat && (
                        <button
                          data-hint="repeat-button"
                          onClick={() => setShowRepeat(true)}
                          className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition-transform active:scale-95 ${
                            isRepeating
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted/70 text-muted-foreground [@media(hover:hover)]:hover:text-foreground'
                          }`}
                        >
                          <Repeat className="h-4 w-4 shrink-0" />
                          <span className="whitespace-nowrap">
                            {isRepeating ? repeatChipLabel : 'Repeat'}
                          </span>
                        </button>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        {onSchedule && (
                          <ToolbarIconButton
                            label="Reminder"
                            active={!!displayTask.reminder}
                            onClick={onSchedule}
                          >
                            <Bell className="h-5 w-5" />
                          </ToolbarIconButton>
                        )}
                        {onAddTags && (
                          <span data-hint="task-tags-button" className="inline-flex">
                            <ToolbarIconButton
                              label="Tags"
                              active={taskTags.length > 0}
                              onClick={onAddTags}
                            >
                              <Tag className="h-5 w-5" />
                            </ToolbarIconButton>
                          </span>
                        )}
                        {onDelete && (
                          <button
                            onClick={runAndClose(onDelete)}
                            aria-label="Delete task"
                            title="Delete"
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-rose-500/80 transition-colors active:scale-95 [@media(hover:hover)]:hover:bg-rose-500/10 [@media(hover:hover)]:hover:text-rose-500"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Duplicate options — completed + past tasks */}
            {minimal && onDuplicate && (
              <div className="shrink-0 rounded-[28px] bg-popover p-3 ring-1 ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.18)]">
                <p className="mb-2 text-center text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
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
            {isCompleted ? (
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
                  {!!onComplete && doneCount > 0 && (
                    <span
                      title={`Worth ${doneCount + 1} flies — 1 + ${doneCount} checked steps`}
                      className="rounded-full bg-white/25 px-2 py-1 text-[13px] font-black leading-none tabular-nums"
                    >
                      ×{doneCount + 1}
                    </span>
                  )}
                </span>
              </button>
            )}

            {/* Secondary actions */}
            {!minimal &&
              (onStartTimer || (isRepeating && onSkipToday) || onDoLater) && (
                <div className="flex shrink-0 gap-2.5">
                  {onStartTimer && (
                    <SecondaryButton
                      label="Focus"
                      onClick={runAndClose(onStartTimer)}
                      icon={
                        <AppIcon name="clock" label="Focus" className="h-6 w-6" />
                      }
                      dataHint="focus-button"
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
                          className="h-5 w-5"
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

function ToolbarIconButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors active:scale-95 ${
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  label,
  icon,
  onClick,
  dataHint,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  dataHint?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-hint={dataHint}
      className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[22px] bg-popover text-[14px] font-black text-foreground ring-1 ring-border/80 shadow-[0_3px_0_0_rgba(0,0,0,0.18)] transition-all active:translate-y-0.5 active:shadow-none [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[0_4px_0_0_rgba(0,0,0,0.18)]"
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 text-[13px] font-black transition-colors ${
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
