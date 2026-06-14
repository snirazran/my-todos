'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronRight,
  ChevronUp,
  EyeOff,
  Flame,
  ListChecks,
  Pen,
  Pencil,
  Plus,
  Repeat,
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
import { TaskRepeatPopup } from './TaskRepeatPopup';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Common-sense limits for the task card.
const NOTES_MAX = 1000;
const ITEM_MAX = 120;
const MAX_ITEMS = 20;

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
  /** Duplicate a completed task onto a new day. */
  onDuplicate?: (when: 'today' | 'tomorrow') => void;
  /** Date (YYYY-MM-DD) a new monthly repeat should anchor to. Defaults to today. */
  monthlyAnchorYmd?: string;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;

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

  const notesRef = useRef<HTMLTextAreaElement>(null);
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
      setTab('notes');
      setExpanded(false);
      setShowRepeat(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  // Auto-grow the notes textarea with its content (capped by the card via
  // max-h + overflow-y-auto), so a short note shows a small box and a long one
  // grows until it hits the max and then scrolls — mirroring the checklist.
  useEffect(() => {
    if (!expanded || tab !== 'notes') return;
    const el = notesRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [notes, tab, expanded]);

  const tagDetails = useMemo(() => {
    const byId = new Map(tags.map((t) => [t.id, t] as const));
    const byName = new Map(tags.map((t) => [t.name, t] as const));
    return (id: string) => byId.get(id) ?? byName.get(id);
  }, [tags]);

  if (!displayTask) return null;

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
          ? DAY_NAMES[repeatDay]
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

  return (
    <>
      <BaseSheet
        open={open}
        onOpenChange={onOpenChange}
        className="sm:max-w-md max-h-[92vh] !border-0 !bg-transparent !shadow-none"
        zIndex={1400}
        hideHandle
      >
        {({ bindScroll, dragControls }) => (
          <div
            ref={bindScroll}
            className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden px-3 pt-1"
          >
            {/* Card 1 — identity + primary actions */}
            <div className="shrink-0 overflow-hidden rounded-[28px] border border-border/50 bg-card shadow-sm">
            {/* Grab handle (drag-to-dismiss), inside the card with breathing room */}
            <div
              className="flex cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing sm:hidden"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="h-1.5 w-12 rounded-full bg-border/70" />
            </div>
            {/* Header — controls, streak, title, repeat/time meta and tags. */}
            <div className="relative px-5 pb-3 pt-1 text-center">
              <div className="flex items-center justify-end gap-3">
                {!isCompleted && onEdit && (
                  <button
                    onClick={onEdit}
                    aria-label="Edit task"
                    title="Edit"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Pencil size={17} />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={runAndClose(onDelete)}
                    aria-label="Delete task"
                    title="Delete"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100/70 text-rose-600 transition-colors hover:bg-rose-200/70 dark:bg-rose-500/15 dark:text-rose-300"
                  >
                    <Trash2 size={17} />
                  </button>
                )}
                <button
                  onClick={close}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              {isRepeating && streak > 0 && (
                <span
                  className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-1 text-orange-500"
                  title={`${streak} in a row`}
                >
                  <Flame className="h-3.5 w-3.5" fill="currentColor" />
                  <span className="text-[12px] font-black tabular-nums leading-none">
                    ×{streak}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    streak
                  </span>
                </span>
              )}

              <h2 className="mt-2 px-2 text-[22px] font-black leading-tight tracking-tight text-foreground">
                {displayTask.text}
              </h2>

              {isCompleted ? (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[12px] font-bold">
                  <span className="inline-flex items-center gap-1 text-green-500">
                    <CheckCircle2 className="h-4 w-4" />
                    Completed
                  </span>
                  {isRepeating && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <AppIcon name="repeat" label="Repeat" className="h-3.5 w-3.5" />
                      {repeatLabel}
                    </span>
                  )}
                  {displayTask.startTime && (
                    <span className="text-primary">· {displayTask.startTime}</span>
                  )}
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 text-[12px] font-bold text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <AppIcon name="repeat" label="Repeat" className="h-3.5 w-3.5" />
                    {repeatLabel}
                  </span>
                  {displayTask.startTime && (
                    <span className="text-primary">· {displayTask.startTime}</span>
                  )}
                </div>
              )}

              {displayTask.tags && displayTask.tags.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                  {displayTask.tags.map((tagId) => {
                    const t = tagDetails(tagId);
                    if (!t) return null;
                    return (
                      <span
                        key={tagId}
                        className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-normal"
                        style={{
                          backgroundColor: `${t.color}20`,
                          color: t.color,
                          borderColor: `${t.color}40`,
                        }}
                      >
                        {t.name}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {isCompleted ? (
              <div className="flex justify-center px-5 pb-6 pt-2">
                <button
                  onClick={runAndClose(onComplete)}
                  className="flex flex-col items-center gap-2"
                >
                  <span className="grid h-[78px] w-[78px] place-items-center rounded-[26px] bg-card shadow-[0_6px_0_0_rgba(0,0,0,0.10)] ring-1 ring-border transition-transform active:translate-y-0.5">
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                  </span>
                  <span className="text-[13px] font-black text-foreground">Undo</span>
                </button>
              </div>
            ) : (
            <div className="grid grid-cols-3 items-end px-2 pb-4 pt-1">
              <div className="flex justify-center">
                {onStartTimer && (
                  <PlainAction
                    label="Focus"
                    onClick={runAndClose(onStartTimer)}
                    icon={
                      <AppIcon name="clock" label="Focus" className="h-11 w-11" />
                    }
                  />
                )}
              </div>

              <div className="flex justify-center">
                {onComplete ? (
                  <button
                    onClick={runAndClose(onComplete)}
                    className="flex flex-col items-center gap-2"
                  >
                    <span className="grid h-[78px] w-[78px] place-items-center rounded-[26px] bg-card shadow-[0_6px_0_0_rgba(0,0,0,0.10)] ring-1 ring-border transition-transform active:translate-y-0.5">
                      <Fly size={52} y={-3} />
                    </span>
                    <span className="text-[13px] font-black text-foreground">
                      Complete
                    </span>
                  </button>
                ) : (
                  // Future task — completion isn't offered yet.
                  <div className="flex flex-col items-center gap-2 opacity-60">
                    <span className="grid h-[78px] w-[78px] place-items-center rounded-[26px] bg-muted/40 ring-1 ring-border">
                      <Fly size={52} y={-3} />
                    </span>
                    <span className="text-[13px] font-black text-muted-foreground">
                      Upcoming
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-center">
                {isRepeating && onSkipToday ? (
                  <PlainAction
                    label="Skip"
                    onClick={runAndClose(onSkipToday)}
                    icon={<EyeOff className="h-10 w-10 text-muted-foreground" />}
                  />
                ) : onDoLater && !isCompleted ? (
                  <PlainAction
                    label="Save for later"
                    onClick={runAndClose(onDoLater)}
                    icon={
                      <AppIcon
                        name="saved"
                        label="Save for later"
                        className="h-10 w-10"
                      />
                    }
                  />
                ) : null}
              </div>
            </div>
            )}
            </div>

            {/* Card 2 — duplicate (completed only) */}
            {isCompleted && onDuplicate && (
              <div className="rounded-[28px] border border-border/50 bg-card p-4 shadow-sm">
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
                </div>
              </div>
            )}

            {/* Card 2 — utilities (active, collapsed only; mirrors the
                QuickAddSheet "saved" container). All share a thirds-based width
                so every row stays column-aligned and centered. */}
            {!isCompleted && !expanded && (
            <div className="shrink-0 flex flex-wrap justify-center rounded-[28px] border border-border/50 bg-card p-2 shadow-sm">
              {onSetRepeat && (
                <MiniAction
                  active={repeatMode !== 'none'}
                  label={repeatChipLabel}
                  onClick={() => setShowRepeat(true)}
                  icon={<Repeat className="h-5 w-5" />}
                />
              )}
              {onSchedule && (
                <MiniAction
                  active={!!displayTask.reminder}
                  label="Notify"
                  onClick={onSchedule}
                  icon={<Bell className="h-5 w-5" />}
                />
              )}
              {onAddTags && (
                <MiniAction
                  active={!!displayTask.tags && displayTask.tags.length > 0}
                  label="Tags"
                  onClick={onAddTags}
                  icon={<Tag className="h-5 w-5" />}
                />
              )}
              <MiniAction
                icon={<Pen className="h-5 w-5" />}
                label="Notes"
                active={!!notes.trim()}
                onClick={() => openEditor('notes')}
              />
              <MiniAction
                icon={<ListChecks className="h-5 w-5" />}
                label={
                  checklist.length > 0
                    ? `Checklist · ${doneCount}/${checklist.length}`
                    : 'Checklist'
                }
                active={checklist.length > 0}
                onClick={() => openEditor('checklist')}
              />
            </div>
            )}

            {/* Card 3 — notes / checklist editor (active, expanded). Fills the
                remaining height and scrolls inside, so the cards above keep
                their size. */}
            {!isCompleted && expanded && (
            <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-border/50 bg-card p-4 shadow-sm">
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex flex-1 rounded-full bg-muted p-1">
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
                  <div className="flex min-h-0 flex-1 flex-col">
                    <textarea
                      ref={notesRef}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
                      onBlur={commitNotes}
                      placeholder="Add notes, links, or details…"
                      maxLength={NOTES_MAX}
                      className="block min-h-[120px] max-h-full w-full resize-none overflow-y-auto rounded-2xl border border-border/60 bg-muted/30 px-4 py-3.5 text-[16px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:text-[15px]"
                    />
                    {notes.length > NOTES_MAX - 100 && (
                      <p className="mt-1 text-right text-[11px] font-bold tabular-nums text-muted-foreground">
                        {notes.length}/{NOTES_MAX}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col">
                    {checklist.length > 0 && (
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
                      </div>
                    )}

                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                      {checklist.map((it) => {
                        const isEditing = editingId === it.id;
                        return (
                          <div
                            key={it.id}
                            className="group flex items-center gap-3 rounded-2xl border border-border/50 bg-muted/30 px-3 py-2.5 transition-colors focus-within:border-primary/40 focus-within:bg-card hover:bg-muted/50"
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
                                onClick={() => toggleItem(it.id)}
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

                            {!isEditing && (
                              <button
                                onClick={() => setEditingId(it.id)}
                                aria-label="Edit item"
                                className="shrink-0 rounded-lg p-1.5 text-muted-foreground/50 transition-opacity hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
                              >
                                <Pencil className="h-[15px] w-[15px]" />
                              </button>
                            )}
                            <button
                              onClick={() => removeItem(it.id)}
                              aria-label="Remove item"
                              className="shrink-0 rounded-lg p-1.5 text-muted-foreground/50 transition-opacity hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Pinned add-item row — always visible below the
                        scrolling list, regardless of how many items there are. */}
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
                )}
              </div>
            </div>
            )}

            <div className="shrink-0 pb-[calc(env(safe-area-inset-bottom)+14px)]" />
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

function PlainAction({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 text-muted-foreground transition-colors hover:text-foreground active:scale-95"
    >
      <span className="grid h-[52px] place-items-center">{icon}</span>
      <span className="whitespace-nowrap text-[12px] font-bold">{label}</span>
    </button>
  );
}

function MiniAction({
  label,
  icon,
  onClick,
  active = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-1/3 min-w-0 flex-col items-center gap-1.5 rounded-2xl py-2.5 transition-colors active:scale-95 ${
        active
          ? 'text-primary'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      }`}
    >
      <span className="grid h-6 place-items-center">{icon}</span>
      <span className="max-w-full truncate px-1 py-px text-[12px] font-bold leading-tight">
        {label}
      </span>
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
      className={`flex-1 rounded-full py-1.5 text-[13px] font-bold transition-colors ${
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
