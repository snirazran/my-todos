'use client';

import React, { useEffect, useState } from 'react';
import { Bell, Check, ExternalLink, Sparkle, X } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { PremiumFrogAura } from '@/components/ui/PremiumFrogAura';
import { Skeleton } from '@/components/ui/Skeleton';
import { BENEFITS } from '@/lib/plusBenefits';
import { getPlusPricing, type PlusPriceInfo } from '@/lib/purchases';
import {
  daysUntil,
  formatPlusDate,
  manageTarget,
  openExternal,
  plusPhase,
  storeMatchesDevice,
  storeName,
  usePlusStatus,
  type PlusPhase,
  type PlusStatus,
} from '@/lib/plusStatus';
import { cn } from '@/lib/utils';

const REMINDER_LEAD_DAYS = 2;
const DAY_MS = 86_400_000;

function pillFor(phase: PlusPhase, status: PlusStatus | undefined) {
  const expires = status?.subscription?.expiresAt ?? status?.premiumUntil;
  const days = daysUntil(expires);
  switch (phase) {
    case 'trial':
      return {
        label:
          days === 0
            ? 'Free trial · last day'
            : `Free trial · ${days} ${days === 1 ? 'day' : 'days'} left`,
        tone: 'gold' as const,
      };
    case 'trial_cancelled':
      return { label: `Trial ends ${formatPlusDate(expires)}`, tone: 'amber' as const };
    case 'cancelled':
      return { label: `Ends ${formatPlusDate(expires)}`, tone: 'amber' as const };
    case 'billing_issue':
      return { label: 'Payment issue', tone: 'red' as const };
    case 'gift':
      return { label: 'Gifted', tone: 'gold' as const };
    default:
      return { label: 'Active', tone: 'green' as const };
  }
}

const HEADLINES: Record<PlusPhase, string> = {
  trial: 'Your free trial is on',
  trial_cancelled: 'Your trial is cancelled',
  active: 'Thanks for being a member',
  cancelled: 'Auto-renew is off',
  billing_issue: 'Your payment didn’t go through',
  gift: 'Plus is on us',
  inactive: 'Frogress Plus',
};

