'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, Coins } from 'lucide-react';
import {
  AdminCard,
  AdminPage,
  ConfigShell,
  Field,
  FieldGrid,
  NumberInput,
  ResetLink,
  SaveBar,
  ToggleRow,
} from '@/components/admin/kit';
import { GiftPicker } from '@/components/admin/pickers';
import { useEconomy } from '@/components/admin/useEconomy';
import { sourceLabel } from '@/components/admin/economy/labels';
import { FLY_ECONOMY_DEFAULTS } from '@/lib/economy/defaults';
import { SHOP_GIFT_MAX_FLIES } from '@/lib/economy/shopGift';
import { cn } from '@/lib/utils';

const SEGMENT_COLORS = ['bg-primary', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500'];

export function AdminEconomyManager() {
  const economy = useEconomy({ ledger: true });
  const config = economy.config;

  const segments = useMemo(() => {
    if (!config) return [];
    return [
      {
        label: 'Tasks',
        value: Math.max(config.taskIncome.dailyCapFree, config.taskIncome.dailyCapPlus),
        href: '/admin/economy',
      },
      {
        label: 'Buddy tasks',
        value: config.buddy.bonusFlies * config.buddy.dailyPayouts,
        href: '/admin/modifiers?view=social',
      },
      {
        label: "Friends' pond",
        value: Math.max(config.friendsPond.dailyCapFree, config.friendsPond.dailyCapPlus),
        href: '/admin/modifiers?view=social',
      },
      {
        label: 'Ads',
        value: config.rewardedAds.dailyCap * config.rewardedAds.reward,
        href: '/admin/ads',
      },
      {
        label: 'Shop gift',
        value: config.shopGift.enabled
          ? SHOP_GIFT_MAX_FLIES * config.shopGift.luckyMultiplier * config.shopGift.plusMultiplier
          : 0,
        href: '/admin/modifiers?view=shop',
      },
    ];
  }, [config]);

  const ceiling = segments.reduce((sum, segment) => sum + segment.value, 0);
  const breaker = config?.circuitBreaker.dailyCap ?? 0;
  const scale = Math.max(ceiling, breaker, 1);
  const earned = (economy.ledger?.sources ?? []).filter((row) => row.granted > 0).sort((a, b) => b.granted - a.granted);
  const spent = (economy.ledger?.sources ?? []).reduce((sum, row) => sum + row.spent, 0);
  const ledgerMax = Math.max(1, ...earned.map((row) => row.granted));

  return (
    <AdminPage
      title="Fly budget"
      subtitle="How many flies a day can pay, where the extras go, and the safety nets behind it."
      icon={<Coins />}
      actions={<ResetLink onClick={() => economy.set(() => FLY_ECONOMY_DEFAULTS)}>Load defaults</ResetLink>}
    >
      <ConfigShell loading={economy.loading} error={economy.error}>
        {config ? (
          <div className="space-y-5">
            <AdminCard
              title={`A maxed-out day pays up to ${ceiling} flies`}
              subtitle={`Every faucet at full tilt for a Plus player. The circuit breaker stops everything at ${breaker}.`}
            >
              <div className="relative">
                <div className="flex h-5 overflow-hidden rounded-full bg-muted">
                  {segments.map((segment, index) =>
                    segment.value > 0 ? (
                      <div
                        key={segment.label}
                        className={cn('h-full border-r-2 border-card last:border-r-0', SEGMENT_COLORS[index % SEGMENT_COLORS.length])}
                        style={{ width: `${(segment.value / scale) * 100}%` }}
                      />
                    ) : null,
                  )}
                </div>
                {breaker > 0 ? (
                  <div
                    className="absolute -top-1.5 h-8 w-0.5 rounded-full bg-red-500"
                    style={{ left: `calc(${Math.min(100, (breaker / scale) * 100)}% - 1px)` }}
                    title={`Circuit breaker · ${breaker}`}
                  />
                ) : null}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {segments.map((segment, index) => (
                  <Link
                    key={segment.label}
                    href={segment.href}
                    className="group flex items-center gap-2 rounded-2xl bg-muted/50 px-3 py-2 transition hover:bg-muted"
                  >
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', SEGMENT_COLORS[index % SEGMENT_COLORS.length])} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-bold text-muted-foreground">{segment.label}</span>
                      <span className="block text-[16px] font-black tabular-nums">{segment.value}</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 transition group-hover:text-primary" />
                  </Link>
                ))}
              </div>
            </AdminCard>

            <AdminCard
              title="Task income"
              subtitle="Base flies, streak uplift and checklist markers all draw from this one daily budget."
              icon={<span className="text-[20px]">✅</span>}
            >
              <FieldGrid cols={4}>
                <Field label="Daily cap · free">
                  <NumberInput
                    value={config.taskIncome.dailyCapFree}
                    max={1000}
                    suffix="flies"
                    onChange={(dailyCapFree) => economy.patchGroup('taskIncome', { dailyCapFree })}
                  />
                </Field>
                <Field label="Daily cap · Plus">
                  <NumberInput
                    value={config.taskIncome.dailyCapPlus}
                    max={1000}
                    suffix="flies"
                    onChange={(dailyCapPlus) => economy.patchGroup('taskIncome', { dailyCapPlus })}
                  />
                </Field>
                <Field label="Paying tasks a day" hint="Tasks after this fill the overflow jar instead.">
                  <NumberInput
                    value={config.taskIncome.payingCompletionsPerDay}
                    max={200}
                    suffix="tasks"
                    onChange={(payingCompletionsPerDay) =>
                      economy.patchGroup('taskIncome', { payingCompletionsPerDay })
                    }
                  />
                </Field>
                <Field label="Late check-offs pay for" hint="Older tasks still complete, but pay nothing.">
                  <NumberInput
                    value={config.taskIncome.backdateGraceHours}
                    max={720}
                    suffix="hours"
                    onChange={(backdateGraceHours) => economy.patchGroup('taskIncome', { backdateGraceHours })}
                  />
                </Field>
              </FieldGrid>
            </AdminCard>

            <AdminCard
              title="Overflow jar"
              subtitle="Where a busy day's extra tasks go once the flies stop: pebbles that fill up into a gift."
              icon={<span className="text-[20px]">🫙</span>}
              tone="sky"
            >
              <div className="space-y-5">
                <ToggleRow
                  title="Jar is on"
                  description="Off means tasks past the paying limit earn nothing at all."
                  checked={config.overflowJar.enabled}
                  onChange={(enabled) => economy.patchGroup('overflowJar', { enabled })}
                />
                <div className={cn('transition', !config.overflowJar.enabled && 'pointer-events-none opacity-40')}>
                  <FieldGrid cols={4}>
                    <Field label="Pebbles per task">
                      <NumberInput
                        value={config.overflowJar.pebblesPerCompletion}
                        max={20}
                        onChange={(pebblesPerCompletion) =>
                          economy.patchGroup('overflowJar', { pebblesPerCompletion })
                        }
                      />
                    </Field>
                    <Field label="Pebbles for a gift">
                      <NumberInput
                        value={config.overflowJar.pebblesPerGift}
                        min={1}
                        max={500}
                        onChange={(pebblesPerGift) => economy.patchGroup('overflowJar', { pebblesPerGift })}
                      />
                    </Field>
                    <Field label="Gifts a week" hint="Extra pebbles carry over, never lost.">
                      <NumberInput
                        value={config.overflowJar.giftsPerWeek}
                        max={20}
                        onChange={(giftsPerWeek) => economy.patchGroup('overflowJar', { giftsPerWeek })}
                      />
                    </Field>
                    <Field label="The gift">
                      <GiftPicker
                        value={config.overflowJar.giftItemId}
                        onChange={(giftItemId) => economy.patchGroup('overflowJar', { giftItemId })}
                      />
                    </Field>
                  </FieldGrid>
                </div>
              </div>
            </AdminCard>

            <AdminCard
              title="Safety nets"
              subtitle="Backstops no real player should ever hit. Every trip is logged."
              icon={<span className="text-[20px]">🛟</span>}
              tone="berry"
            >
              <FieldGrid cols={2}>
                <Field label="Circuit breaker" hint="All sources combined, per player per day.">
                  <NumberInput
                    value={config.circuitBreaker.dailyCap}
                    min={1}
                    max={100000}
                    suffix="flies"
                    onChange={(dailyCap) => economy.patchGroup('circuitBreaker', { dailyCap })}
                  />
                </Field>
                <Field label="Timezone changes a day" hint="More changes are ignored when counting flies.">
                  <NumberInput
                    value={config.timezone.changesPerDay}
                    min={1}
                    max={24}
                    onChange={(changesPerDay) => economy.patchGroup('timezone', { changesPerDay })}
                  />
                </Field>
              </FieldGrid>
            </AdminCard>

            {economy.ledger ? (
              <AdminCard
                title="Where flies actually came from"
                subtitle={`${economy.ledger.from} to ${economy.ledger.to}. Tune against this, not the numbers you hoped for.`}
                icon={<span className="text-[20px]">📒</span>}
                tone="sun"
              >
                {earned.length === 0 ? (
                  <p className="text-[13px] font-bold text-muted-foreground">Nothing recorded yet.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {earned.map((row) => (
                        <li key={row.source} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3">
                          <span className="truncate text-[13px] font-black">{sourceLabel(row.source)}</span>
                          <span className="h-3 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${Math.max(2, (row.granted / ledgerMax) * 100)}%` }}
                            />
                          </span>
                          <span className="text-right text-[12px] font-bold tabular-nums text-muted-foreground">
                            <span className="font-black text-primary">+{row.granted.toLocaleString()}</span> ·{' '}
                            {row.users} {row.users === 1 ? 'player' : 'players'}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
                {spent > 0 ? (
                  <p className="mt-4 rounded-2xl bg-muted/50 px-4 py-2.5 text-[13px] font-bold text-muted-foreground">
                    Players spent <span className="font-black text-foreground">{spent.toLocaleString()}</span> flies in the same window.
                  </p>
                ) : null}
              </AdminCard>
            ) : null}
          </div>
        ) : null}
      </ConfigShell>
      <SaveBar
        dirty={economy.dirty}
        saving={economy.saving}
        onSave={() => void economy.save()}
        onDiscard={economy.discard}
        label="Fly budget has unsaved changes"
      />
    </AdminPage>
  );
}
