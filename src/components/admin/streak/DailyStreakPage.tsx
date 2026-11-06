'use client';

import React from 'react';
import { Plus, X } from 'lucide-react';
import {
  AdminCard,
  ConfigShell,
  Field,
  FieldGrid,
  NumberInput,
  SaveBar,
  SectionLabel,
  ToggleRow,
} from '@/components/admin/kit';
import { RewardEditButton, RewardStrip, useRewardCatalog } from '@/components/admin/pickers';
import { useAdminConfig, useSaveAll } from '@/components/admin/useAdminConfig';
import { Icon } from '@/components/ui/Icon';
import type { QuestReward } from '@/lib/quests/types';
import type { LoginStreakReward } from '@/lib/streak/types';
import { cn } from '@/lib/utils';

type Tier = { days: number; rewards: LoginStreakReward[] };

type LoginStreakConfig = {
  isActive: boolean;
  saverMinStreak: number;
  repeatPayoutPercents: number[];
  repeatPayoutFloorPercent: number;
  repeatItemsAtFullOnly: boolean;
  goalTiers: Tier[];
};

type ShieldConfig = {
  isActive: boolean;
  priceFlies: number;
  twoPackPriceFlies: number;
  capFree: number;
  capPlus: number;
  plusMonthlyGrant: number;
  rescueCooldownDays: number;
  offerCooldownDays: number;
  offerMinStreak: number;
  earnEveryPactWeeks: number;
  limits?: { capMin: number; capMax: number };
};

const SKIN_RARITIES = [
  { value: '', label: 'No outfit roll' },
  { value: 'uncommon', label: 'Uncommon or better' },
  { value: 'rare', label: 'Rare or better' },
  { value: 'epic', label: 'Epic or better' },
  { value: 'legendary', label: 'Legendary' },
];

const isShield = (reward: LoginStreakReward) =>
  reward.type === 'SHIELD' || (reward.type as string) === 'STREAK_FREEZE';
const isSkinRoll = (reward: LoginStreakReward) => (reward as { type?: string }).type === 'SKIN_ROLL';
const questRewards = (rewards: LoginStreakReward[]) =>
  rewards.filter((reward) => !isShield(reward) && !isSkinRoll(reward)) as QuestReward[];
const skinRarity = (rewards: LoginStreakReward[]) =>
  (rewards.find(isSkinRoll) as { minRarity?: string } | undefined)?.minRarity ?? '';
const shieldCount = (rewards: LoginStreakReward[]) =>
  rewards.reduce((sum, reward) => (isShield(reward) ? sum + ((reward as { amount?: number }).amount ?? 1) : sum), 0);
const mergeRewards = (quest: QuestReward[], shields: number, rarity: string): LoginStreakReward[] => [
  ...(quest as LoginStreakReward[]),
  ...(shields > 0 ? [{ type: 'SHIELD', amount: shields } as LoginStreakReward] : []),
  ...(rarity ? [{ type: 'SKIN_ROLL', minRarity: rarity } as unknown as LoginStreakReward] : []),
];