export function PlusMembershipSheet({
  open,
  onClose,
  fallbackUntil,
}: {
  open: boolean;
  onClose: () => void;
  fallbackUntil?: string | null;
}) {
  const { data, error, isLoading } = usePlusStatus(open);
  const [price, setPrice] = useState<PlusPriceInfo | null>(null);

  const plan = data?.subscription?.plan;
  const store = data?.subscription?.store;
  useEffect(() => {
    if (!open || !plan || !storeMatchesDevice(store)) return;
    let cancelled = false;
    getPlusPricing()
      .then((prices) => {
        if (!cancelled) setPrice(prices[plan] ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, plan, store]);

  const status: PlusStatus | undefined =
    data ??
    (error && fallbackUntil
      ? {
          isPremium: true,
          premiumUntil: fallbackUntil,
          source: 'gift',
          subscription: null,
        }
      : undefined);
  const phase = plusPhase(status);
  const pill = pillFor(phase, status);
  const loading = isLoading && !data;

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      zIndex={1360}
      hideHandle
      showClose={false}
      className="border-0 sm:max-w-[400px]"
    >
      {({ entered, bindScroll }) => (
        <div className="flex max-h-[92dvh] flex-col sm:max-h-[calc(100dvh-3rem)]">
          <Hero
            headline={HEADLINES[phase]}
            pill={pill}
            onClose={onClose}
            entered={entered}
          />
          <div
            ref={bindScroll}
            className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4"
          >
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-12 w-full rounded-2xl" />
              </div>
            ) : (
              <>
                {(phase === 'trial' || phase === 'trial_cancelled') && (
                  <TrialTimeline status={status!} phase={phase} price={price} />
                )}
                {(phase === 'active' ||
                  phase === 'cancelled' ||
                  phase === 'billing_issue') && (
                  <PlanCard status={status!} phase={phase} price={price} />
                )}
                {phase === 'gift' && <GiftCard status={status} />}
                <Perks />
                {phase !== 'gift' && phase !== 'inactive' && (
                  <ManageBlock status={status!} phase={phase} />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </BaseSheet>
  );
}

function Hero({
  headline,
  pill,
  onClose,
  entered,
}: {
  headline: string;
  pill: { label: string; tone: 'gold' | 'amber' | 'green' | 'red' };
  onClose: () => void;
  entered: boolean;
}) {
  return (
    <div className="relative isolate shrink-0 overflow-hidden px-6 pb-5 pt-6 text-center text-white">
      <span
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(120%_95%_at_50%_0%,#2f7d50_0%,#1d5a3f_45%,#123a2a_100%)]"
      />
      <span
        aria-hidden
        className="absolute -top-24 left-1/2 -z-10 h-56 w-56 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(251,191,36,0.35),transparent)]"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/85 transition-colors hover:bg-white/20 hover:text-white"
      >
        <X className="h-4 w-4" strokeWidth={2.75} />
      </button>
      <div className="relative mx-auto h-20 w-36">
        <Icon
          name="frogPlus"
          label="Frogress Plus"
          className="absolute left-1/2 top-1/2 h-[64px] w-[64px] -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]"
        />
        {entered && <PremiumFrogAura show compact alwaysPlay />}
      </div>
      <p className="mt-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#fbbf24]">
        Frogress Plus
      </p>
      <h2
        id="plus-membership-title"
        className="mt-1 text-[22px] font-black leading-tight tracking-tight"
      >
        {headline}
      </h2>
      <span
        className={cn(
          'mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-black',
          pill.tone === 'gold' && 'bg-[#fbbf24] text-[#3b2708]',
          pill.tone === 'amber' && 'bg-amber-200 text-amber-950',
          pill.tone === 'green' && 'bg-emerald-300 text-emerald-950',
          pill.tone === 'red' && 'bg-rose-300 text-rose-950',
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
        {pill.label}
      </span>
    </div>
  );
}

function TrialTimeline({
  status,
  phase,
  price,
}: {
  status: PlusStatus;
  phase: 'trial' | 'trial_cancelled';
  price: PlusPriceInfo | null;
}) {
  const sub = status.subscription!;
  const end = sub.expiresAt ? new Date(sub.expiresAt).getTime() : Date.now();
  const start = sub.startedAt ? new Date(sub.startedAt).getTime() : end - 7 * DAY_MS;
  const reminderAt = end - REMINDER_LEAD_DAYS * DAY_MS;
  const used = Math.min(1, Math.max(0, (Date.now() - start) / Math.max(1, end - start)));
  const reminderPassed = Date.now() >= reminderAt;
  const renewing = phase === 'trial';
  const priceLabel = price
    ? `${price.priceString}/${sub.plan === 'monthly' ? 'month' : 'year'}`
    : null;

  const steps = [
    {
      icon: <Sparkle className="h-3.5 w-3.5" fill="currentColor" />,
      title: formatPlusDate(new Date(start).toISOString()),
      body: 'Trial started. Everything in Plus unlocked.',
      done: true,
    },
    {
      icon: <Bell className="h-3.5 w-3.5" strokeWidth={2.75} />,
      title: formatPlusDate(new Date(reminderAt).toISOString()),
      body: !renewing
        ? 'No reminder needed. You won’t be charged.'
        : reminderPassed
          ? 'We sent your heads-up reminder.'
          : 'We’ll send you a heads-up reminder.',
      done: reminderPassed,
    },
    {
      icon: <Icon name="frogPlus" className="h-4 w-4" />,
      title: formatPlusDate(sub.expiresAt),
      body: renewing
        ? `${sub.plan ? `Your ${sub.plan} plan starts` : 'Plus renews'}${priceLabel ? ` · ${priceLabel}` : ''}`
        : 'Plus switches off. No charge.',
      done: false,
    },
  ];

  return (
    <section className="rounded-2xl border border-border/60 bg-muted/40 p-4">
      <div className="flex items-center justify-between text-[12px] font-black">
        <span className="text-muted-foreground">Trial progress</span>
        <span className="tabular-nums text-foreground">
          {Math.round(used * 100)}%
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full origin-left rounded-full bg-gradient-to-r from-emerald-500 to-amber-400"
          style={{ transform: `scaleX(${Math.max(0.04, used)})` }}
        />
      </div>
      <ol className="mt-4 space-y-3.5">
        {steps.map((step, i) => (
          <li key={i} className="relative flex gap-3">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className="absolute left-[13px] top-7 h-[calc(100%-6px)] w-0.5 rounded-full bg-border"
              />
            )}
            <span
              className={cn(
                'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1',
                step.done
                  ? 'bg-emerald-500 text-white ring-emerald-500'
                  : 'bg-card text-amber-600 ring-border dark:text-amber-400',
              )}
            >
              {step.done ? <Check className="h-3.5 w-3.5" strokeWidth={3.5} /> : step.icon}
            </span>
            <span className="min-w-0 pt-0.5">
              <span className="block text-[14px] font-black leading-tight">
                {step.title}
              </span>
              <span className="mt-0.5 block text-[12.5px] font-semibold leading-snug text-muted-foreground">
                {step.body}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PlanCard({
  status,
  phase,
  price,
}: {
  status: PlusStatus;
  phase: 'active' | 'cancelled' | 'billing_issue';
  price: PlusPriceInfo | null;
}) {
  const sub = status.subscription!;
  const days = daysUntil(sub.expiresAt);
  const rows = [
    {
      label: 'Plan',
      value: `${sub.plan === 'monthly' ? 'Monthly' : sub.plan === 'yearly' ? 'Yearly' : 'Plus'}${
        price ? ` · ${price.priceString}` : ''
      }`,
    },
    {
      label: phase === 'cancelled' ? 'Ends on' : 'Renews on',
      value: formatPlusDate(sub.expiresAt, true),
      hint:
        phase === 'cancelled' && days !== null
          ? `${days} ${days === 1 ? 'day' : 'days'} left`
          : undefined,
    },
    { label: 'Billed by', value: storeName(sub.store) },
  ];
  return (
    <section className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-muted/40">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-[13px] font-bold text-muted-foreground">{row.label}</span>
          <span className="text-right">
            <span className="block text-[14px] font-black">{row.value}</span>
            {row.hint && (
              <span className="block text-[11.5px] font-bold text-amber-600 dark:text-amber-400">
                {row.hint}
              </span>
            )}
          </span>
        </div>
      ))}
    </section>
  );
}

function GiftCard({ status }: { status: PlusStatus | undefined }) {
  const until = status?.premiumUntil;
  const days = daysUntil(until);
  return (
    <section className="rounded-2xl border border-border/60 bg-muted/40 px-4 py-3.5 text-center">
      <p className="text-[12px] font-black uppercase tracking-wide text-muted-foreground">
        Plus until
      </p>
      <p className="mt-1 text-lg font-black leading-none tracking-tight">
        {formatPlusDate(until, true)}
      </p>
      {days !== null && (
        <p className="mt-1.5 text-[12px] font-bold text-muted-foreground">
          {days === 0 ? 'Last day' : `${days} ${days === 1 ? 'day' : 'days'} left · nothing to cancel`}
        </p>
      )}
    </section>
  );
}

function Perks() {
  return (
    <section className="mt-4">
      <h3 className="px-1 text-[12px] font-black uppercase tracking-wide text-muted-foreground">
        Your perks
      </h3>
      <ul className="mt-2 space-y-2">
        {BENEFITS.map((benefit) => (
          <li
            key={benefit.title}
            className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-3 py-2.5"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/15">
              <Icon name={benefit.icon} className="h-7 w-7" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-black leading-tight">
                {benefit.title}
              </span>
              <span className="block text-[12px] font-semibold leading-snug text-muted-foreground">
                {benefit.body}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ManageBlock({
  status,
  phase,
}: {
  status: PlusStatus;
  phase: Exclude<PlusPhase, 'gift' | 'inactive'>;
}) {
  const sub = status.subscription!;
  const target = manageTarget(status);
  const date = formatPlusDate(sub.expiresAt);
  const store = storeName(sub.store);

  const note: Record<typeof phase, string> = {
    trial: `Cancel at least 24 hours before ${date} and you won’t be charged. You keep Plus until then.`,
    trial_cancelled: `You won’t be charged. Plus stays on until ${date}. Changed your mind? Turn auto-renew back on.`,
    active: `Cancel anytime. You keep Plus until ${date}, and nothing renews after that.`,
    cancelled: `Plus stays on until ${date}. Turn auto-renew back on to keep your perks.`,
    billing_issue: `${store} couldn’t charge your payment method. Update it soon to keep Plus.`,
  };
  const label =
    phase === 'billing_issue'
      ? 'Update payment method'
      : phase === 'cancelled' || phase === 'trial_cancelled'
        ? 'Turn auto-renew back on'
        : target?.kind === 'url'
          ? target.label
          : 'How to cancel';

  return (
    <section className="mt-4 rounded-2xl border border-border/60 bg-muted/40 p-4">
      <h3 className="text-[14px] font-black">
        {phase === 'trial' ? 'Not for you? Cancel anytime' : 'Manage your plan'}
      </h3>
      <p className="mt-1 text-[12.5px] font-semibold leading-snug text-muted-foreground">
        {note[phase]}
      </p>
      {target?.kind === 'url' ? (
        <button
          type="button"
          onClick={() => openExternal(target.url)}
          className={cn(
            'mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-black transition-all active:scale-[0.98]',
            phase === 'billing_issue' || phase === 'cancelled' || phase === 'trial_cancelled'
              ? 'bg-emerald-600 text-white shadow-[0_3px_0_0_#065f46] hover:brightness-110'
              : 'border border-border bg-card text-foreground hover:bg-muted',
          )}
        >
          {label}
          <ExternalLink className="h-3.5 w-3.5 opacity-70" strokeWidth={2.75} />
        </button>
      ) : target?.kind === 'steps' ? (
        <p className="mt-3 rounded-xl bg-card px-3 py-2.5 text-[12.5px] font-bold leading-snug text-foreground ring-1 ring-border/60">
          {target.steps}
        </p>
      ) : null}
      <p className="mt-2.5 text-center text-[11px] font-semibold text-muted-foreground">
        Billing is handled by {store}.
      </p>
    </section>
  );
}
