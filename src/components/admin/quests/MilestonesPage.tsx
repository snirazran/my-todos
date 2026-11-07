'use client';

import React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import {
  AdminCard,
  ConfigShell,
  EmptyState,
  Field,
  NumberInput,
  PondButton,
  ResetLink,
  SaveBar,
  Toggle,
  ToggleRow,
  inputClass,
} from '@/components/admin/kit';
import { RewardEditButton, RewardStrip, useRewardCatalog } from '@/components/admin/pickers';
import { useAdminConfig } from '@/components/admin/useAdminConfig';
import {
  MILESTONE_LIMITS,
  MILESTONE_METRICS,
  MILESTONE_METRIC_KEYS,
  type MilestoneConfig,
  type MilestoneMetric,
  type MilestoneStep,
  type MilestoneTrack,
} from '@/lib/quests/milestones';
import { cn } from '@/lib/utils';

function newTrackId(tracks: MilestoneTrack[]) {
  let n = tracks.length + 1;
  const taken = new Set(tracks.map((track) => track.id));
  while (taken.has(`milestone-${n}`)) n += 1;
  return `milestone-${n}`;
}

function nextTarget(steps: MilestoneStep[]) {
  const last = steps[steps.length - 1]?.target ?? 0;
  const prev = steps[steps.length - 2]?.target ?? 0;
  return last > 0 ? last + Math.max(1, last - prev) : 1;
}

export function MilestonesPage() {
  const milestones = useAdminConfig<MilestoneConfig>({
    url: '/api/admin/quests/milestones',
    read: (payload) => payload?.milestones ?? null,
  });
  const catalog = useRewardCatalog();
  const config = milestones.config;
  const defaults: MilestoneConfig | null = milestones.payload?.defaults ?? null;

  const setTrack = (index: number, next: Partial<MilestoneTrack>) =>
    milestones.set((prev) => ({
      ...prev,
      tracks: prev.tracks.map((track, i) => (i === index ? { ...track, ...next } : track)),
    }));

  const moveTrack = (index: number, delta: number) =>
    milestones.set((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.tracks.length) return prev;
      const tracks = [...prev.tracks];
      [tracks[index], tracks[target]] = [tracks[target], tracks[index]];
      return { ...prev, tracks };
    });

  const removeTrack = (index: number) =>
    milestones.set((prev) => ({ ...prev, tracks: prev.tracks.filter((_, i) => i !== index) }));

  const addTrack = () =>
    milestones.set((prev) => ({
      ...prev,
      tracks: [
        ...prev.tracks,
        {
          id: newTrackId(prev.tracks),
          name: 'New milestone',
          emoji: '🏆',
          metric: MILESTONE_METRIC_KEYS[0],
          steps: [
            { target: 3, rewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 5 }] },
            { target: 10, rewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 10 }] },
          ],
          repeatEvery: 0,
          isActive: true,
        },
      ],
    }));

  return (
    <ConfigShell loading={milestones.loading} error={milestones.error}>
      {config ? (
        <div className="space-y-5">
          <AdminCard
            title="Milestones"
            subtitle="Lifetime goals under the daily quests. Claiming one level reveals the next, bigger one. Steps a player already passed are ready to claim, one level at a time."
            icon={<span className="text-[20px]">🏆</span>}
            actions={defaults ? <ResetLink onClick={() => milestones.set(() => defaults)} /> : null}
          >
            <ToggleRow
              title={config.isActive ? 'Milestones are on' : 'Milestones are off'}
              description="Off hides the whole section on the Quests page."
              checked={config.isActive}
              onChange={(isActive) => milestones.patch({ isActive })}
            />
          </AdminCard>

          {config.tracks.length === 0 ? (
            <EmptyState>No milestones yet.</EmptyState>
          ) : (
            config.tracks.map((track, index) => (
              <TrackEditor
                key={track.id}
                track={track}
                index={index}
                count={config.tracks.length}
                catalog={catalog}
                onChange={(next) => setTrack(index, next)}
                onMove={(delta) => moveTrack(index, delta)}
                onRemove={() => removeTrack(index)}
              />
            ))
          )}

          {config.tracks.length < MILESTONE_LIMITS.maxTracks ? (
            <button
              type="button"
              onClick={addTrack}
              className="flex h-12 w-full items-center justify-center gap-1.5 rounded-[20px] border-2 border-dashed border-border text-[13px] font-black text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            >
              <Plus className="h-4 w-4" />
              Add a milestone
            </button>
          ) : null}

          <SaveBar
            dirty={milestones.dirty}
            saving={milestones.saving}
            onSave={() => void milestones.save()}
            onDiscard={milestones.discard}
          />
        </div>
      ) : null}
    </ConfigShell>
  );
}

