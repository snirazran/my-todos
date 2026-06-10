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
import type { RepeatMode } from '@/components/ui/quick-add/utils';
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
  startTime?: string;
  endTime?: string;
  reminder?: string;
  dayOfWeek?: number;
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
  onSetRepeat?: (mode: RepeatMode, dayOfWeek?: number) => void;
  onSchedule?: () => void;
  onAddTags?: () => void;
  onUpdateDetails?: (details: {
    notes?: string;
    checklist?: ChecklistItem[];
  }) => void;
  /** Duplicate a completed task onto a new day. */
  onDuplicate?: (when: 'today' | 'tomorrow') => void;
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

  // When the editor opens (or the active tab changes while open), focus the
  // relevant field so the user can start typing immediately.
  useEffect(() => {
    if (!expanded) return;
    const t = setTimeout(() => {
      if (tab === 'notes') notesRef.current?.focus();
      else newItemRef.current?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [expanded, tab]);

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
  const repeatDay = displayTask.dayOfWeek ?? new Date().getDay();
  const repeatMode: RepeatMode =
    displayTask.repeatMode ?? (isWeekly ? 'weekly' : 'none');
  const repeatChipLabel =
    repeatMode === 'daily'
      ? 'Daily'
      : repeatMode === 'weekdays'
        ? 'Weekdays'
        : repeatMode === 'weekly'
          ? DAY_NAMES[repeatDay]
          : 'Repeat';
  const repeatLabel =
    repeatMode === 'daily'
      ? 'Every day'
      : repeatMode === 'weekdays'
        ? 'Every weekday'
        : repeatMode === 'weekly'
          ? `Every ${DAY_NAMES[repeatDay]}`
          : 'Does not repeat';
  const isRepeating = repeatMode !== 'none' || isWeekly;

  return (
    <>
      <BaseSheet
        open={open}
        onOpenChange={onOpenChange}
        className="sm:max-w-md max-h-[92vh]"
        zIndex={1400}
      >
        {({ bindScroll }) => (
          <div
            ref={bindScroll}
            className="flex flex-1 min-h-0 flex-col overflow-y-auto overscroll-none"
          >
            {/* Top icon bar: edit + delete + close */}
            <div className="flex items-center justify-end gap-1.5 px-4 pt-2">
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

            {/* Identity — title only (the fly lives on the Complete button) */}
            <div className="flex flex-col items-center px-5 pb-4 pt-1 text-center">
              <h2 className="max-w-full px-2 text-xl font-black tracking-tight text-foreground">
                {displayTask.text}
              </h2>
              {isCompleted ? (
                <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 text-[12px] font-bold">
                  <span className="inline-flex items-center gap-1 text-green-500">
                    <CheckCircle2 className="h-4 w-4" />
                    Completed
                  </span>
                  {displayTask.startTime && (
                    <span className="text-primary">· {displayTask.startTime}</span>
                  )}
                </div>
              ) : (
                <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 text-[12px] font-bold text-muted-foreground">
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
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
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
              <div className="px-5">
                {/* Undo completion */}
                <div className="flex justify-center">
                  <button
                    onClick={runAndClose(onComplete)}
                    className="flex flex-col items-center gap-2"
                  >
                    <span className="grid h-[78px] w-[78px] place-items-center rounded-[26px] bg-card shadow-[0_5px_0_0_rgba(0,0,0,0.10)] ring-1 ring-border transition-transform active:translate-y-0.5">
                      <CheckCircle2 className="h-10 w-10 text-green-500" />
                    </span>
                    <span className="text-[13px] font-black text-foreground">
                      Undo
                    </span>
                  </button>
                </div>

                {onDuplicate && (
                  <div className="mt-6">
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
              </div>
            ) : (
              <>
            {/* Primary actions: Focus · Complete (fly) · Save for later */}
            <div className="grid grid-cols-3 items-end gap-2 px-6">
              {onStartTimer ? (
                <PlainAction
                  label="Focus"
                  onClick={runAndClose(onStartTimer)}
                  icon={
                    <AppIcon name="clock" label="Focus" className="h-11 w-11" />
                  }
                />
              ) : (
                <span />
              )}

              {onComplete ? (
                <button
                  onClick={runAndClose(onComplete)}
                  className="flex flex-col items-center gap-2"
                >
                  <span className="grid h-[78px] w-[78px] place-items-center rounded-[26px] bg-card shadow-[0_5px_0_0_rgba(0,0,0,0.10)] ring-1 ring-border transition-transform active:translate-y-0.5">
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
              ) : (
                <span />
              )}
            </div>

            {/* Secondary actions: repeat / remind / tags */}
            <div className="mt-5 flex items-center justify-center gap-2 px-5">
              {onSetRepeat && (
                <SecondaryChip
                  active={repeatMode !== 'none'}
                  label={repeatChipLabel}
                  onClick={() => setShowRepeat(true)}
                  icon={<Repeat className="h-4 w-4" />}
                />
              )}
              {onSchedule && (
                <SecondaryChip
                  active={!!displayTask.reminder}
                  label="Notify"
                  onClick={onSchedule}
                  icon={<Bell className="h-4 w-4" />}
                />
              )}
              {onAddTags && (
                <SecondaryChip
                  label="Tags"
                  onClick={onAddTags}
                  icon={<Tag className="h-4 w-4" />}
                />
              )}
            </div>

            {/* Notes / Checklist — compact previews that expand into a
                comfortable editor only when the user chooses to. */}
            {!expanded ? (
              <div className="mt-5 space-y-2 px-5">
                {/* Notes preview */}
                <button
                  onClick={() => openEditor('notes')}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 px-3.5 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-card text-muted-foreground ring-1 ring-border">
                    <Pen className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-foreground">
                      Notes
                    </span>
                    <span
                      className={`block truncate text-[12px] ${
                        notes.trim()
                          ? 'text-muted-foreground'
                          : 'text-muted-foreground/60'
                      }`}
                    >
                      {notes.trim() || 'Add notes, links, or details…'}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                </button>

                {/* Checklist preview */}
                <button
                  onClick={() => openEditor('checklist')}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 px-3.5 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-card text-muted-foreground ring-1 ring-border">
                    <ListChecks className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold text-foreground">
                        Checklist
                      </span>
                      {checklist.length > 0 && (
                        <span className="shrink-0 text-[12px] font-bold tabular-nums text-muted-foreground">
                          {doneCount}/{checklist.length}
                        </span>
                      )}
                    </span>
                    {checklist.length > 0 ? (
                      <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary transition-[width] duration-300"
                          style={{
                            width: `${(doneCount / checklist.length) * 100}%`,
                          }}
                        />
                      </span>
                    ) : (
                      <span className="block text-[12px] text-muted-foreground/60">
                        Break this task into steps…
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                </button>
              </div>
            ) : (
            <div className="mt-5 px-5">
              <div className="flex items-center gap-2">
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

              <div className="mt-3">
                {tab === 'notes' ? (
                  <div>
                    <textarea
                      ref={notesRef}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
                      onBlur={commitNotes}
                      placeholder="Add notes, links, or details…"
                      maxLength={NOTES_MAX}
                      className="block min-h-[clamp(280px,42vh,440px)] w-full resize-none rounded-2xl border border-border/60 bg-muted/30 px-4 py-3.5 text-[16px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 sm:text-[15px]"
                    />
                    {notes.length > NOTES_MAX - 100 && (
                      <p className="mt-1 text-right text-[11px] font-bold tabular-nums text-muted-foreground">
                        {notes.length}/{NOTES_MAX}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="min-h-[clamp(280px,42vh,440px)]">
                    {checklist.length > 0 && (
                      <div className="mb-3 flex items-center gap-2.5">
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

                    <div className="space-y-2">
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
                                className={`min-w-0 flex-1 truncate text-left text-[16px] transition-colors sm:text-[15px] ${
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

                      {checklist.length < MAX_ITEMS && (
                        <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-border/60 px-3 py-2.5 transition-colors focus-within:border-primary/50">
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
                    </div>

                    {checklist.length === 0 && (
                      <p className="mt-3 text-center text-[12px] text-muted-foreground/60">
                        Break this task into small, checkable steps.
                      </p>
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
              </>
            )}

            <div className="pb-[calc(env(safe-area-inset-bottom)+20px)]" />
          </div>
        )}
      </BaseSheet>

      <TaskRepeatPopup
        open={showRepeat}
        onClose={() => setShowRepeat(false)}
        currentMode={repeatMode}
        repeatDayLabel={DAY_NAMES[repeatDay]}
        onChange={(mode) => {
          onSetRepeat?.(mode, repeatDay);
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

function SecondaryChip({
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors ${
        active
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {icon}
      {label}
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
