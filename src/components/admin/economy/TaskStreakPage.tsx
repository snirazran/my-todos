'use client';

import React from 'react';
import { Flame, Plus, Trash2 } from 'lucide-react';
import {
  AdminCard,
  AdminPage,
  ConfigShell,
  Field,
  FieldGrid,
  NumberInput,
  PondButton,
  ResetLink,
  SaveBar,
} from '@/components/admin/kit';
import { GiftPicker } from '@/components/admin/pickers';
import { useEconomy } from '@/components/admin/useEconomy';
import { FLY_ECONOMY_DEFAULTS, type FlyEconomyConfig } from '@/lib/economy/defaults';
import { cn } from '@/lib/utils';

type Streak = FlyEconomyConfig['taskStreak'];

export function TaskStreakPage() {
  const economy = useEconomy();
  const streak = economy.config?.taskStreak;
  const patch = (next: Partial<Streak>) => economy.patchGroup('taskStreak', next);

  const patchTier = (index: number, next: Partial<Streak['tiers'][number]>) =>
    streak && patch({ tiers: streak.tiers.map((tier, i) => (i === index ? { ...tier, ...next } : tier)) });

  const patchMilestone = (index: number, next: Partial<Streak['milestones'][number]>) =>
    streak &&
    patch({ milestones: streak.milestones.map((milestone, i) => (i === index ? { ...milestone, ...next } : milestone)) });

  const maxTierFlies = Math.max(1, ...(streak?.tiers ?? []).map((tier) => tier.flies));

  return (
    <AdminPage
      title="Task streaks"
      subtitle="What a repeating task pays as its streak grows, the one-time milestone prizes, and the free missed day."
      icon={<Flame />}
      actions={<ResetLink onClick={() => economy.patchGroup('taskStreak', FLY_ECONOMY_DEFAULTS.taskStreak)}>Load defaults</ResetLink>}
    >
      <ConfigShell loading={economy.loading} error={economy.error}>
        {streak ? (
          <div className="space-y-5">
            <AdminCard
              title="Flies per check-off"
              subtitle="Replaces the normal fly, never stacks with it, and stops climbing at the last step."
              icon={<span className="text-[20px]">🔥</span>}
              tone="sun"
            >
              <div className="flex items-end gap-2 overflow-x-auto pb-1">
                {streak.tiers.map((tier, index) => (
                  <div key={index} className="group flex w-[96px] shrink-0 flex-col items-stretch gap-2">
                    <div className="flex h-[110px] items-end justify-center">
                      <div
                        className="flex w-full items-start justify-center rounded-t-2xl bg-gradient-to-t from-amber-400 to-orange-400 pt-1.5 text-[13px] font-black text-white shadow-[0_3px_0_0_rgba(194,65,12,0.35)]"
                        style={{ height: `${28 + (tier.flies / maxTierFlies) * 82}px` }}
                      >
                        {tier.flies}🪰
                      </div>
                    </div>
                    <Field label="From day">
                      <NumberInput value={tier.minDays} min={1} max={3650} onChange={(minDays) => patchTier(index, { minDays })} />
                    </Field>
                    <Field label="Pays">
                      <NumberInput value={tier.flies} max={100} onChange={(flies) => patchTier(index, { flies })} />
                    </Field>
                    <button
                      type="button"
                      onClick={() => patch({ tiers: streak.tiers.filter((_, i) => i !== index) })}
                      disabled={streak.tiers.length <= 1}
                      className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500 disabled:opacity-30"
                      aria-label="Remove step"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const last = streak.tiers[streak.tiers.length - 1];
                    patch({
                      tiers: [...streak.tiers, { minDays: (last?.minDays ?? 0) + 7, flies: (last?.flies ?? 1) + 1 }],
                    });
                  }}
                  className="mb-[52px] flex h-[110px] w-[96px] shrink-0 flex-col items-center justify-center gap-1 self-start rounded-2xl border-2 border-dashed border-border text-[12px] font-black text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                >
                  <Plus className="h-5 w-5" />
                  Add step
                </button>
              </div>
            </AdminCard>

            <AdminCard
              title="Milestones"
              subtitle="One-time prizes per task. Only a few land per day across every task; the rest wait for tomorrow."
              icon={<span className="text-[20px]">🏅</span>}
              actions={
                <PondButton
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const last = streak.milestones[streak.milestones.length - 1];
                    patch({
                      milestones: [...streak.milestones, { atDays: (last?.atDays ?? 0) + 30, flies: last?.flies ?? 30 }],
                    });
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add milestone
                </PondButton>
              }
            >
              <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-[27px] before:top-6 before:w-1 before:rounded-full before:bg-amber-400/40">
                {streak.milestones.map((milestone, index) => (
                  <li key={index} className="relative grid grid-cols-[56px_minmax(0,1fr)_auto] items-start gap-3">
                    <div className="z-[1] flex h-14 w-14 flex-col items-center justify-center rounded-2xl bg-amber-400 text-white shadow-[0_3px_0_0_rgba(180,83,9,0.45)]">
                      <span className="text-[18px] font-black leading-none">{milestone.atDays}</span>
                      <span className="text-[10px] font-black uppercase">days</span>
                    </div>
                    <div className="grid gap-3 rounded-2xl bg-muted/45 p-3 sm:grid-cols-[6rem_6rem_minmax(0,1fr)_6rem]">
                      <Field label="Day">
                        <NumberInput value={milestone.atDays} min={1} max={3650} onChange={(atDays) => patchMilestone(index, { atDays })} />
                      </Field>
                      <Field label="Flies">
                        <NumberInput value={milestone.flies} max={1000} onChange={(flies) => patchMilestone(index, { flies })} />
                      </Field>
                      <Field label="Gift">
                        <GiftPicker allowNone value={milestone.giftItemId ?? ''} onChange={(giftItemId) => patchMilestone(index, { giftItemId })} />
                      </Field>
                      <Field label="Lily Pads">
                        <NumberInput value={milestone.shields ?? 0} max={5} onChange={(shields) => patchMilestone(index, { shields })} />
                      </Field>
                    </div>
                    <button
                      type="button"
                      onClick={() => patch({ milestones: streak.milestones.filter((_, i) => i !== index) })}
                      className="mt-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
                      aria-label="Remove milestone"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
                <li className="relative grid grid-cols-[56px_minmax(0,1fr)_auto] items-start gap-3">
                  <div className="z-[1] flex h-14 w-14 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-amber-400 bg-card text-amber-600">
                    <span className="text-[16px] font-black leading-none">∞</span>
                    <span className="text-[10px] font-black uppercase">after</span>
                  </div>
                  <div className={cn('grid gap-3 rounded-2xl border-2 border-dashed border-border p-3 sm:grid-cols-[6rem_6rem_minmax(0,1fr)_6rem]')}>
                    <Field label="Every">
                      <NumberInput value={streak.repeatEveryDays} max={365} suffix="days" onChange={(repeatEveryDays) => patch({ repeatEveryDays })} />
                    </Field>
                    <Field label="Flies">
                      <NumberInput value={streak.repeatFlies} max={1000} onChange={(repeatFlies) => patch({ repeatFlies })} />
                    </Field>
                    <Field label="Gift">
                      <GiftPicker allowNone value={streak.repeatGiftItemId} onChange={(repeatGiftItemId) => patch({ repeatGiftItemId })} />
                    </Field>
                    <Field label="Lily Pads">
                      <NumberInput value={streak.repeatShields} max={5} onChange={(repeatShields) => patch({ repeatShields })} />
                    </Field>
                  </div>
                  <span className="w-8" />
                </li>
              </ol>
              <p className="mt-3 pl-[68px] text-[12px] font-medium text-muted-foreground">
                The dashed row repeats forever after the last milestone, so a habit kept for years still has something ahead.
              </p>
            </AdminCard>

            <AdminCard
              title="Fairness"
              subtitle="A single missed day should never cost a long habit."
              icon={<span className="text-[20px]">🤝</span>}
              tone="sky"
            >
              <FieldGrid cols={2}>
                <Field label="Milestone prizes a day" hint="Across every task. Extras wait for tomorrow.">
                  <NumberInput value={streak.milestonesPerDay} max={20} onChange={(milestonesPerDay) => patch({ milestonesPerDay })} />
                </Field>
                <Field label="One free missed day every" hint="Bridged automatically, no prompt, no Lily Pad spent.">
                  <NumberInput value={streak.freeSlipEveryDays} min={1} max={365} suffix="days" onChange={(freeSlipEveryDays) => patch({ freeSlipEveryDays })} />
                </Field>
              </FieldGrid>
            </AdminCard>
          </div>
        ) : null}
      </ConfigShell>
      <SaveBar
        dirty={economy.dirty}
        saving={economy.saving}
        onSave={() => void economy.save()}
        onDiscard={economy.discard}
        label="Task streaks have unsaved changes"
      />
    </AdminPage>
  );
}
