'use client';

import React, { useEffect, useState } from 'react';
import { Bell, Check, ChevronLeft, ExternalLink, Sparkle, X } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  PerkLedger,
  PlusEarnedStrip,
  PlusGoldButton,
  PlusStage,
} from '@/components/ui/plus/PlusKit';
import { useNotificationStatus } from '@/hooks/useNotificationStatus';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import type { FrogEmote } from '@/lib/frogEmotes';
import { getPlusContext } from '@/lib/plusPaywall';
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
import { previewDaysLeft } from '@/lib/plus/preview';
import { useUIStore } from '@/lib/uiStore';
import { cn } from '@/lib/utils';

const REMINDER_LEAD_DAYS = 2;
const DAY_MS = 86_400_000;
const CORE_PERKS = getPlusContext('membership').perks;

type Pill = { label: string; tone: 'gold' | 'amber' | 'green' | 'red' };
type ManagedPhase = Exclude<PlusPhase, 'gift' | 'preview' | 'inactive'>;

function pillFor(phase: PlusPhase, status: PlusStatus | undefined): Pill {
  const expires = status?.subscription?.expiresAt ?? status?.premiumUntil;
  const days = daysUntil(expires);
  switch (phase) {
    case 'trial':
      return {
        label:
          days === 0
            ? 'Free trial · last day'
            : `Free trial · ${days} ${days === 1 ? 'day' : 'days'} left`,
        tone: 'gold',
      };
    case 'trial_cancelled':
      return { label: `Trial ends ${formatPlusDate(expires)}`, tone: 'amber' };
    case 'cancelled':
      return { label: `Ends ${formatPlusDate(expires)}`, tone: 'amber' };
    case 'billing_issue':
      return { label: 'Payment issue', tone: 'red' };
    case 'gift':
      return { label: 'Gifted', tone: 'gold' };
    case 'preview': {
      const left = previewDaysLeft(status?.preview?.endsAt);
      return {
        label: left <= 1 ? 'Preview · last day' : `Preview · ${left} days left`,
        tone: 'gold',
      };
    }
    default:
      return { label: 'Member', tone: 'gold' };
  }
}

const HEADLINES: Record<PlusPhase, string> = {
  trial: 'Your free trial is on',
  trial_cancelled: 'Your trial is cancelled',
  active: 'Thanks for being a member',
  cancelled: 'Auto-renew is off',
  billing_issue: 'Your payment didn’t go through',
  gift: 'Plus is on us',
  preview: 'Your Plus preview is on',
  inactive: 'Frogress Plus',
};

