'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Clapperboard } from 'lucide-react';
import {
  AdminCard,
  AdminPage,
  ConfigShell,
  Field,
  FieldGrid,
  NumberInput,
  SaveBar,
  Toggle,
} from '@/components/admin/kit';
import { useEconomy } from '@/components/admin/useEconomy';
import type { FlyEconomyConfig } from '@/lib/economy/defaults';

type Ads = FlyEconomyConfig['rewardedAds'];

const PLACEMENTS: {
  emoji: string;
  title: string;
  where: string;
  cap?: keyof Ads;
  plus?: keyof Ads;
}[] = [
  { emoji: '🪰', title: 'Free flies', where: 'The "watch for flies" button', cap: 'dailyCap' },
  { emoji: '2×', title: 'Double a quest reward', where: 'Quest claim', cap: 'doubleRewardPerDay', plus: 'questDoublePlus' },
  { emoji: '🎁', title: 'Double a gift', where: 'Gift reveal', cap: 'giftDoublePerDay', plus: 'giftDoublePlus' },
  { emoji: '🔁', title: 'Refresh trade-up', where: 'Trade-up reroll', cap: 'tradeRerollPerDay' },
  { emoji: '🛟', title: 'Save a streak', where: 'Missed-day rescue', plus: 'streakRescuePlus' },
  { emoji: '🔥', title: 'Double a streak celebration', where: 'Streak milestone', plus: 'streakDoublePlus' },
  { emoji: '🐸', title: "Double the friends' pond", where: 'Friends pond claim', plus: 'friendsDoublePlus' },
];

export function AdsPlusPage() {
  const economy = useEconomy();
  const ads = economy.config?.rewardedAds;
  const patch = (next: Partial<Ads>) => economy.patchGroup('rewardedAds', next);

  return (
    <AdminPage
      title="Ads & Plus"
      subtitle="Every rewarded-ad button, how often it can be watched, and which ones send free players to Plus instead."
      icon={<Clapperboard />}
    >
      <ConfigShell loading={economy.loading} error={economy.error}>
        {ads ? (
          <div className="space-y-5">
            <AdminCard
              title="The ad budget"
              subtitle="Shared by every button below. Plus members never see ads."
              icon={<span className="text-[20px]">🎬</span>}
            >
              <FieldGrid cols={3}>
                <Field label="Ads a day, all buttons">
                  <NumberInput value={ads.totalDailyCap} max={100} suffix="ads" onChange={(totalDailyCap) => patch({ totalDailyCap })} />
                </Field>
                <Field label="Flies per free-flies ad">
                  <NumberInput value={ads.reward} max={1000} suffix="flies" onChange={(reward) => patch({ reward })} />
                </Field>
                <Field label="Wait between ads">
                  <NumberInput value={ads.cooldownSeconds} max={3600} suffix="sec" onChange={(cooldownSeconds) => patch({ cooldownSeconds })} />
                </Field>
              </FieldGrid>
            </AdminCard>

            <AdminCard
              title="Every ad button"
              subtitle="A daily limit per button, inside the budget above. Switch a button to Plus and free mobile players get the Plus offer instead of the ad. Web is unchanged."
              icon={<span className="text-[20px]">📺</span>}
              tone="grape"
              bodyClassName="px-3 pb-3 pt-4 sm:px-5 sm:pb-5"
            >
              <div className="hidden grid-cols-[minmax(0,1fr)_8.5rem_7rem] gap-4 px-3 pb-2 text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground sm:grid">
                <span>Button</span>
                <span>Per day</span>
                <span className="text-right">Show Plus</span>
              </div>
              <ul className="space-y-2">
                {PLACEMENTS.map((placement) => (
                  <li
                    key={placement.title}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-2xl bg-muted/45 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_8.5rem_7rem]"
                  >
                    <div className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-[16px] font-black shadow-[0_2px_0_0_hsl(var(--border))]">
                        {placement.emoji}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-black">{placement.title}</span>
                        <span className="block truncate text-[12px] font-medium text-muted-foreground">{placement.where}</span>
                      </span>
                    </div>
                    <div>
                      {placement.cap ? (
                        <NumberInput
                          value={ads[placement.cap] as number}
                          max={100}
                          suffix="/day"
                          onChange={(next) => patch({ [placement.cap as string]: next } as Partial<Ads>)}
                        />
                      ) : (
                        <span className="text-[12px] font-bold text-muted-foreground">Budget only</span>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {placement.plus ? (
                        <>
                          <span className="text-[12px] font-black text-muted-foreground sm:hidden">Plus</span>
                          <Toggle
                            checked={Boolean(ads[placement.plus])}
                            onChange={(next) => patch({ [placement.plus as string]: next } as Partial<Ads>)}
                            label={`Show Plus instead of an ad: ${placement.title}`}
                          />
                        </>
                      ) : (
                        <span className="text-[12px] font-bold text-muted-foreground/70">Always an ad</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                href="/admin/modifiers?view=shop"
                className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-3 text-[13px] font-bold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                <span>
                  Shop refresh ads are set on the Shop page, next to the free refreshes ({ads.shopRerollPerDay}/day now).
                </span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
            </AdminCard>
          </div>
        ) : null}
      </ConfigShell>
      <SaveBar
        dirty={economy.dirty}
        saving={economy.saving}
        onSave={() => void economy.save()}
        onDiscard={economy.discard}
        label="Ad settings have unsaved changes"
      />
    </AdminPage>
  );
}
