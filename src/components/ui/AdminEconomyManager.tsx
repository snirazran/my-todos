'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Coins, Loader2, RotateCcw, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FLY_ECONOMY_DEFAULTS,
  type FlyEconomyConfig,
} from '@/lib/economy/defaults';

type LedgerSummary = {
  from: string;
  to: string;
  sources: { source: string; granted: number; spent: number; users: number }[];
};

const inputClass =
  'h-9 w-full rounded-lg border border-border/60 bg-background px-2.5 text-sm font-medium text-foreground outline-none focus:border-primary';

function NumberField({
  label,
  hint,
  value,
  suffix,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  suffix?: string;
  onChange: (next: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className={inputClass}
        />
        {suffix && (
          <span className="whitespace-nowrap text-xs font-black text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function TextField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-bold text-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function ToggleField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/60 p-3">
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4"
      />
      <span className="min-w-0">
        <span className="block text-xs font-bold text-foreground">{label}</span>
        {hint && (
          <span className="block text-[11px] text-muted-foreground">{hint}</span>
        )}
      </span>
    </label>
  );
}

function Group({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
      <h2 className="text-base font-black tracking-tight text-foreground">
        {title}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{subtitle}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

export function AdminEconomyManager() {
  const [config, setConfig] = useState<FlyEconomyConfig | null>(null);
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/economy', {
          credentials: 'include',
        });
        const payload = await res.json();
        if (res.ok) {
          setConfig(payload.economy);
          setLedger(payload.ledger ?? null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const patch = <K extends keyof FlyEconomyConfig>(
    group: K,
    next: Partial<FlyEconomyConfig[K]>,
  ) =>
    setConfig((prev) =>
      prev ? { ...prev, [group]: { ...prev[group], ...next } } : prev,
    );

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/economy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ economy: config }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not save');
      setConfig(payload.economy);
      setLedger(payload.ledger ?? null);
      setMessage({ type: 'success', text: 'Saved' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not save',
      });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3500);
    }
  };

  const dailyCeiling = useMemo(() => {
    if (!config) return 0;
    return (
      Math.max(config.taskIncome.dailyCapFree, config.taskIncome.dailyCapPlus) +
      config.buddy.bonusFlies * config.buddy.dailyPayouts +
      Math.max(config.friendsPond.dailyCapFree, config.friendsPond.dailyCapPlus) +
      config.rewardedAds.dailyCap * config.rewardedAds.reward
    );
  }, [config]);

  return (
    <div className="min-h-screen bg-background p-6 md:p-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="rounded-full bg-muted p-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
              <Coins className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight md:text-3xl">
                Fly economy
              </h1>
              <p className="text-sm font-medium text-muted-foreground">
                Every cap and guard that decides how many flies a day can pay.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfig(FLY_ECONOMY_DEFAULTS)}
              disabled={!config}
              className="inline-flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm font-black text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Defaults
            </button>
            <button
              onClick={save}
              disabled={saving || !config}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </button>
          </div>
        </div>

        {message && (
          <div
            className={cn(
              'rounded-xl px-4 py-3 text-sm font-bold',
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-600 dark:text-red-400',
            )}
          >
            {message.text}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading
          </div>
        )}

        {config && (
          <>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4 text-sm">
              <span className="font-black text-foreground">
                Theoretical daily ceiling: {dailyCeiling} flies
              </span>
              <span className="block text-muted-foreground">
                Task income, buddy bonuses, the friends&apos; pond and rewarded
                ads at full tilt. The circuit breaker stops everything at{' '}
                {config.circuitBreaker.dailyCap}.
              </span>
            </div>

            <Group
              title="Task income"
              subtitle="The real wall: base completions, streak uplift and checklist markers all draw from one budget."
            >
              <NumberField
                label="Daily cap — free"
                suffix="flies"
                value={config.taskIncome.dailyCapFree}
                onChange={(dailyCapFree) => patch('taskIncome', { dailyCapFree })}
              />
              <NumberField
                label="Daily cap — Plus"
                suffix="flies"
                value={config.taskIncome.dailyCapPlus}
                onChange={(dailyCapPlus) => patch('taskIncome', { dailyCapPlus })}
              />
              <NumberField
                label="Paying completions"
                suffix="per day"
                hint="Completions past this earn pebbles instead of flies."
                value={config.taskIncome.payingCompletionsPerDay}
                onChange={(payingCompletionsPerDay) =>
                  patch('taskIncome', { payingCompletionsPerDay })
                }
              />
              <NumberField
                label="Backdating grace"
                suffix="hours"
                hint="Older occurrences complete normally but pay nothing."
                value={config.taskIncome.backdateGraceHours}
                onChange={(backdateGraceHours) =>
                  patch('taskIncome', { backdateGraceHours })
                }
              />
              <NumberField
                label="Milestone payouts"
                suffix="per day"
                hint="Across all tasks; extras queue to tomorrow. Edit the milestones themselves in Modifiers → Task streak."
                value={config.taskStreak.milestonesPerDay}
                onChange={(milestonesPerDay) =>
                  patch('taskStreak', { milestonesPerDay })
                }
              />
            </Group>

            <Group
              title="Overflow jar"
              subtitle="Where a productive day's extra completions go once the flies stop."
            >
              <ToggleField
                label="Jar enabled"
                hint="Off means completions past the allowance pay nothing at all."
                value={config.overflowJar.enabled}
                onChange={(enabled) => patch('overflowJar', { enabled })}
              />
              <NumberField
                label="Pebbles per completion"
                value={config.overflowJar.pebblesPerCompletion}
                onChange={(pebblesPerCompletion) =>
                  patch('overflowJar', { pebblesPerCompletion })
                }
              />
              <NumberField
                label="Pebbles per gift"
                value={config.overflowJar.pebblesPerGift}
                onChange={(pebblesPerGift) =>
                  patch('overflowJar', { pebblesPerGift })
                }
              />
              <NumberField
                label="Gifts per week"
                hint="Pebbles above the allowance carry over; they are never burned."
                value={config.overflowJar.giftsPerWeek}
                onChange={(giftsPerWeek) =>
                  patch('overflowJar', { giftsPerWeek })
                }
              />
              <TextField
                label="Gift item id"
                hint="A catalog container, e.g. gift_box_1."
                value={config.overflowJar.giftItemId}
                onChange={(giftItemId) => patch('overflowJar', { giftItemId })}
              />
            </Group>

            <div className="rounded-2xl border border-border/40 bg-card/60 p-5 text-sm">
              <span className="font-black text-foreground">
                Buddy tasks and the friends&apos; pond
              </span>
              <span className="block text-muted-foreground">
                Both are two-account collusion targets, so both are capped on
                three axes: per pair, per friend and per day. They live in
                Modifiers → Social rewards, next to the generation rate, the
                claim gate and the two weekly bonuses.
              </span>
            </div>

            <Group
              title="Invites & ads"
              subtitle="The two faucets an outsider can turn on for you."
            >
              <NumberField
                label="Rewarded invites"
                suffix="per month"
                hint="Invites past this still make friends; they just stop paying."
                value={config.invites.monthlyCap}
                onChange={(monthlyCap) => patch('invites', { monthlyCap })}
              />
              <NumberField
                label="Ad reward"
                suffix="flies"
                value={config.rewardedAds.reward}
                onChange={(reward) => patch('rewardedAds', { reward })}
              />
              <NumberField
                label="Ads per day"
                value={config.rewardedAds.dailyCap}
                onChange={(dailyCap) => patch('rewardedAds', { dailyCap })}
              />
              <NumberField
                label="Ad cooldown"
                suffix="seconds"
                value={config.rewardedAds.cooldownSeconds}
                onChange={(cooldownSeconds) =>
                  patch('rewardedAds', { cooldownSeconds })
                }
              />
            </Group>

            <Group
              title="Guards"
              subtitle="The backstops. No legitimate user should ever reach these."
            >
              <NumberField
                label="Circuit breaker"
                suffix="flies/day"
                hint="All sources combined. Every trip is logged and reported."
                value={config.circuitBreaker.dailyCap}
                onChange={(dailyCap) => patch('circuitBreaker', { dailyCap })}
              />
              <NumberField
                label="Timezone changes"
                suffix="per 24h"
                hint="Further changes are ignored for fly accounting."
                value={config.timezone.changesPerDay}
                onChange={(changesPerDay) =>
                  patch('timezone', { changesPerDay })
                }
              />
            </Group>

            {ledger && (
              <section className="rounded-2xl border border-border/40 bg-card/60 p-5">
                <h2 className="text-base font-black tracking-tight text-foreground">
                  Ledger — {ledger.from} to {ledger.to}
                </h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  What each faucet actually paid. Tune against this, not against
                  the numbers you hoped for.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="text-left text-xs font-black uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2">Source</th>
                        <th className="pb-2 text-right">Granted</th>
                        <th className="pb-2 text-right">Spent</th>
                        <th className="pb-2 text-right">Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.sources.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-3 text-muted-foreground"
                          >
                            Nothing recorded yet.
                          </td>
                        </tr>
                      )}
                      {ledger.sources.map((row) => (
                        <tr key={row.source} className="border-t border-border/40">
                          <td className="py-2 font-bold text-foreground">
                            {row.source}
                          </td>
                          <td className="py-2 text-right font-black text-emerald-600 dark:text-emerald-400">
                            +{row.granted}
                          </td>
                          <td className="py-2 text-right font-black text-muted-foreground">
                            -{row.spent}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">
                            {row.users}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
