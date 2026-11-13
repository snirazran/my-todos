'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Lock, Pause, Play, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import {
  AdminCard,
  Chip,
  EmptyState,
  Field,
  LoadingBlock,
  Notice,
  NumberInput,
  PondButton,
  SectionLabel,
  Segmented,
  ToggleRow,
  inputClass,
} from '@/components/admin/kit';
import {
  PROMPT_CATEGORY_LABELS,
  PROMPT_KIND_EMOJI,
  PROMPT_KIND_LABELS,
} from '@/components/admin/quests/types';
import { cn } from '@/lib/utils';
import type { QuestPromptKind, QuestPromptOption } from '@/lib/quests/types';

type AdminPrompt = {
  promptId: string;
  kind: QuestPromptKind;
  question: string;
  placeholder: string;
  options: QuestPromptOption[];
  category: string;
  weight: number;
  cooldownDays: number;
  dateKey: string | null;
  audience: string[];
  weekdays: number[];
  shown: number;
  isActive: boolean;
  answers: number;
  lastAnswered: string | null;
  tally: Record<string, number>;
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const KIND_ORDER: QuestPromptKind[] = ['journal', 'poll', 'this_or_that', 'checkin'];

const KIND_BLURB: Record<QuestPromptKind, string> = {
  journal: 'A private written answer',
  poll: '2–4 choices, results shared',
  this_or_that: 'Two choices, results shared',
  checkin: 'A private 5-step mood scale',
};

const CHECKIN_DEFAULT: QuestPromptOption[] = [
  { id: '1', emoji: '😣', label: 'Rough' },
  { id: '2', emoji: '😕', label: 'Meh' },
  { id: '3', emoji: '😐', label: 'Okay' },
  { id: '4', emoji: '🙂', label: 'Good' },
  { id: '5', emoji: '😄', label: 'Great' },
];

function blankPrompt(): AdminPrompt {
  return {
    promptId: '',
    kind: 'journal',
    question: '',
    placeholder: '',
    options: [],
    category: 'reflection',
    weight: 1,
    cooldownDays: 30,
    dateKey: null,
    audience: [],
    weekdays: [],
    shown: 0,
    isActive: true,
    answers: 0,
    lastAnswered: null,
    tally: {},
  };
}

function optionsFor(kind: QuestPromptKind, current: QuestPromptOption[]): QuestPromptOption[] {
  if (kind === 'journal') return [];
  if (kind === 'checkin') return current.length === 5 ? current : CHECKIN_DEFAULT;
  const max = kind === 'this_or_that' ? 2 : 4;
  const next = current.slice(0, max);
  while (next.length < 2) {
    next.push({ id: String.fromCharCode(97 + next.length), emoji: '', label: '' });
  }
  return next;
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function shortDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function topicLabel(category: string) {
  return PROMPT_CATEGORY_LABELS[category] ?? category;
}

const IMPORT_EXAMPLE = `[
  { "kind": "journal", "category": "gratitude", "question": "Who made you smile this week?" },
  { "kind": "this_or_that", "category": "fun", "question": "Pizza or tacos?",
    "options": [{ "emoji": "🍕", "label": "Pizza" }, { "emoji": "🌮", "label": "Tacos" }] }
]`;

export function AdminPromptManager() {
  const [prompts, setPrompts] = useState<AdminPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<QuestPromptKind | 'all'>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [showPaused, setShowPaused] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AdminPrompt | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/admin/quest-prompts', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load questions');
      setPrompts(data.prompts ?? []);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not load questions' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const topics = useMemo(
    () => Array.from(new Set([...Object.keys(PROMPT_CATEGORY_LABELS), ...prompts.map((p) => p.category)])),
    [prompts],
  );

  const today = todayKey();
  const upcoming = useMemo(
    () =>
      prompts
        .filter((prompt) => prompt.dateKey && prompt.dateKey >= today)
        .sort((a, b) => (a.dateKey ?? '').localeCompare(b.dateKey ?? '')),
    [prompts, today],
  );

  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    prompts.forEach((prompt) => {
      if (!prompt.isActive) return;
      counts.all += 1;
      counts[prompt.kind] = (counts[prompt.kind] ?? 0) + 1;
    });
    return counts;
  }, [prompts]);

  const totalAnswers = prompts.reduce((sum, prompt) => sum + prompt.answers, 0);
  const query = search.trim().toLowerCase();
  const filtered = prompts
    .filter(
      (prompt) =>
        (kindFilter === 'all' || prompt.kind === kindFilter) &&
        (topicFilter === 'all' || prompt.category === topicFilter) &&
        (showPaused || prompt.isActive) &&
        (!query || prompt.question.toLowerCase().includes(query)),
    )
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.answers - a.answers);

  const save = async (payload: unknown, done: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/quest-prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save');
      const skipped = (data.errors ?? []).length;
      setMessage({ type: 'success', text: skipped ? `${done} (${skipped} skipped: ${data.errors[0]})` : done });
      await load();
      return true;
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not save' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async (promptId: string) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/quest-prompts?promptId=${encodeURIComponent(promptId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setEditing(null);
      setMessage({ type: 'success', text: 'Question deleted' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setMessage({ type: 'error', text: 'That is not valid JSON' });
      return;
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    if (await save({ prompts: list }, `Imported ${list.length} questions`)) {
      setImportOpen(false);
      setImportText('');
    }
  };

  const openEditor = (prompt: AdminPrompt) => {
    setConfirmDelete(false);
    setEditing({ ...prompt, options: prompt.options.map((option) => ({ ...option })) });
  };

  if (loading) return <LoadingBlock rows={4} />;

  return (
    <div className="space-y-6">
      {message ? <Notice type={message.type}>{message.text}</Notice> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {KIND_ORDER.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setKindFilter(kindFilter === kind ? 'all' : kind)}
            className={cn(
              'rounded-[20px] border bg-card p-4 text-left transition',
              kindFilter === kind
                ? 'border-primary/50 shadow-[0_3px_0_0_hsl(var(--primary)/0.4)]'
                : 'border-border/70 shadow-[0_3px_0_0_hsl(var(--border))] hover:-translate-y-0.5',
            )}
          >
            <span className="text-[24px]">{PROMPT_KIND_EMOJI[kind]}</span>
            <p className="mt-1 text-[24px] font-black tabular-nums leading-none">{kindCounts[kind] ?? 0}</p>
            <p className="mt-1 text-[13px] font-black">{PROMPT_KIND_LABELS[kind]}</p>
            <p className="text-[11px] font-medium text-muted-foreground">{KIND_BLURB[kind]}</p>
          </button>
        ))}
      </div>

      <AdminCard
        title="Pinned days"
        subtitle="A question pinned to a date is asked to everyone that day, skipping the rotation. Great for holidays."
        icon={<CalendarDays />}
        tone="sun"
        bodyClassName="pt-3"
      >
        {upcoming.length === 0 ? (
          <p className="text-[13px] font-bold text-muted-foreground">
            Nothing pinned. Open a question and set &ldquo;Only on this date&rdquo; to pin it.
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {upcoming.map((prompt) => (
              <button
                key={prompt.promptId}
                type="button"
                onClick={() => openEditor(prompt)}
                className="w-56 shrink-0 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-left transition hover:bg-amber-500/15"
              >
                <p className="text-[11px] font-black uppercase tracking-[0.08em] text-amber-700 dark:text-amber-400">
                  {prompt.dateKey === today ? 'Today' : shortDate(prompt.dateKey!)}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[13px] font-black">{prompt.question}</p>
              </button>
            ))}
          </div>
        )}
      </AdminCard>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionLabel>Question library</SectionLabel>
            <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
              {kindCounts.all} active · {totalAnswers.toLocaleString()} answers so far
            </p>
          </div>
          <div className="flex gap-2">
            <PondButton variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" />
              Import
            </PondButton>
            <PondButton size="sm" onClick={() => openEditor(blankPrompt())}>
              <Plus className="h-3.5 w-3.5" />
              New question
            </PondButton>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search questions"
              className={cn(inputClass, 'pl-9')}
            />
          </div>
          <select
            value={topicFilter}
            onChange={(event) => setTopicFilter(event.target.value)}
            className={cn(inputClass, 'w-auto')}
          >
            <option value="all">All topics</option>
            {topics.map((topic) => (
              <option key={topic} value={topic}>
                {topicLabel(topic)}
              </option>
            ))}
          </select>
          <Chip active={!showPaused} onClick={() => setShowPaused((value) => !value)} tone="stone">
            Hide paused
          </Chip>
        </div>

        {filtered.length === 0 ? (
          <EmptyState>No questions match these filters.</EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((prompt) => (
              <PromptCard
                key={prompt.promptId}
                prompt={prompt}
                onOpen={() => openEditor(prompt)}
                onTogglePause={() =>
                  void save(
                    { ...prompt, isActive: !prompt.isActive },
                    prompt.isActive ? 'Question paused' : 'Question back in rotation',
                  )
                }
                busy={busy}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {editing ? (
          <Overlay onClose={() => setEditing(null)} wide>
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <p className="text-[17px] font-black">{editing.promptId ? 'Edit question' : 'New question'}</p>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-5 p-5">
                <div className="space-y-2">
                  <p className="text-[12px] font-black text-muted-foreground">Kind</p>
                  <div className="grid grid-cols-2 gap-2">
                    {KIND_ORDER.map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => setEditing({ ...editing, kind, options: optionsFor(kind, editing.options) })}
                        className={cn(
                          'flex items-center gap-2 rounded-2xl border px-3 py-2 text-left transition',
                          editing.kind === kind
                            ? 'border-primary/50 bg-card shadow-[0_3px_0_0_hsl(var(--primary)/0.35)]'
                            : 'border-border bg-muted/40 hover:bg-card',
                        )}
                      >
                        <span className="text-[18px]">{PROMPT_KIND_EMOJI[kind]}</span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-black">{PROMPT_KIND_LABELS[kind]}</span>
                          <span className="block truncate text-[11px] font-medium text-muted-foreground">{KIND_BLURB[kind]}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <Field label="Question" hint={`${editing.question.length}/160`}>
                  <input
                    value={editing.question}
                    maxLength={160}
                    autoFocus={!editing.promptId}
                    placeholder="What made you smile today?"
                    onChange={(event) => setEditing({ ...editing, question: event.target.value })}
                    className={inputClass}
                  />
                </Field>

                {editing.kind === 'journal' ? (
                  <Field label="Hint inside the text box" hint="Optional">
                    <input
                      value={editing.placeholder}
                      maxLength={80}
                      placeholder="Something big or tiny…"
                      onChange={(event) => setEditing({ ...editing, placeholder: event.target.value })}
                      className={inputClass}
                    />
                  </Field>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[12px] font-black text-muted-foreground">Answers</p>
                    {editing.options.map((option, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          value={option.emoji ?? ''}
                          maxLength={8}
                          placeholder="🙂"
                          onChange={(event) =>
                            setEditing({
                              ...editing,
                              options: editing.options.map((o, i) => (i === index ? { ...o, emoji: event.target.value } : o)),
                            })
                          }
                          className={cn(inputClass, 'w-14 px-1 text-center text-lg')}
                        />
                        <input
                          value={option.label}
                          maxLength={40}
                          placeholder={`Answer ${index + 1}`}
                          onChange={(event) =>
                            setEditing({
                              ...editing,
                              options: editing.options.map((o, i) => (i === index ? { ...o, label: event.target.value } : o)),
                            })
                          }
                          className={inputClass}
                        />
                        {editing.kind === 'poll' && editing.options.length > 2 ? (
                          <button
                            type="button"
                            onClick={() => setEditing({ ...editing, options: editing.options.filter((_, i) => i !== index) })}
                            className="flex w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {editing.kind === 'poll' && editing.options.length < 4 ? (
                      <PondButton
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setEditing({
                            ...editing,
                            options: [
                              ...editing.options,
                              { id: String.fromCharCode(97 + editing.options.length), emoji: '', label: '' },
                            ],
                          })
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add an answer
                      </PondButton>
                    ) : null}
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-[12px] font-black text-muted-foreground">Topic</p>
                  <div className="flex flex-wrap gap-1.5">
                    {topics.map((topic) => (
                      <Chip
                        key={topic}
                        tone="grape"
                        active={editing.category === topic}
                        onClick={() => setEditing({ ...editing, category: topic })}
                      >
                        {topicLabel(topic)}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Only on this date" hint="Pins it for everyone">
                    <input
                      type="date"
                      value={editing.dateKey ?? ''}
                      onChange={(event) => setEditing({ ...editing, dateKey: event.target.value || null })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Rest before repeating" hint="Per player">
                    <NumberInput
                      min={0}
                      max={365}
                      value={editing.cooldownDays}
                      suffix="days"
                      onChange={(value) => setEditing({ ...editing, cooldownDays: value })}
                    />
                  </Field>
                  <Field label="How often" hint="Higher = picked more">
                    <Segmented
                      size="sm"
                      value={editing.weight >= 3 ? 'often' : editing.weight === 2 ? 'more' : 'normal'}
                      onChange={(value) =>
                        setEditing({ ...editing, weight: value === 'often' ? 3 : value === 'more' ? 2 : 1 })
                      }
                      options={[
                        { value: 'normal', label: '1×' },
                        { value: 'more', label: '2×' },
                        { value: 'often', label: '3×' },
                      ]}
                    />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Only for players who picked" hint="area:fitness, barrier:put-off, trait:logic, overwhelm:weekly. Empty = everyone">
                    <input
                      type="text"
                      value={(editing.audience ?? []).join(', ')}
                      onChange={(event) =>
                        setEditing({
                          ...editing,
                          audience: event.target.value.split(',').map((tag) => tag.trim()),
                        })
                      }
                      placeholder="Everyone"
                      className={inputClass}
                    />
                  </Field>
                  <div className="space-y-2">
                    <p className="text-[12px] font-black text-muted-foreground">Only on these days</p>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAY_LABELS.map((label, day) => {
                        const active = (editing.weekdays ?? []).includes(day);
                        return (
                          <Chip
                            key={label}
                            tone="grape"
                            active={active}
                            onClick={() =>
                              setEditing({
                                ...editing,
                                weekdays: active
                                  ? (editing.weekdays ?? []).filter((value) => value !== day)
                                  : [...(editing.weekdays ?? []), day],
                              })
                            }
                          >
                            {label}
                          </Chip>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <ToggleRow
                  title="In rotation"
                  description="Paused questions are never asked."
                  checked={editing.isActive}
                  onChange={(isActive) => setEditing({ ...editing, isActive })}
                />
              </div>

              <div className="border-t border-border/70 bg-muted/30 p-5 md:border-l md:border-t-0">
                <p className="mb-3 text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                  What players see
                </p>
                <PromptPreview prompt={editing} />
                {editing.answers > 0 ? (
                  <p className="mt-3 text-[12px] font-bold text-muted-foreground">
                    {editing.answers.toLocaleString()} answers{editing.lastAnswered ? ` · last on ${editing.lastAnswered}` : ''}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border/70 px-5 py-3">
              {editing.promptId ? (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <PondButton variant="danger" size="sm" loading={busy} onClick={() => void remove(editing.promptId)}>
                      Delete for good
                    </PondButton>
                    <PondButton variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                      Keep
                    </PondButton>
                  </div>
                ) : (
                  <PondButton variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </PondButton>
                )
              ) : (
                <span />
              )}
              <PondButton
                loading={busy}
                disabled={!editing.question.trim()}
                onClick={async () => {
                  if (await save(editing, editing.promptId ? 'Question saved' : 'Question added')) setEditing(null);
                }}
              >
                {editing.promptId ? 'Save question' : 'Add question'}
              </PondButton>
            </div>
          </Overlay>
        ) : null}

        {importOpen ? (
          <Overlay onClose={() => setImportOpen(false)}>
            <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
              <p className="text-[17px] font-black">Import questions</p>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto p-5">
              <p className="text-[13px] font-medium text-muted-foreground">
                Paste a JSON list. Kinds: journal, poll (2–4 answers), this_or_that (2), checkin. Using an existing
                promptId updates that question instead of adding a new one.
              </p>
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder={IMPORT_EXAMPLE}
                rows={12}
                className="w-full rounded-2xl border border-border bg-background p-3 font-mono text-xs outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex justify-end border-t border-border/70 px-5 py-3">
              <PondButton loading={busy} disabled={!importText.trim()} onClick={() => void runImport()}>
                Import
              </PondButton>
            </div>
          </Overlay>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PromptCard({
  prompt,
  onOpen,
  onTogglePause,
  busy,
}: {
  prompt: AdminPrompt;
  onOpen: () => void;
  onTogglePause: () => void;
  busy: boolean;
}) {
  const total = Object.values(prompt.tally).reduce((sum, n) => sum + n, 0);
  const community = prompt.kind === 'poll' || prompt.kind === 'this_or_that';
  return (
    <div
      className={cn(
        'group relative flex flex-col gap-3 rounded-[20px] border border-border/70 bg-card p-4 shadow-[0_3px_0_0_hsl(var(--border))] transition',
        !prompt.isActive && 'opacity-60',
      )}
    >
      <button type="button" onClick={onOpen} className="flex items-start gap-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-[20px]">
          {PROMPT_KIND_EMOJI[prompt.kind]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-black leading-snug">{prompt.question}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-black">
            <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-700 dark:text-violet-400">
              {topicLabel(prompt.category)}
            </span>
            <span className="text-muted-foreground">{PROMPT_KIND_LABELS[prompt.kind]}</span>
            {prompt.dateKey ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-400">
                📌 {shortDate(prompt.dateKey)}
              </span>
            ) : null}
            {(prompt.audience ?? []).length > 0 ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">
                🎯 {prompt.audience.join(' · ')}
              </span>
            ) : null}
            {(prompt.weekdays ?? []).length > 0 ? (
              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-700 dark:text-sky-400">
                {prompt.weekdays.map((day) => WEEKDAY_LABELS[day]).join(' · ')}
              </span>
            ) : null}
            {prompt.shown > 0 ? (
              <span className="text-muted-foreground">
                {Math.round((Math.min(prompt.answers, prompt.shown) / prompt.shown) * 100)}% answered of {prompt.shown} shown
              </span>
            ) : null}
            {!prompt.isActive ? <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Paused</span> : null}
          </span>
        </span>
      </button>

      {community && prompt.options.length > 0 ? (
        <div className="space-y-1">
          {prompt.options.map((option) => {
            const share = total ? Math.round(((prompt.tally[option.id] ?? 0) / total) * 100) : 0;
            return (
              <div key={option.id} className="relative h-7 overflow-hidden rounded-lg bg-muted/60">
                <div className="absolute inset-y-0 left-0 bg-primary/20" style={{ width: `${share}%` }} />
                <div className="relative flex h-full items-center gap-2 px-2.5 text-[12px] font-black">
                  <span>{option.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  <span className="tabular-nums text-muted-foreground">{total ? `${share}%` : ''}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 text-[12px] font-bold text-muted-foreground">
        <span>
          {prompt.answers.toLocaleString()} {prompt.answers === 1 ? 'answer' : 'answers'}
          {prompt.kind === 'journal' || prompt.kind === 'checkin' ? (
            <span className="ml-1.5 inline-flex items-center gap-0.5">
              <Lock className="h-3 w-3" /> private
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onTogglePause}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black transition hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          {prompt.isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {prompt.isActive ? 'Pause' : 'Resume'}
        </button>
      </div>
    </div>
  );
}

function PromptPreview({ prompt }: { prompt: AdminPrompt }) {
  return (
    <div className="pond-panel overflow-hidden rounded-[24px] border border-[var(--pond-line)] bg-[linear-gradient(180deg,var(--pond-surface-top),var(--pond-surface-bottom))] p-4 shadow-[0_4px_0_0_var(--pond-shadow)]">
      <div className="text-center">
        <span className="text-[34px] leading-none">🐸</span>
        <p className="mt-1 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--pond-eyebrow)]">Frog asks</p>
        <p className="mx-auto mt-1 max-w-[16rem] text-balance text-[19px] font-black leading-tight text-[var(--pond-ink)]">
          {prompt.question || 'Your question'}
        </p>
      </div>
      <div className="mt-4">
        {prompt.kind === 'journal' ? (
          <div className="min-h-[5.5rem] rounded-[16px] border-2 border-[var(--pond-chip-line)] bg-[var(--pond-well)] px-3 py-2.5 text-[13px] font-semibold text-[var(--pond-ink-faint)]">
            {prompt.placeholder || 'Write a few words…'}
          </div>
        ) : prompt.kind === 'checkin' ? (
          <div className="grid grid-cols-5 gap-1.5">
            {prompt.options.map((option, index) => (
              <div key={index} className="flex flex-col items-center gap-1 rounded-[14px] bg-[var(--pond-chip)] py-2">
                <span className="text-[22px] leading-none">{option.emoji}</span>
                <span className="text-[10px] font-black text-[var(--pond-ink-muted)]">{option.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={cn('grid gap-2', prompt.kind === 'this_or_that' ? 'grid-cols-2' : 'grid-cols-1')}>
            {prompt.options.map((option, index) => (
              <div
                key={index}
                className={cn(
                  'flex items-center gap-2 rounded-[14px] border-2 border-[var(--pond-chip-line)] bg-[var(--pond-chip)] px-3 py-2.5',
                  prompt.kind === 'this_or_that' && 'flex-col py-3',
                )}
              >
                <span className={prompt.kind === 'this_or_that' ? 'text-[30px] leading-none' : 'text-[18px]'}>{option.emoji}</span>
                <span className="text-[13px] font-black text-[var(--pond-ink)]">{option.label || '…'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-[11px] font-bold text-[var(--pond-ink-muted)]">
        {prompt.kind === 'journal' || prompt.kind === 'checkin'
          ? 'Only they can see their answer'
          : 'They see how everyone answered'}
      </p>
    </div>
  );
}

function Overlay({ children, onClose, wide = false }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-[2px]"
      />
      <div className="pointer-events-none fixed inset-0 z-[2001] flex items-end justify-center p-0 sm:items-center sm:p-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          className={cn(
            'pointer-events-auto flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] border border-border bg-background shadow-2xl sm:rounded-[28px]',
            wide ? 'sm:max-w-4xl' : 'sm:max-w-lg',
          )}
        >
          {children}
        </motion.div>
      </div>
    </>
  );
}
