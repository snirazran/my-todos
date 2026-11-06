'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Dices, Gift, ImagePlus, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import {
  AdminCard,
  Chip,
  Field,
  NumberInput,
  PondButton,
  SectionLabel,
  Segmented,
  Toggle,
  ToggleRow,
  inputClass,
} from '@/components/admin/kit';
import { RewardTile, type QuestRewardCatalogItem } from '@/components/ui/QuestCards';
import { QUEST_METRIC_COPY } from '@/lib/quests/metricLabels';
import type { QuestPromptKind } from '@/lib/quests/types';
import { cn } from '@/lib/utils';
import {
  ENTRY_TYPES,
  PROMPT_CATEGORY_LABELS,
  PROMPT_KIND_EMOJI,
  PROMPT_KIND_LABELS,
  describeEntry,
  entryChance,
  entryMeta,
  newEntry,
  slotHeadline,
  withTypeDefaults,
  type AdminRecipe,
  type AdminRecipePoolEntry,
  type AdminRecipeSlot,
} from './types';

type PromptSummary = {
  promptId: string;
  kind: QuestPromptKind;
  question: string;
  category: string;
  isActive: boolean;
  dateKey: string | null;
};

export function DailyQuestEditor({
  recipe,
  onChange,
  rewardCatalog,
  onEditRewards,
  onOpenLibrary,
  onResetDefault,
  resetting,
  afterLineup,
}: {
  recipe: AdminRecipe;
  onChange: (updater: (recipe: AdminRecipe) => AdminRecipe) => void;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  onEditRewards: (slotId: string, kind: 'rewards' | 'bonus') => void;
  onOpenLibrary: () => void;
  onResetDefault: () => void;
  resetting: boolean;
  afterLineup?: React.ReactNode;
}) {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(recipe.slots[0]?.id ?? null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [prompts, setPrompts] = useState<PromptSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/quest-prompts', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.prompts) setPrompts(data.prompts as PromptSummary[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const slot = recipe.slots.find((item) => item.id === selectedSlotId) ?? recipe.slots[0] ?? null;
  const slotIndex = slot ? recipe.slots.indexOf(slot) : -1;
  const entry = slot?.pool.find((item) => item.id === selectedEntryId) ?? slot?.pool[0] ?? null;

  const patchSlot = (slotId: string, patch: Partial<AdminRecipeSlot>) =>
    onChange((prev) => ({
      ...prev,
      slots: prev.slots.map((item) => (item.id === slotId ? { ...item, ...patch } : item)),
    }));

  const patchEntry = (slotId: string, entryId: string, patch: Partial<AdminRecipePoolEntry>) =>
    onChange((prev) => ({
      ...prev,
      slots: prev.slots.map((item) =>
        item.id === slotId
          ? { ...item, pool: item.pool.map((e) => (e.id === entryId ? { ...e, ...patch } : e)) }
          : item,
      ),
    }));

  const replaceEntry = (slotId: string, next: AdminRecipePoolEntry) =>
    onChange((prev) => ({
      ...prev,
      slots: prev.slots.map((item) =>
        item.id === slotId ? { ...item, pool: item.pool.map((e) => (e.id === next.id ? next : e)) } : item,
      ),
    }));

  const addSlot = () => {
    const created: AdminRecipeSlot = {
      id: crypto.randomUUID(),
      pool: [newEntry('count')],
      rewards: [{ type: 'FLIES', amountMode: 'fixed', amount: 5 }],
    };
    onChange((prev) => ({ ...prev, slots: [...prev.slots, created] }));
    setSelectedSlotId(created.id);
    setSelectedEntryId(null);
  };

  const removeSlot = (slotId: string) => {
    onChange((prev) => ({ ...prev, slots: prev.slots.filter((item) => item.id !== slotId) }));
    setSelectedSlotId(recipe.slots.find((item) => item.id !== slotId)?.id ?? null);
    setSelectedEntryId(null);
  };

  const addVariation = (slotId: string) => {
    const created = newEntry('count');
    onChange((prev) => ({
      ...prev,
      slots: prev.slots.map((item) => (item.id === slotId ? { ...item, pool: [...item.pool, created] } : item)),
    }));
    setSelectedEntryId(created.id);
  };

  const removeVariation = (slotId: string, entryId: string) => {
    onChange((prev) => ({
      ...prev,
      slots: prev.slots.map((item) =>
        item.id === slotId ? { ...item, pool: item.pool.filter((e) => e.id !== entryId) } : item,
      ),
    }));
    setSelectedEntryId(null);
  };

  const readCover = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => onChange((prev) => ({ ...prev, coverImageUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <AdminCard bodyClassName="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex items-center gap-3">
          <Toggle
            checked={recipe.isActive}
            onChange={(isActive) => onChange((prev) => ({ ...prev, isActive }))}
            label="Daily quests on"
          />
          <div>
            <p className="text-[14px] font-black">{recipe.isActive ? 'Live for everyone' : 'Switched off'}</p>
            <p className="text-[12px] font-medium text-muted-foreground">Rolls fresh at each player&apos;s midnight</p>
          </div>
        </div>
        <Field label="Card title" className="min-w-[180px] flex-1">
          <input
            value={recipe.name}
            onChange={(event) => onChange((prev) => ({ ...prev, name: event.target.value }))}
            className={inputClass}
          />
        </Field>
        <div className="flex items-center gap-2">
          <label className="group relative flex h-14 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground transition hover:border-primary/40">
            {recipe.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={recipe.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <ImagePlus className="h-5 w-5" />
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) readCover(file);
              }}
            />
          </label>
          <div className="text-[12px] font-bold text-muted-foreground">
            <p>Cover art</p>
            {recipe.coverImageUrl ? (
              <button
                type="button"
                onClick={() => onChange((prev) => ({ ...prev, coverImageUrl: undefined }))}
                className="text-red-500/80 hover:text-red-500"
              >
                Remove
              </button>
            ) : (
              <p className="font-medium">optional</p>
            )}
          </div>
        </div>
      </AdminCard>

      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <SectionLabel>The day&apos;s lineup</SectionLabel>
            <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
              What every player sees on the Quests page. Tap a quest to change it.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {recipe.slots.map((item, index) => (
            <SlotCard
              key={item.id}
              slot={item}
              index={index}
              selected={item.id === slot?.id}
              rewardCatalog={rewardCatalog}
              onSelect={() => {
                setSelectedSlotId(item.id);
                setSelectedEntryId(null);
              }}
            />
          ))}
          <button
            type="button"
            onClick={addSlot}
            className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-border/80 text-[13px] font-black text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
          >
            <Plus className="h-5 w-5" />
            Add a quest
          </button>
        </div>
      </div>

      {slot && entry ? (
        <AdminCard
          title={`Quest ${slotIndex + 1}`}
          subtitle="What the player does, and what it pays."
          icon={<span className="text-[20px]">{entryMeta(entry.type).emoji}</span>}
          actions={
            recipe.slots.length > 1 ? (
              <PondButton variant="ghost" size="sm" onClick={() => removeSlot(slot.id)}>
                <Trash2 className="h-3.5 w-3.5" />
                Remove quest
              </PondButton>
            ) : null
          }
          bodyClassName="space-y-6"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>{slot.pool.length > 1 ? 'Each day, one of these is picked' : 'The task'}</SectionLabel>
              <button
                type="button"
                onClick={() => addVariation(slot.id)}
                className="inline-flex items-center gap-1 text-[12px] font-black text-primary hover:underline"
              >
                <Dices className="h-3.5 w-3.5" />
                {slot.pool.length > 1 ? 'Add another' : 'Mix it up with a variation'}
              </button>
            </div>

            {slot.pool.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {slot.pool.map((option) => {
                  const active = option.id === entry.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedEntryId(option.id)}
                      className={cn(
                        'flex max-w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left transition',
                        active
                          ? 'border-primary/40 bg-primary/10 shadow-[0_2px_0_0_hsl(var(--primary)/0.3)]'
                          : 'border-border bg-background hover:bg-muted/50',
                      )}
                    >
                      <span className="text-[16px]">{entryMeta(option.type).emoji}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-black">{describeEntry(option)}</span>
                        <span className="block text-[11px] font-bold text-muted-foreground">
                          {entryChance(slot, option)}% of days
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <EntryEditor
              key={entry.id}
              entry={entry}
              slot={slot}
              prompts={prompts}
              onPatch={(patch) => patchEntry(slot.id, entry.id, patch)}
              onTypeChange={(type) => replaceEntry(slot.id, withTypeDefaults(entry, type))}
              onRemove={slot.pool.length > 1 ? () => removeVariation(slot.id, entry.id) : undefined}
              onOpenLibrary={onOpenLibrary}
            />
          </div>

          <div className="grid gap-4 border-t border-border/60 pt-5 md:grid-cols-2">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Reward</SectionLabel>
                <PondButton variant="secondary" size="sm" onClick={() => onEditRewards(slot.id, 'rewards')}>
                  <Gift className="h-3.5 w-3.5" />
                  Edit
                </PondButton>
              </div>
              {slot.pool.every((option) => option.type === 'season_step') ? (
                <p className="rounded-2xl bg-amber-500/10 px-3 py-2 text-[12px] font-bold text-amber-700 dark:text-amber-400">
                  Pays the season&apos;s tier prize. Add a variation so there&apos;s still a quest when no season is running.
                </p>
              ) : slot.pool.some((option) => option.type === 'season_step') ? (
                <p className="text-[12px] font-medium text-muted-foreground">
                  The season climb pays its tier prize. This reward is for the other variations.
                </p>
              ) : null}
              {slot.rewards.length > 1 ? (
                <p className="text-[12px] font-bold text-muted-foreground">Pays one of these at random</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {slot.rewards.map((reward, index) => (
                  <RewardTile
                    key={`${index}-${reward.type}-${reward.itemId ?? reward.amount ?? ''}`}
                    reward={reward}
                    rewardCatalog={rewardCatalog}
                    isPremium={false}
                  />
                ))}
                {slot.rewards.length === 0 ? (
                  <p className="text-[12px] font-bold text-muted-foreground">No reward yet</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>Lucky bonus</SectionLabel>
                <PondButton variant="secondary" size="sm" onClick={() => onEditRewards(slot.id, 'bonus')}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {(slot.bonusRewards?.length ?? 0) > 0 ? 'Edit' : 'Add'}
                </PondButton>
              </div>
              {(slot.bonusRewards?.length ?? 0) === 0 ? (
                <p className="text-[12px] font-medium text-muted-foreground">
                  An extra surprise that sometimes lands on top of the reward.
                </p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {(slot.bonusRewards ?? []).map((bonus, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <RewardTile reward={bonus.reward} rewardCatalog={rewardCatalog} isPremium={false} />
                      <NumberInput
                        className="w-24"
                        min={1}
                        max={100}
                        value={Math.round(bonus.chance * 100)}
                        suffix="%"
                        onChange={(value) =>
                          patchSlot(slot.id, {
                            bonusRewards: (slot.bonusRewards ?? []).map((item, i) =>
                              i === index ? { ...item, chance: Math.min(100, Math.max(1, value)) / 100 } : item,
                            ),
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </AdminCard>
      ) : null}

      {afterLineup}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {confirmReset ? (
          <>
            <span className="text-[12px] font-black text-red-500">Replace the lineup with the built-in default?</span>
            <PondButton variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
              Keep mine
            </PondButton>
            <PondButton
              variant="danger"
              size="sm"
              loading={resetting}
              onClick={() => {
                onResetDefault();
                setConfirmReset(false);
              }}
            >
              Reset
            </PondButton>
          </>
        ) : (
          <PondButton variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset lineup to default
          </PondButton>
        )}
      </div>
    </div>
  );
}

function SlotCard({
  slot,
  index,
  selected,
  rewardCatalog,
  onSelect,
}: {
  slot: AdminRecipeSlot;
  index: number;
  selected: boolean;
  rewardCatalog: Record<string, QuestRewardCatalogItem>;
  onSelect: () => void;
}) {
  const lead = slot.pool.length === 1 ? slot.pool[0] : [...slot.pool].sort((a, b) => b.weight - a.weight)[0];
  const meta = entryMeta(lead.type);
  const seasonOnly = lead.type === 'season_step';
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'relative flex min-h-[150px] flex-col gap-3 rounded-[22px] border bg-card p-4 text-left transition',
        selected
          ? 'border-primary/50 shadow-[0_4px_0_0_hsl(var(--primary)/0.45)] ring-2 ring-primary/25'
          : 'border-border/70 shadow-[0_3px_0_0_hsl(var(--border))] hover:-translate-y-0.5',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-[22px] shadow-[0_3px_0_0_hsl(var(--primary)/0.2)]">
          {meta.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.1em] text-muted-foreground">Quest {index + 1}</p>
          <p className="text-[15px] font-black leading-snug text-foreground">{slotHeadline(slot)}</p>
        </div>
      </div>
      <div className="relative h-5 overflow-hidden rounded-full bg-muted">
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-muted-foreground">
          0 / {lead.minTarget === lead.maxTarget ? lead.maxTarget : `${lead.minTarget}–${lead.maxTarget}`}
        </span>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {seasonOnly ? (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-black text-amber-700 dark:text-amber-400">
            🏆 Season tier prize
          </span>
        ) : (
          slot.rewards.slice(0, 3).map((reward, rewardIndex) => (
            <RewardTile
              key={`${rewardIndex}-${reward.type}`}
              reward={reward}
              rewardCatalog={rewardCatalog}
              isPremium={false}
              compact
            />
          ))
        )}
        {slot.pool.length > 1 ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-black text-muted-foreground">
            <Dices className="h-3 w-3" />1 of {slot.pool.length}
          </span>
        ) : null}
      </div>
    </button>
  );
}

const METRIC_OPTIONS = Object.entries(QUEST_METRIC_COPY).map(([key, copy]) => ({ key, label: copy.adminLabel }));

function EntryEditor({
  entry,
  slot,
  prompts,
  onPatch,
  onTypeChange,
  onRemove,
  onOpenLibrary,
}: {
  entry: AdminRecipePoolEntry;
  slot: AdminRecipeSlot;
  prompts: PromptSummary[] | null;
  onPatch: (patch: Partial<AdminRecipePoolEntry>) => void;
  onTypeChange: (type: AdminRecipePoolEntry['type']) => void;
  onRemove?: () => void;
  onOpenLibrary: () => void;
}) {
  const isStreak = entry.type === 'metric_count' && !!entry.metricKey?.startsWith('task_streak');
  const showRange = entry.type !== 'season_step' && entry.type !== 'prompt';
  const rangeUnit =
    entry.type === 'focus_minutes'
      ? 'minutes'
      : entry.type === 'deep_session'
        ? 'sessions'
        : entry.type === 'day_parts'
          ? 'parts'
          : entry.type === 'distinct_days'
            ? 'days'
            : entry.type === 'count'
              ? 'tasks'
              : isStreak
                ? 'tasks'
                : 'times';

  return (
    <div className="space-y-5 rounded-[20px] bg-muted/40 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ENTRY_TYPES.map((option) => {
          const active = option.type === entry.type;
          return (
            <button
              key={option.type}
              type="button"
              onClick={() => !active && onTypeChange(option.type)}
              className={cn(
                'flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left transition',
                active
                  ? 'border-primary/50 bg-card shadow-[0_3px_0_0_hsl(var(--primary)/0.35)]'
                  : 'border-transparent bg-card/60 hover:bg-card',
              )}
            >
              <span className="text-[18px]">{option.emoji}</span>
              <span className="min-w-0">
                <span className={cn('block text-[13px] font-black', active ? 'text-foreground' : 'text-muted-foreground')}>
                  {option.label}
                </span>
                <span className="block truncate text-[11px] font-medium text-muted-foreground">{option.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl bg-card px-4 py-3 shadow-[0_2px_0_0_hsl(var(--border))]">
        <p className="text-[11px] font-black uppercase tracking-[0.1em] text-muted-foreground">Players read</p>
        <p className="text-[15px] font-black">{describeEntry(entry)}</p>
      </div>

      {entry.type === 'count' ? (
        <Segmented
          value={entry.action ?? 'complete'}
          onChange={(action) =>
            onPatch({
              action,
              requiresFollowThrough: action === 'add' ? entry.requiresFollowThrough : undefined,
              beforeHour: action === 'complete' ? entry.beforeHour : undefined,
            })
          }
          options={[
            { value: 'complete', label: 'Finish tasks' },
            { value: 'add', label: 'Add tasks' },
          ]}
        />
      ) : null}

      {entry.type === 'metric_count' ? (
        <Field label="Which action">
          <select
            value={isStreak ? 'task_streak_3' : entry.metricKey ?? 'trade_completed'}
            onChange={(event) => {
              const metricKey = event.target.value;
              onPatch({
                metricKey,
                ...(metricKey.startsWith('task_streak')
                  ? { streakDaysMin: entry.streakDaysMin ?? 3, streakDaysMax: entry.streakDaysMax ?? 3 }
                  : { streakDaysMin: undefined, streakDaysMax: undefined }),
              });
            }}
            className={inputClass}
          >
            {METRIC_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {showRange ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={`At least (${rangeUnit})`}>
            <NumberInput
              min={1}
              max={entry.type === 'day_parts' ? 3 : 10_000}
              value={entry.minTarget}
              onChange={(value) => onPatch({ minTarget: value, maxTarget: Math.max(value, entry.maxTarget) })}
            />
          </Field>
          <Field label={`At most (${rangeUnit})`} hint="Same number = always that target">
            <NumberInput
              min={1}
              max={entry.type === 'day_parts' ? 3 : 10_000}
              value={entry.maxTarget}
              onChange={(value) => onPatch({ maxTarget: value, minTarget: Math.min(value, entry.minTarget) })}
            />
          </Field>
          {entry.type === 'deep_session' ? (
            <Field label="Minutes per session">
              <NumberInput min={5} max={240} value={entry.sessionMinutes ?? 25} onChange={(value) => onPatch({ sessionMinutes: value })} />
            </Field>
          ) : null}
          {entry.type === 'count' && (entry.action ?? 'complete') === 'complete' ? (
            <Field label="Before hour" hint="0 = any time of day">
              <NumberInput
                min={0}
                max={23}
                value={entry.beforeHour ?? 0}
                suffix=":00"
                onChange={(value) => onPatch({ beforeHour: value >= 1 && value <= 23 ? value : undefined })}
              />
            </Field>
          ) : null}
          {isStreak ? (
            <Field label="Streak length (days)">
              <NumberInput
                min={2}
                max={60}
                value={entry.streakDaysMin ?? 3}
                onChange={(value) => onPatch({ streakDaysMin: value, streakDaysMax: value })}
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      {entry.type === 'count' && entry.action === 'add' ? (
        <ToggleRow
          title="They must finish them too"
          description="Only tasks added today and finished today count."
          checked={!!entry.requiresFollowThrough}
          onChange={(value) => onPatch({ requiresFollowThrough: value })}
        />
      ) : null}

      {entry.type === 'count' || entry.type === 'focus_minutes' ? (
        <div className="space-y-3">
          <ToggleRow
            title="Fit it to the player"
            description="Use a share of their usual day instead, kept inside the range above."
            checked={!!entry.scaleFromHistory}
            onChange={(value) => onPatch({ scaleFromHistory: value, scaleFactor: value ? entry.scaleFactor ?? 1 : undefined })}
          />
          {entry.scaleFromHistory ? (
            <Field label="Share of their usual day" className="max-w-[200px]">
              <NumberInput
                min={10}
                max={300}
                value={Math.round((entry.scaleFactor ?? 1) * 100)}
                suffix="%"
                onChange={(value) => onPatch({ scaleFactor: Math.min(3, Math.max(0.1, value / 100)) })}
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      {entry.type === 'season_step' ? (
        <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">
          Progress is the player&apos;s tasks today toward one season step. They claim the tier prize right from the
          quest row. When no season is running (or they&apos;ve maxed it), another variation in this quest is used.
        </p>
      ) : null}

      {entry.type === 'prompt' ? <PromptFilters entry={entry} prompts={prompts} onPatch={onPatch} onOpenLibrary={onOpenLibrary} /> : null}

      {slot.pool.length > 1 ? (
        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border/60 pt-4">
          <Field label="How often" hint={`${entryChance(slot, entry)}% of days`} className="w-40">
            <NumberInput min={1} max={1000} value={entry.weight} onChange={(value) => onPatch({ weight: value })} suffix="pts" />
          </Field>
          {onRemove ? (
            <PondButton variant="ghost" size="sm" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" />
              Remove this variation
            </PondButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PromptFilters({
  entry,
  prompts,
  onPatch,
  onOpenLibrary,
}: {
  entry: AdminRecipePoolEntry;
  prompts: PromptSummary[] | null;
  onPatch: (patch: Partial<AdminRecipePoolEntry>) => void;
  onOpenLibrary: () => void;
}) {
  const kinds = entry.promptKinds ?? [];
  const categories = entry.promptCategories ?? [];
  const toggle = <T extends string>(list: T[], value: T) =>
    list.indexOf(value) >= 0 ? list.filter((item) => item !== value) : [...list, value];

  const matching = useMemo(
    () =>
      (prompts ?? []).filter(
        (prompt) =>
          prompt.isActive &&
          (kinds.length === 0 || kinds.indexOf(prompt.kind) >= 0) &&
          (categories.length === 0 || categories.indexOf(prompt.category) >= 0),
      ),
    [prompts, kinds, categories],
  );

  const samples = matching.filter((prompt) => !prompt.dateKey).slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[12px] font-black text-muted-foreground">Question types {kinds.length === 0 ? '· all' : ''}</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(PROMPT_KIND_LABELS) as QuestPromptKind[]).map((kind) => (
            <Chip
              key={kind}
              active={kinds.indexOf(kind) >= 0}
              onClick={() => {
                const next = toggle(kinds, kind);
                onPatch({ promptKinds: next.length ? next : undefined });
              }}
            >
              {PROMPT_KIND_EMOJI[kind]} {PROMPT_KIND_LABELS[kind]}
            </Chip>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-[12px] font-black text-muted-foreground">Topics {categories.length === 0 ? '· all' : ''}</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(PROMPT_CATEGORY_LABELS).map((category) => (
            <Chip
              key={category}
              tone="grape"
              active={categories.indexOf(category) >= 0}
              onClick={() => {
                const next = toggle(categories, category);
                onPatch({ promptCategories: next.length ? next : undefined });
              }}
            >
              {PROMPT_CATEGORY_LABELS[category]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-card p-4 shadow-[0_2px_0_0_hsl(var(--border))]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn('text-[13px] font-black', prompts && matching.length === 0 ? 'text-red-500' : 'text-foreground')}>
            {prompts === null
              ? 'Counting questions…'
              : matching.length === 0
                ? 'No active questions match. This quest has nothing to ask.'
                : `${matching.length} questions in rotation`}
          </p>
          <button
            type="button"
            onClick={onOpenLibrary}
            className="inline-flex items-center gap-1 text-[12px] font-black text-primary hover:underline"
          >
            Open the question library
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {samples.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {samples.map((prompt) => (
              <li key={prompt.promptId} className="flex items-start gap-2 text-[13px] font-semibold text-muted-foreground">
                <span>{PROMPT_KIND_EMOJI[prompt.kind]}</span>
                <span className="min-w-0">{prompt.question}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-[11px] font-medium text-muted-foreground">
          A question isn&apos;t repeated for a player within its cooldown, and topics alternate day to day. Answering
          finishes the quest and pays the reward.
        </p>
      </div>
    </div>
  );
}
