'use client';

import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  MAX_STARTER_TASKS_PER_CATEGORY,
  STARTER_PLAN_MAX_PER_AREA_LIMIT,
  STARTER_PLAN_MAX_TASKS_LIMIT,
  starterCadenceLabel,
  STARTER_MOMENTS,
  type StarterCadence,
  type StarterMoment,
  type StarterPlanConfig,
  type StarterTaskTemplate,
} from '@/lib/quests/starterPlan';
import { defaultStarterTasksFor } from '@/lib/quests/starterPlanDefaults';
import {
  AdminCard,
  ConfigShell,
  Field,
  FieldGrid,
  NumberInput,
  SaveBar,
  ToggleRow,
  inputClass as kitInputClass,
} from '@/components/admin/kit';
import { useAdminConfig } from '@/components/admin/useAdminConfig';

const inputClass =
  'h-9 rounded-lg border border-border/60 bg-background px-2.5 text-sm font-medium text-foreground outline-none focus:border-primary';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const MOMENT_LABELS: Record<StarterMoment, string> = {
  wake: 'On waking',
  morning: 'Morning',
  day: 'Daytime',
  evening: 'Evening',
  night: 'Bedtime',
};

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
          <p className="text-[13px] font-black text-muted-foreground">
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
                value={task.emoji ?? ''}
                onChange={(e) => update(task.id, { emoji: e.target.value || undefined })}
                placeholder="Emoji"
                maxLength={8}
                className={cn(inputClass, 'w-[72px] text-center')}
              />

              <select
                value={task.moment ?? 'day'}
                onChange={(e) => update(task.id, { moment: e.target.value as StarterMoment })}
                className={cn(inputClass, 'w-[120px]')}
              >
                {STARTER_MOMENTS.map((moment) => (
                  <option key={moment} value={moment}>
                    {MOMENT_LABELS[moment]}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                <input
                  type="checkbox"
                  checked={task.enabled !== false}
                  onChange={(e) => update(task.id, { enabled: e.target.checked })}
                />
                Live
              </label>
            </div>

            <p className="mt-1 text-[10px] font-medium text-muted-foreground">
              {starterCadenceLabel(task.cadence, task.days)} · {MOMENT_LABELS[task.moment ?? 'day']}
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
  const plan = useAdminConfig<StarterPlanConfig>({
    url: '/api/admin/starter-plan',
    read: (payload) => payload?.starterPlan ?? null,
    write: (starterPlan) => ({ starterPlan }),
  });
  const config = plan.config;
  const fillPreview = (text: string) =>
    text.replace(/{name}/g, 'Sam').replace(/{frog}/g, 'Pebble').replace(/{n}/g, String(config?.maxTasks ?? 5));

  return (
    <ConfigShell loading={plan.loading} error={plan.error}>
      {config ? (
        <AdminCard
          title="Starter plan"
          subtitle="The last onboarding screen: a few easy daily goals built from the areas each player picked."
          icon={<span className="text-[20px]">🌱</span>}
        >
          <div className="space-y-5">
            <ToggleRow
              title={config.isActive ? 'Offered to new players' : 'Switched off'}
              description="Off skips the starter plan screen entirely."
              checked={config.isActive}
              onChange={(isActive) => plan.patch({ isActive })}
            />
            <FieldGrid cols={2}>
              <Field label="Goals in a plan" hint="Keep it small. Long plans get skipped.">
                <NumberInput value={config.maxTasks} min={1} max={STARTER_PLAN_MAX_TASKS_LIMIT} onChange={(maxTasks) => plan.patch({ maxTasks })} />
              </Field>
              <Field label="Most goals per area" hint="Areas take turns before any area gets a second goal.">
                <NumberInput value={config.maxPerArea} min={1} max={STARTER_PLAN_MAX_PER_AREA_LIMIT} onChange={(maxPerArea) => plan.patch({ maxPerArea })} />
              </Field>
            </FieldGrid>
            <ToggleRow
              title="Give each area its own tag"
              description="Creates and links the area's tag, so the plan already counts toward it. Stops at the player's tag limit."
              checked={config.linkTags}
              onChange={(linkTags) => plan.patch({ linkTags })}
            />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <div className="space-y-3">
                <Field label="Headline">
                  <input value={config.headline} onChange={(event) => plan.patch({ headline: event.target.value })} className={kitInputClass} />
                </Field>
                <Field label="Subheadline">
                  <input value={config.subheadline} onChange={(event) => plan.patch({ subheadline: event.target.value })} className={kitInputClass} />
                </Field>
                <Field label="Button" hint="{name} is the player, {frog} their frog, {n} the number of goals.">
                  <input value={config.acceptLabel} onChange={(event) => plan.patch({ acceptLabel: event.target.value })} className={kitInputClass} />
                </Field>
              </div>
              <div className="flex flex-col items-center justify-center gap-2 rounded-[22px] bg-gradient-to-b from-emerald-100 to-emerald-50 p-5 text-center dark:from-emerald-950 dark:to-emerald-900/40">
                <p className="text-[11px] font-black uppercase tracking-[0.1em] text-emerald-700/70 dark:text-emerald-300/70">Players see</p>
                <p className="text-[18px] font-black leading-tight text-emerald-950 dark:text-emerald-50">{fillPreview(config.headline || "{name}'s starter plan")}</p>
                <p className="text-[13px] font-semibold text-emerald-900/70 dark:text-emerald-100/70">{fillPreview(config.subheadline || 'Try these easy goals with {frog}!')}</p>
                <span className="mt-2 rounded-2xl bg-primary px-5 py-2.5 text-[14px] font-black text-primary-foreground shadow-[0_3px_0_0_#2c511a]">
                  {fillPreview(config.acceptLabel || "Let's do it!")}
                </span>
              </div>
            </div>
          </div>
        </AdminCard>
      ) : null}
      <SaveBar
        dirty={plan.dirty}
        saving={plan.saving}
        onSave={() => void plan.save()}
        onDiscard={plan.discard}
        label="Starter plan has unsaved changes"
      />
    </ConfigShell>
  );
}
