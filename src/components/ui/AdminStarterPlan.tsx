'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  MAX_STARTER_TASKS_PER_CATEGORY,
  STARTER_PLAN_DEFAULT_CONFIG,
  STARTER_PLAN_MAX_PER_AREA_LIMIT,
  STARTER_PLAN_MAX_TASKS_LIMIT,
  starterCadenceLabel,
  type StarterCadence,
  type StarterPlanConfig,
  type StarterTaskTemplate,
} from '@/lib/quests/starterPlan';
import { defaultStarterTasksFor } from '@/lib/quests/starterPlanDefaults';

const inputClass =
  'h-9 rounded-lg border border-border/60 bg-background px-2.5 text-sm font-medium text-foreground outline-none focus:border-primary';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const CADENCES: Array<{ id: StarterCadence; label: string }> = [
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekend', label: 'Weekends' },
  { id: 'custom', label: 'Pick days' },
];

function randomId() {
  return `t${Math.random().toString(36).slice(2, 8)}`;
}

export function StarterTasksEditor({
  categoryName,
  categoryShortLabel,
  tasks,
  onChange,
}: {
  categoryName: string;
  categoryShortLabel?: string;
  tasks: StarterTaskTemplate[];
  onChange: (next: StarterTaskTemplate[]) => void;
}) {
  const update = (id: string, patch: Partial<StarterTaskTemplate>) =>
    onChange(tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)));

  const toggleDay = (task: StarterTaskTemplate, day: number) => {
    const days = new Set(task.days ?? []);
    if (days.has(day)) days.delete(day);
    else days.add(day);
    update(task.id, { days: Array.from(days).sort((a, b) => a - b) });
  };

  const move = (index: number, delta: number) => {
    const next = [...tasks];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-background/70 p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            Starter Plan Tasks
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Offered at the end of onboarding to anyone who picks this area. Best
            first — the plan takes them from the top down.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            onChange(defaultStarterTasksFor(categoryName, categoryShortLabel))
          }
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"
          title="Replace with the built-in plan for this area"
        >
          <RotateCcw className="h-3 w-3" />
          Defaults
        </button>
      </div>

      <div className="space-y-2">
        {tasks.map((task, index) => (
          <div
            key={task.id}
            className={cn(
              'rounded-xl border border-border/50 bg-card/60 p-2.5',
              task.enabled === false && 'opacity-60',
            )}
          >
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-black text-muted-foreground">
                {index + 1}
              </span>
              <input
                value={task.text}
                onChange={(e) => update(task.id, { text: e.target.value })}
                placeholder="e.g. Walk for 10 minutes"
                className={cn(inputClass, 'flex-1')}
              />
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  className="px-1 text-[10px] font-black text-muted-foreground hover:text-foreground"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  className="px-1 text-[10px] font-black text-muted-foreground hover:text-foreground"
                >
                  ▼
                </button>
              </div>
              <button
                type="button"
                onClick={() => onChange(tasks.filter((t) => t.id !== task.id))}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={task.cadence}
                onChange={(e) =>
                  update(task.id, {
                    cadence: e.target.value as StarterCadence,
                    ...(e.target.value === 'custom' && !task.days?.length
                      ? { days: [1, 3, 5] }
                      : {}),
                  })
                }
                className={cn(inputClass, 'w-[120px]')}
              >
                {CADENCES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>

              {task.cadence === 'custom' && (
                <div className="flex items-center gap-1">
                  {WEEKDAYS.map((label, day) => {
                    const on = (task.days ?? []).includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(task, day)}
                        className={cn(
                          'h-7 w-7 rounded-full text-[11px] font-black transition',
                          on
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/70',
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              <input
                type="time"
                value={task.startTime ?? ''}
                onChange={(e) =>
                  update(task.id, { startTime: e.target.value || undefined })
                }
                className={cn(inputClass, 'w-[110px]')}
              />

              <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                <input
                  type="checkbox"
                  checked={task.reminder === 'at_time'}
                  onChange={(e) =>
                    update(task.id, {
                      reminder: e.target.checked ? 'at_time' : undefined,
                    })
                  }
                />
                Remind
              </label>

              <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                <input
                  type="checkbox"
                  checked={task.enabled !== false}
                  onChange={(e) => update(task.id, { enabled: e.target.checked })}
                />
                Live
              </label>
            </div>

            <input
              value={task.anchor ?? ''}
              onChange={(e) => update(task.id, { anchor: e.target.value })}
              placeholder="When / where — e.g. Right after you brush your teeth"
              className={cn(inputClass, 'mt-2 w-full')}
            />
            <p className="mt-1 text-[10px] font-medium text-muted-foreground">
              {starterCadenceLabel(task.cadence, task.days)}
              {task.startTime ? ` · ${task.startTime}` : ''}
            </p>
          </div>
        ))}

        {tasks.length === 0 && (
          <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
            No starter tasks. This area is skipped when a plan is built.
          </p>
        )}
      </div>

      {tasks.length < MAX_STARTER_TASKS_PER_CATEGORY && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2 w-full rounded-xl"
          onClick={() =>
            onChange([
              ...tasks,
              { id: randomId(), text: '', cadence: 'daily', enabled: true },
            ])
          }
        >
          <Plus className="mr-1 h-4 w-4" />
          Add starter task
        </Button>
      )}
    </div>
  );
}

export function AdminStarterPlanConfigCard() {
  const [config, setConfig] = useState<StarterPlanConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/starter-plan', {
          credentials: 'include',
        });
        const data = await res.json();
        setConfig(data.starterPlan ?? { ...STARTER_PLAN_DEFAULT_CONFIG });
      } catch {
        setConfig({ ...STARTER_PLAN_DEFAULT_CONFIG });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/starter-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ starterPlan: config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save');
      setConfig(data.starterPlan);
      setMessage('Saved');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/40 bg-card/60 px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading starter plan…
      </div>
    );
  }

  const patch = (next: Partial<StarterPlanConfig>) =>
    setConfig((prev) => (prev ? { ...prev, ...next } : prev));

  return (
    <div className="space-y-4 rounded-2xl border border-border/40 bg-card/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-foreground">Starter plan</p>
          <p className="text-xs text-muted-foreground">
            The ready-made week offered at the end of onboarding, built from the
            areas each person picked.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-foreground">
          <input
            type="checkbox"
            checked={config.isActive}
            onChange={(e) => patch({ isActive: e.target.checked })}
          />
          Live
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-foreground">Tasks in a plan</span>
          <input
            type="number"
            min={1}
            max={STARTER_PLAN_MAX_TASKS_LIMIT}
            value={config.maxTasks}
            onChange={(e) => patch({ maxTasks: Number(e.target.value) })}
            className={inputClass}
          />
          <span className="text-[11px] text-muted-foreground">
            Keep it small — long plans get skipped.
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-foreground">Max per area</span>
          <input
            type="number"
            min={1}
            max={STARTER_PLAN_MAX_PER_AREA_LIMIT}
            value={config.maxPerArea}
            onChange={(e) => patch({ maxPerArea: Number(e.target.value) })}
            className={inputClass}
          />
          <span className="text-[11px] text-muted-foreground">
            Areas take turns before any area gets a second task.
          </span>
        </label>
        <label className="flex flex-col justify-center gap-1">
          <span className="flex items-center gap-2 text-xs font-bold text-foreground">
            <input
              type="checkbox"
              checked={config.linkTags}
              onChange={(e) => patch({ linkTags: e.target.checked })}
            />
            Tag per area
          </span>
          <span className="text-[11px] text-muted-foreground">
            Creates the area&apos;s tag and links it, so the plan already counts
            toward that area.
          </span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-foreground">Headline</span>
          <input
            value={config.headline}
            onChange={(e) => patch({ headline: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-foreground">Subheadline</span>
          <input
            value={config.subheadline}
            onChange={(e) => patch({ subheadline: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-foreground">Accept button</span>
          <input
            value={config.acceptLabel}
            onChange={(e) => patch({ acceptLabel: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-foreground">Decline button</span>
          <input
            value={config.declineLabel}
            onChange={(e) => patch({ declineLabel: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-bold text-foreground">Footnote</span>
          <input
            value={config.footnote}
            onChange={(e) => patch({ footnote: e.target.value })}
            className={inputClass}
          />
          <span className="text-[11px] text-muted-foreground">
            {'Copy fields accept {n} (tasks picked), {name} and {frog}.'}
          </span>
        </label>
      </div>

      <div className="flex items-center justify-end gap-3">
        {message && (
          <span className="text-xs font-bold text-muted-foreground">{message}</span>
        )}
        <Button
          size="sm"
          className="rounded-xl font-black"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save starter plan'}
        </Button>
      </div>
    </div>
  );
}