export function DailyStreakPage() {
  const streak = useAdminConfig<LoginStreakConfig>({
    url: '/api/admin/streak/login',
    read: (payload) => payload?.loginStreak ?? null,
    write: (config) => ({
      isActive: config.isActive,
      saverMinStreak: config.saverMinStreak,
      repeatPayoutPercents: config.repeatPayoutPercents,
      repeatPayoutFloorPercent: config.repeatPayoutFloorPercent,
      repeatItemsAtFullOnly: config.repeatItemsAtFullOnly,
      goalTiers: config.goalTiers,
    }),
  });
  const shields = useAdminConfig<ShieldConfig>({
    url: '/api/admin/shields',
    read: (payload) => payload?.shields ?? null,
    write: (config) => config,
  });
  const all = useSaveAll([streak, shields]);
  const catalog = useRewardCatalog();

  const config = streak.config;
  const pads = shields.config;
  const capMin = pads?.limits?.capMin ?? 1;
  const capMax = pads?.limits?.capMax ?? 5;

  const patchTier = (days: number, rewards: LoginStreakReward[]) =>
    streak.set((prev) => ({
      ...prev,
      goalTiers: prev.goalTiers.map((tier) => (tier.days === days ? { ...tier, rewards } : tier)),
    }));

  const percents = config?.repeatPayoutPercents ?? [];
  const setPercents = (next: number[]) => streak.patch({ repeatPayoutPercents: next });

  return (
    <ConfigShell loading={streak.loading || shields.loading} error={all.error}>
      {config && pads ? (
        <div className="space-y-5">
          <AdminCard
            title="The daily streak"
            subtitle="Opening the app on a day keeps it going. Players pledge to a length and win its prize when they get there."
            icon={<span className="text-[20px]">🔥</span>}
          >
            <div className="space-y-4">
              <ToggleRow
                title={config.isActive ? 'Streak is on' : 'Streak is off'}
                description="Off hides the streak and its pledges everywhere."
                checked={config.isActive}
                onChange={(isActive) => streak.patch({ isActive })}
              />
              <FieldGrid cols={2}>
                <Field label="Streak-saver push from" hint="The reminder before a streak breaks only goes out once it is this long.">
                  <NumberInput
                    value={config.saverMinStreak}
                    min={1}
                    max={10}
                    suffix="days"
                    onChange={(saverMinStreak) => streak.patch({ saverMinStreak })}
                  />
                </Field>
              </FieldGrid>
            </div>
          </AdminCard>

          <AdminCard
            title="Pledge prizes"
            subtitle="What a player wins for reaching the length they pledged to."
            icon={<span className="text-[20px]">🏁</span>}
            tone="sun"
          >
            <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-[27px] before:top-6 before:w-1 before:rounded-full before:bg-amber-200 dark:before:bg-amber-500/25">
              {config.goalTiers.map((tier) => {
                const quest = questRewards(tier.rewards);
                const padsHere = shieldCount(tier.rewards);
                const rarity = skinRarity(tier.rewards);
                return (
                  <li key={tier.days} className="relative flex flex-wrap items-center gap-3 rounded-2xl bg-muted/40 p-3 pl-2">
                    <span className="z-[1] flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-2xl bg-amber-400 text-white shadow-[0_3px_0_0_rgba(194,65,12,0.35)]">
                      <span className="text-[15px] font-black leading-none">{tier.days}</span>
                      <span className="text-[9px] font-black uppercase leading-none">days</span>
                    </span>
                    <div className="min-w-[10rem] flex-1">
                      <RewardStrip
                        rewards={quest}
                        rewardCatalog={catalog.byId}
                        extra={
                          padsHere > 0 || rarity ? (
                            <>
                              {padsHere > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[12px] font-black text-emerald-700 dark:text-emerald-400">
                                  <Icon name="lilyPad" className="h-3.5 w-3.5" />×{padsHere}
                                </span>
                              ) : null}
                              {rarity ? (
                                <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[12px] font-black text-violet-700 dark:text-violet-300">
                                  {rarity.charAt(0).toUpperCase() + rarity.slice(1)}+ outfit
                                </span>
                              ) : null}
                            </>
                          ) : undefined
                        }
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <RewardEditButton
                        rewards={quest}
                        rewardCatalog={catalog.byId}
                        rewardItems={catalog.items}
                        onChange={(next) => patchTier(tier.days, mergeRewards(next, padsHere, rarity))}
                      />
                      <label className="flex items-center gap-1.5" title="Lily Pads">
                        <Icon name="lilyPad" label="Lily Pads" className="h-5 w-5" />
                        <span className="w-16">
                          <NumberInput
                            value={padsHere}
                            max={3}
                            onChange={(count) => patchTier(tier.days, mergeRewards(quest, count, rarity))}
                          />
                        </span>
                      </label>
                      <select
                        value={rarity}
                        onChange={(event) => patchTier(tier.days, mergeRewards(quest, padsHere, event.target.value))}
                        className="h-10 rounded-xl border border-border bg-background px-2.5 text-[13px] font-bold text-foreground outline-none focus:border-primary"
                      >
                        {SKIN_RARITIES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                );
              })}
            </ol>
          </AdminCard>

          <AdminCard
            title="Pledging the same length again"
            subtitle="Each repeat pays a little less, then settles at the floor. Pledging longer starts back at the top, so the ladder keeps pulling upward."
            icon={<span className="text-[20px]">🔁</span>}
            tone="grape"
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                {percents.map((percent, index) => (
                  <div key={index} className="w-[116px]">
                    <p className="mb-1 flex items-center justify-between text-[12px] font-bold text-muted-foreground">
                      {index === 0 ? '1st time' : index === 1 ? '2nd time' : index === 2 ? '3rd time' : `${index + 1}th time`}
                      {percents.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setPercents(percents.filter((_, i) => i !== index))}
                          className="rounded-md p-0.5 text-muted-foreground/60 transition hover:bg-red-500/10 hover:text-red-500"
                          aria-label="Remove"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </p>
                    <NumberInput
                      value={percent}
                      min={1}
                      max={100}
                      suffix="%"
                      onChange={(next) => setPercents(percents.map((value, i) => (i === index ? next : value)))}
                    />
                  </div>
                ))}
                {percents.length < 8 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPercents([...percents, Math.max(config.repeatPayoutFloorPercent, (percents[percents.length - 1] ?? 100) - 10)])
                    }
                    className="flex h-10 items-center gap-1 rounded-xl border-2 border-dashed border-border px-3 text-[12px] font-black text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Repeat
                  </button>
                ) : null}
                <div className="w-[120px]">
                  <p className="mb-1 text-[12px] font-bold text-muted-foreground">Then forever</p>
                  <NumberInput
                    value={config.repeatPayoutFloorPercent}
                    min={1}
                    max={100}
                    suffix="%"
                    onChange={(repeatPayoutFloorPercent) => streak.patch({ repeatPayoutFloorPercent })}
                  />
                </div>
              </div>
              <ToggleRow
                title="Items only at full payout"
                description="On: repeats below 100% pay flies only, no gifts or outfits."
                checked={config.repeatItemsAtFullOnly}
                onChange={(repeatItemsAtFullOnly) => streak.patch({ repeatItemsAtFullOnly })}
              />
            </div>
          </AdminCard>

          <AdminCard
            title="Lily Pads"
            subtitle="One shield for every streak, daily and Leap alike. Used up by itself on a missed day. Sold only through the offer popup, never in the shop."
            icon={<Icon name="lilyPad" className="h-6 w-6" />}
            tone="sky"
          >
            <div className="space-y-5">
              <ToggleRow
                title={pads.isActive ? 'Lily Pads are on' : 'Lily Pads are off'}
                description="Off means a missed day always breaks the streak."
                checked={pads.isActive}
                onChange={(isActive) => shields.patch({ isActive })}
              />
              <div className={cn('space-y-5 transition', !pads.isActive && 'pointer-events-none opacity-40')}>
                <div className="space-y-2">
                  <SectionLabel>Price in the offer</SectionLabel>
                  <FieldGrid cols={3}>
                    <Field label="One Lily Pad">
                      <NumberInput value={pads.priceFlies} min={1} max={100000} suffix="flies" onChange={(priceFlies) => shields.patch({ priceFlies })} />
                    </Field>
                    <Field label="Two-pack" hint="Only offered when there is room for two.">
                      <NumberInput
                        value={pads.twoPackPriceFlies}
                        min={1}
                        max={200000}
                        suffix="flies"
                        onChange={(twoPackPriceFlies) => shields.patch({ twoPackPriceFlies })}
                      />
                    </Field>
                  </FieldGrid>
                </div>
                <div className="space-y-2">
                  <SectionLabel>How many a player holds</SectionLabel>
                  <FieldGrid cols={3}>
                    <Field label="Free players">
                      <NumberInput value={pads.capFree} min={capMin} max={capMax} onChange={(capFree) => shields.patch({ capFree })} />
                    </Field>
                    <Field label="Plus players">
                      <NumberInput value={pads.capPlus} min={capMin} max={capMax} onChange={(capPlus) => shields.patch({ capPlus })} />
                    </Field>
                    <Field label="Free for Plus each month" hint="0 turns the monthly gift off.">
                      <NumberInput
                        value={pads.plusMonthlyGrant}
                        max={capMax}
                        onChange={(plusMonthlyGrant) => shields.patch({ plusMonthlyGrant })}
                      />
                    </Field>
                  </FieldGrid>
                </div>
                <div className="space-y-2">
                  <SectionLabel>Limits</SectionLabel>
                  <FieldGrid cols={3}>
                    <Field label="One rescue every" hint="Per streak. A streak that can never break stops motivating.">
                      <NumberInput
                        value={pads.rescueCooldownDays}
                        max={365}
                        suffix="days"
                        onChange={(rescueCooldownDays) => shields.patch({ rescueCooldownDays })}
                      />
                    </Field>
                    <Field label="Offer popup at most every" hint="Doubles after each dismissal, up to 4×.">
                      <NumberInput
                        value={pads.offerCooldownDays}
                        min={1}
                        max={365}
                        suffix="days"
                        onChange={(offerCooldownDays) => shields.patch({ offerCooldownDays })}
                      />
                    </Field>
                    <Field label="Offer only from a streak of" hint="Below this there is nothing worth protecting.">
                      <NumberInput
                        value={pads.offerMinStreak}
                        min={1}
                        max={365}
                        suffix="days"
                        onChange={(offerMinStreak) => shields.patch({ offerMinStreak })}
                      />
                    </Field>
                  </FieldGrid>
                </div>
              </div>
            </div>
          </AdminCard>
        </div>
      ) : null}
      <SaveBar
        dirty={all.dirty}
        saving={all.saving}
        onSave={() => void all.save()}
        onDiscard={all.discard}
        label="Daily streak has unsaved changes"
      />
    </ConfigShell>
  );
}