export function PlusMembershipSheet({
  open,
  onClose,
  fallbackUntil,
  previewStatus,
}: {
  open: boolean;
  onClose: () => void;
  fallbackUntil?: string | null;
  previewStatus?: PlusStatus | null;
}) {
  const fetched = usePlusStatus(open && !previewStatus);
  const data = previewStatus ?? fetched.data;
  const error = previewStatus ? undefined : fetched.error;
  const isLoading = !previewStatus && fetched.isLoading;
  const [price, setPrice] = useState<PlusPriceInfo | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!open) setLeaving(false);
  }, [open]);

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
  const loading = isLoading && !data;
  const managed = phase !== 'gift' && phase !== 'preview' && phase !== 'inactive';
  const earned = status?.earned;

  const startLeaving = () => {
    trackAnalyticsEvent('plus_cancel_viewed', { phase, store });
    setLeaving(true);
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      zIndex={1360}
      hideHandle
      showClose={false}
      className="plus-paywall border-0 bg-background text-foreground sm:max-w-[420px]"
    >
      {({ bindScroll }) =>
        leaving && status && managed ? (
          <LeavingView
            status={status}
            phase={phase as ManagedPhase}
            bindScroll={bindScroll}
            onKeep={() => {
              trackAnalyticsEvent('plus_cancel_kept', { phase, store });
              setLeaving(false);
            }}
            onClose={onClose}
          />
        ) : (
          <div className="flex max-h-[92dvh] flex-col sm:max-h-[calc(100dvh-3rem)]">
            <div
              ref={bindScroll}
              className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
            >
              <PlusSheetHero
                headline={HEADLINES[phase]}
                pill={pillFor(phase, status)}
                onClose={onClose}
              />
              <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-32 w-full rounded-2xl" />
                    <Skeleton className="h-40 w-full rounded-2xl" />
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
                    {phase === 'preview' && <PreviewCard status={status} onClose={onClose} />}
                    {earned && (earned.flies > 0 || earned.rareItems > 0) ? (
                      <PlusEarnedStrip earned={earned} label="So far, Plus got you" className="mt-4" />
                    ) : null}
                    <PerkLedger perks={CORE_PERKS} className="mt-4" />
                    {managed && (
                      <ManageBlock
                        status={status!}
                        phase={phase as ManagedPhase}
                        onLeave={startLeaving}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )
      }
    </BaseSheet>
  );
}

export function PlusSheetHero({
  headline,
  pill,
  onClose,
  onBack,
  greet = 'loveShy',
}: {
  headline: string;
  pill?: Pill | null;
  onClose: () => void;
  onBack?: () => void;
  greet?: FrogEmote | null;
}) {
  const { indices } = useWardrobeIndices(true);
  const control =
    'absolute top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.14)] transition-[background-color,transform] hover:bg-white/15 active:scale-90';
  return (
    <div className="shrink-0 text-center">
      <PlusStage look={indices} size="sm" greet={greet}>
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Back" className={cn(control, 'left-3')}>
            <ChevronLeft className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          </button>
        ) : null}
        <button type="button" onClick={onClose} aria-label="Close" className={cn(control, 'right-3')}>
          <X className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden />
        </button>
      </PlusStage>
      <h2
        id="plus-membership-title"
        className="mt-4 text-balance px-6 text-[24px] font-black leading-[1.1] tracking-tight"
      >
        {headline}
      </h2>
      {pill ? (
        <span
          className={cn(
            'mt-2.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-black',
            pill.tone === 'gold' && 'bg-[#f5c84c] text-[#3a2700]',
            pill.tone === 'amber' && 'bg-amber-200 text-amber-950',
            pill.tone === 'green' && 'bg-emerald-300 text-emerald-950',
            pill.tone === 'red' && 'bg-rose-300 text-rose-950',
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
          {pill.label}
        </span>
      ) : null}
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
    <ol className="space-y-3.5 rounded-[22px] bg-card p-4 shadow-[0_4px_0_0_rgba(26,8,56,0.35)]">
      {steps.map((step, i) => (
        <li key={i} className="relative flex gap-3">
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[13px] top-7 h-[calc(100%-6px)] w-0.5 rounded-full bg-white/15"
            />
          )}
          <span
            className={cn(
              'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
              step.done
                ? 'bg-primary text-primary-foreground'
                : 'bg-white/10 text-primary shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.16)]',
            )}
          >
            {step.done ? <Check className="h-3.5 w-3.5" strokeWidth={3.5} /> : step.icon}
          </span>
          <span className="min-w-0 pt-0.5">
            <span className="block text-[14px] font-black leading-tight">{step.title}</span>
            <span className="mt-0.5 block text-[12.5px] font-semibold leading-snug text-muted-foreground">
              {step.body}
            </span>
          </span>
        </li>
      ))}
    </ol>
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
    <section className="divide-y divide-white/10 rounded-[22px] bg-card shadow-[0_4px_0_0_rgba(26,8,56,0.35)]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-[13px] font-bold text-muted-foreground">{row.label}</span>
          <span className="text-right">
            <span className="block text-[14px] font-black">{row.value}</span>
            {row.hint && (
              <span className="block text-[11.5px] font-bold text-primary">{row.hint}</span>
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
    <section className="rounded-[22px] bg-card px-4 py-3.5 text-center shadow-[0_4px_0_0_rgba(26,8,56,0.35)]">
      <p className="text-[13px] font-bold text-muted-foreground">Plus until</p>
      <p className="mt-1 text-lg font-black leading-none tracking-tight">
        {formatPlusDate(until, true)}
      </p>
      {days !== null && (
        <p className="mt-1.5 text-[12.5px] font-semibold text-muted-foreground">
          {days === 0 ? 'Last day' : `${days} ${days === 1 ? 'day' : 'days'} left · nothing to cancel`}
        </p>
      )}
    </section>
  );
}

function PreviewCard({
  status,
  onClose,
}: {
  status: PlusStatus | undefined;
  onClose: () => void;
}) {
  const until = status?.preview?.endsAt ?? status?.premiumUntil;
  const keep = () => {
    onClose();
    useUIStore.getState().setPremiumModalOpen(true, 'plus_preview_active');
  };
  return (
    <section className="rounded-[22px] bg-card px-4 py-4 text-center shadow-[0_4px_0_0_rgba(26,8,56,0.35)]">
      <p className="text-[13px] font-bold text-muted-foreground">Free preview until</p>
      <p className="mt-1 text-lg font-black leading-none tracking-tight">
        {formatPlusDate(until, true)}
      </p>
      <p className="mt-1.5 text-[12.5px] font-semibold leading-snug text-muted-foreground">
        It switches off by itself. No card, nothing to cancel.
      </p>
      <PlusGoldButton onClick={keep} className="mt-3.5 min-h-[48px] text-[15.5px]">
        Keep Plus after the preview
      </PlusGoldButton>
    </section>
  );
}

const QUIET_BUTTON =
  'flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-[14px] font-black text-foreground shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.14)] transition-[background-color,transform] hover:bg-white/15 active:scale-[0.98]';

function ManageBlock({
  status,
  phase,
  onLeave,
}: {
  status: PlusStatus;
  phase: ManagedPhase;
  onLeave: () => void;
}) {
  const sub = status.subscription!;
  const target = manageTarget(status);
  const date = formatPlusDate(sub.expiresAt);
  const store = storeName(sub.store);
  const canLeave = phase === 'trial' || phase === 'active';

  const note: Record<ManagedPhase, string> = {
    trial: `Cancel at least 24 hours before ${date} and you won’t be charged. You keep Plus until then.`,
    trial_cancelled: `You won’t be charged. Plus stays on until ${date}. Changed your mind? Turn auto-renew back on.`,
    active: `Cancel anytime. You keep Plus until ${date}, and nothing renews after that.`,
    cancelled: `Plus stays on until ${date}. Turn auto-renew back on to keep your perks.`,
    billing_issue: `${store} couldn’t charge your payment method. Update it soon to keep Plus.`,
  };

  return (
    <section className="mt-5">
      <h3 className="text-[15px] font-black">
        {phase === 'trial' ? 'Not for you? Cancel anytime' : 'Manage your plan'}
      </h3>
      <p className="mt-1 text-[12.5px] font-semibold leading-snug text-muted-foreground">
        {note[phase]}
      </p>
      {canLeave ? (
        <button type="button" onClick={onLeave} className={cn(QUIET_BUTTON, 'mt-3')}>
          {phase === 'trial' ? 'Cancel trial' : 'Cancel plan'}
        </button>
      ) : target?.kind === 'url' ? (
        <PlusGoldButton onClick={() => openExternal(target.url)} className="mt-3 min-h-[48px] text-[15.5px]">
          {phase === 'billing_issue' ? 'Update payment method' : 'Turn auto-renew back on'}
          <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70" strokeWidth={2.75} aria-hidden />
        </PlusGoldButton>
      ) : target?.kind === 'steps' ? (
        <p className="mt-3 rounded-xl bg-card px-3 py-2.5 text-[12.5px] font-bold leading-snug">
          {target.steps}
        </p>
      ) : null}
      <p className="mt-2.5 text-center text-[11.5px] font-semibold text-muted-foreground">
        Billing is handled by {store}.
      </p>
    </section>
  );
}

function LeavingView({
  status,
  phase,
  bindScroll,
  onKeep,
  onClose,
}: {
  status: PlusStatus;
  phase: ManagedPhase;
  bindScroll: (el: HTMLElement | null) => void;
  onKeep: () => void;
  onClose: () => void;
}) {
  const notifications = useNotificationStatus();
  const [showSteps, setShowSteps] = useState(false);
  const sub = status.subscription!;
  const target = manageTarget(status);
  const date = formatPlusDate(sub.expiresAt);
  const days = daysUntil(sub.expiresAt);
  const trial = phase === 'trial';
  const earned = status.earned;
  const canRemind = trial && (days ?? 0) > REMINDER_LEAD_DAYS;

  const proceed = () => {
    trackAnalyticsEvent('plus_cancel_continued', { phase, store: sub.store });
    if (target?.kind === 'url') openExternal(target.url);
    else setShowSteps(true);
  };

  return (
    <div className="flex max-h-[92dvh] flex-col sm:max-h-[calc(100dvh-3rem)]">
      <div
        ref={bindScroll}
        className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
      >
        <PlusSheetHero
          headline={trial ? 'Cancel your free trial?' : 'Leave Plus?'}
          onClose={onClose}
          onBack={onKeep}
          greet="sweat"
        />
        <div className="px-5 pb-4 pt-2.5 text-center">
          <p className="mx-auto max-w-[20rem] text-pretty text-[14.5px] font-semibold leading-snug text-muted-foreground">
            {trial
              ? `Your trial is free until ${date}. If you cancel, you still keep Plus until then.`
              : `You keep Plus until ${date}. After that, this is what changes.`}
          </p>
          {canRemind ? (
            notifications.isEnabled ? (
              <p className="mx-auto mt-2 max-w-[20rem] text-pretty text-[13.5px] font-bold leading-snug text-primary">
                We’ll remind you {REMINDER_LEAD_DAYS} days before it ends, so nothing needs deciding today.
              </p>
            ) : notifications.canEnable ? (
              <button
                type="button"
                onClick={() => void notifications.enableOrConfigure()}
                className="mx-auto mt-2.5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-3.5 text-[13.5px] font-black text-primary transition-[background-color,transform] hover:bg-white/15 active:scale-95"
              >
                <Bell className="h-4 w-4" strokeWidth={2.75} aria-hidden />
                Remind me {REMINDER_LEAD_DAYS} days before it ends
              </button>
            ) : null
          ) : null}
          {earned && (earned.flies > 0 || earned.rareItems > 0) ? (
            <PlusEarnedStrip earned={earned} label="So far, Plus got you" className="mt-4" />
          ) : null}
          <PerkLedger perks={CORE_PERKS} freeLabel="After" plusLabel="Now" className="mt-4 text-left" />
          {showSteps && target?.kind === 'steps' ? (
            <p className="mt-3 rounded-xl bg-card px-3 py-2.5 text-left text-[12.5px] font-bold leading-snug">
              {target.steps}
            </p>
          ) : null}
        </div>
      </div>
      <div className="plus-dock shrink-0 px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5">
        <PlusGoldButton onClick={onKeep}>Keep Plus</PlusGoldButton>
        <button type="button" onClick={proceed} className={cn(QUIET_BUTTON, 'mt-2.5')}>
          Continue to cancel
          {target?.kind === 'url' ? (
            <ExternalLink className="h-3.5 w-3.5 opacity-70" strokeWidth={2.75} aria-hidden />
          ) : null}
        </button>
        {target?.kind === 'url' ? (
          <p className="mt-2 text-center text-[11.5px] font-semibold text-muted-foreground">
            You’ll finish in{' '}
            {sub.store === 'app_store'
              ? 'the App Store'
              : sub.store === 'play_store'
                ? 'Google Play'
                : 'your billing page'}
            .
          </p>
        ) : null}
      </div>
    </div>
  );
}