function TrackEditor({
  track,
  index,
  count,
  catalog,
  onChange,
  onMove,
  onRemove,
}: {
  track: MilestoneTrack;
  index: number;
  count: number;
  catalog: ReturnType<typeof useRewardCatalog>;
  onChange: (next: Partial<MilestoneTrack>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const copy = MILESTONE_METRICS[track.metric];
  const setStep = (stepIndex: number, next: Partial<MilestoneStep>) =>
    onChange({
      steps: track.steps.map((step, i) => (i === stepIndex ? { ...step, ...next } : step)),
    });
  const outOfOrder = track.steps.some((step, i) => i > 0 && step.target <= track.steps[i - 1].target);

  return (
    <section
      className={cn(
        'rounded-[24px] border border-border/70 bg-card p-4 shadow-[0_3px_0_0_hsl(var(--border))] md:p-5',
        !track.isActive && 'opacity-70',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={track.emoji}
          onChange={(event) => onChange({ emoji: event.target.value })}
          aria-label="Emoji"
          className={cn(inputClass, 'w-14 px-0 text-center text-[18px]')}
        />
        <input
          value={track.name}
          onChange={(event) => onChange({ name: event.target.value })}
          aria-label="Name"
          maxLength={40}
          className={cn(inputClass, 'min-w-0 flex-1 basis-40')}
        />
        <div className="flex items-center gap-1">
          <Toggle checked={track.isActive} onChange={(isActive) => onChange({ isActive })} label="Active" />
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move up"
            className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label="Move down"
            className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Delete milestone"
            className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <Field label="Counts" hint={copy.adminHint} className="mt-4">
        <select
          value={track.metric}
          onChange={(event) => onChange({ metric: event.target.value as MilestoneMetric })}
          className={inputClass}
        >
          {MILESTONE_METRIC_KEYS.map((key) => (
            <option key={key} value={key}>
              {MILESTONE_METRICS[key].adminLabel}
            </option>
          ))}
        </select>
      </Field>

      <ol className="mt-4 space-y-2">
        {track.steps.map((step, stepIndex) => (
          <li key={stepIndex} className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/40 p-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-[13px] font-black text-white shadow-[0_3px_0_0_rgba(194,65,12,0.35)]">
              {stepIndex + 1}
            </span>
            <span className="w-32 shrink-0">
              <NumberInput
                value={step.target}
                min={1}
                max={MILESTONE_LIMITS.maxTarget}
                suffix={copy.unit}
                onChange={(target) => setStep(stepIndex, { target })}
              />
            </span>
            <span className="min-w-0 flex-1 basis-40">
              <span className="block truncate text-[12px] font-bold text-muted-foreground">
                “{copy.label(step.target)}”
              </span>
              <span className="mt-1 block">
                <RewardStrip rewards={step.rewards} rewardCatalog={catalog.byId} empty="No prize" />
              </span>
            </span>
            <span className="flex items-center gap-1">
              <RewardEditButton
                rewards={step.rewards}
                rewardCatalog={catalog.byId}
                rewardItems={catalog.items}
                onChange={(rewards) => setStep(stepIndex, { rewards })}
              />
              {track.steps.length > 1 ? (
                <button
                  type="button"
                  onClick={() => onChange({ steps: track.steps.filter((_, i) => i !== stepIndex) })}
                  aria-label="Remove level"
                  className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground/70 transition hover:bg-red-500/10 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      {outOfOrder ? (
        <p className="mt-2 text-[12px] font-bold text-red-600 dark:text-red-400">
          Each level needs a bigger number than the one before. Levels out of order are dropped on save.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {track.steps.length < MILESTONE_LIMITS.maxSteps ? (
          <PondButton
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({
                steps: [
                  ...track.steps,
                  {
                    target: nextTarget(track.steps),
                    rewards: track.steps[track.steps.length - 1]?.rewards ?? [],
                  },
                ],
              })
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add level
          </PondButton>
        ) : null}
        <Field
          label="After the last level"
          hint={
            track.repeatEvery > 0
              ? `Keeps going: +${track.repeatEvery} ${copy.unit} each time, same prize as the last level.`
              : 'Stops. Set a number to keep adding levels forever.'
          }
          className="min-w-[12rem] flex-1"
        >
          <NumberInput
            value={track.repeatEvery}
            min={0}
            max={MILESTONE_LIMITS.maxTarget}
            suffix={copy.unit}
            onChange={(repeatEvery) => onChange({ repeatEvery })}
          />
        </Field>
      </div>
    </section>
  );
}
