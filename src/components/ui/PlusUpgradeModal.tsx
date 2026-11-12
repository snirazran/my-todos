'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { animate, motion, AnimatePresence, useMotionValue, useReducedMotion } from 'framer-motion';
import useSWR, { mutate } from 'swr';
import { useNotification } from '@/components/providers/NotificationProvider';
import { Capacitor } from '@capacitor/core';
import { Icon } from '@/components/ui/Icon';
import { Check, ChevronLeft, Loader2, ShieldAlert, X } from 'lucide-react';
import { SAVED_LOOKS_FREE, SAVED_LOOKS_PLUS } from '@/lib/skins/looks';
import { FREE_TAG_LIMIT, PREMIUM_TAG_LIMIT } from '@/lib/tags/limits';
import { DEFAULT_SHOP_SALES } from '@/lib/skins/shopSales';
import type { WardrobeSlot } from '@/lib/skins/catalog';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import type { FrogStampIndices } from '@/lib/frogStampEngine';
import {
  getPlusPricing,
  isPaymentPending,
  purchaseErrorCode,
  purchasePlus,
  restorePlusPurchases,
  type PlusPriceInfo,
} from '@/lib/purchases';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { mutateInventoryCaches } from '@/hooks/useInventory';
import { auth } from '@/lib/firebase';
import {
  ONBOARDING_PLUS_OFFERING,
  getPlusContext,
  trialDays,
  type PaywallContext,
  type TrialPeriod,
} from '@/lib/plusPaywall';
import { useAuth } from '@/components/auth/AuthContext';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { SheetEnteredContext } from '@/lib/sheetEntered';
import { PerkLedger, PlusEarnedStrip, PlusGoldButton, PlusSetStrip, PlusStage } from '@/components/ui/plus/PlusKit';
import {
  PLUS_PREVIEW_KEY,
  fetchPlusPreview,
  usePlusPreview,
  type PlusPreviewPayload,
} from '@/hooks/usePlusPreview';
import { showPlusWelcome } from '@/components/ui/PlusWelcome';
import {
  GUEST_UPGRADE_PATH,
  guestLinkErrorMessage,
  isExistingAccountError,
  linkGuestAccountWith,
} from '@/lib/guestLink';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { AppleIcon } from '@/components/ui/AppleIcon';
import { HOME_CARD_SURFACE } from '@/components/ui/taskSurfaces';
import { cn } from '@/lib/utils';

type View = 'offer' | 'compare';
type Step = 'offer' | 'checkout';
export type PlanId = 'yearly' | 'monthly';
type CloseMethod = 'close_button' | 'continue_free' | 'escape' | 'outside' | 'external';
type PaywallSession = {
  id: string;
  openedAt: number;
  ctaTaps: number;
  sheetResult: 'none' | 'purchased' | 'cancelled' | 'failed' | 'pending';
  sawCompare: boolean;
  planChanged: boolean;
  closeMethod: CloseMethod | null;
  outcome: 'purchased' | 'restored' | null;
  step: string;
};

const PAYWALL_VARIANT = 'one_page_v1';

export const APPLE_EULA_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
export const TERMS_URL = 'https://frogress.com/terms';
export const PRIVACY_URL = 'https://frogress.com/privacy';


const desktopQuery = '(min-width: 768px)';

function subscribeDesktop(callback: () => void) {
  const mql = window.matchMedia(desktopQuery);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(desktopQuery).matches,
    () => false,
  );
}

const PREMIUM_CONFIRM_LATE_MS = 10 * 60 * 1000;

const isFreeWeek = (trial?: TrialPeriod | null) =>
  !!trial && ((trial.unit === 'D' && trial.count === 7) || (trial.unit === 'W' && trial.count === 1));

let cachedPricing: {
  uid: string;
  offering?: string;
  prices: Partial<Record<PlanId, PlusPriceInfo>>;
} | null = null;

async function refreshPremiumState() {
  await mutate(() => true);
  mutateInventoryCaches();
}

async function confirmPremiumActive(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('/api/purchases/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data?.isPremium) return true;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

async function deliverPlusUnlock(
  deliver: () => void | Promise<void>,
  welcome: boolean,
) {
  try {
    await deliver();
  } catch (err) {
    console.error('Delivering the Plus unlock failed', err);
  }
  if (welcome) showPlusWelcome();
}


export type PlusPaywallArgs = {
  open: boolean;
  onClose: () => void;
  onStartTrial?: (plan: PlanId) => void | Promise<void>;
  placement?: string;
  frogName?: string;
  offering?: string;
  variant?: string;
  previewItem?: PaywallPreviewItem | null;
};

export function usePlusPaywall({
  open,
  onClose,
  onStartTrial,
  placement = 'unknown',
  frogName,
  offering,
  variant = PAYWALL_VARIANT,
}: PlusPaywallArgs) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [view, setView] = useState<View>('offer');
  const [step, setStep] = useState<Step>('offer');
  const [stepDirection, setStepDirection] = useState(1);
  const [plan, setPlan] = useState<PlanId>('yearly');
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const { showNotification } = useNotification();
  const [needsAccount, setNeedsAccount] = useState(false);
  const [linking, setLinking] = useState<'google' | 'apple' | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  useRegisterOpenSheet(open);
  const [pricing, setPricing] = useState<Partial<
    Record<PlanId, PlusPriceInfo>
  > | null>(null);
  const [pricingFailed, setPricingFailed] = useState(false);
  const isDesktop = useIsDesktop();
  const reduceMotion = useReducedMotion();
  const [pricingAttempt, setPricingAttempt] = useState(0);
  const sessionRef = React.useRef<PaywallSession | null>(null);
  const planRef = React.useRef(plan);
  planRef.current = plan;
  const pricesLoadedRef = React.useRef(false);
  pricesLoadedRef.current = !!(pricing?.yearly || pricing?.monthly);
  const paywallProps = () => ({
    placement,
    variant,
    paywall_session: sessionRef.current?.id,
  });
  const markClose = (method: CloseMethod) => {
    if (sessionRef.current) sessionRef.current.closeMethod = method;
  };
  const markStep = (next: string) => {
    if (sessionRef.current) sessionRef.current.step = next;
    trackAnalyticsEvent('paywall_step_viewed', { ...paywallProps(), step: next });
  };
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const bindScroll = React.useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScrollNode(node);
  }, []);
  useEffect(() => {
    const el = scrollNode;
    if (!el) return;
    const update = () =>
      setMoreBelow(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [scrollNode, view, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPricingFailed(false);
    const uid = auth?.currentUser?.uid;
    setPricing(
      uid && cachedPricing?.uid === uid && cachedPricing.offering === offering
        ? cachedPricing.prices
        : null,
    );
    getPlusPricing(offering)
      .then((prices) => {
        if (uid && (prices.yearly || prices.monthly)) cachedPricing = { uid, offering, prices };
        if (cancelled) return;
        setPricing(prices);
        setPricingFailed(!prices.yearly && !prices.monthly);
        setPlan((current) => prices[current] ? current : prices.yearly ? 'yearly' : 'monthly');
        if (!prices.yearly && !prices.monthly) {
          trackAnalyticsEvent('paywall_prices_failed', { ...paywallProps(), error_code: 'no_packages' });
        }
      })
      .catch((err) => {
        console.error('Could not read Plus prices from the store', err);
        if (cancelled) return;
        setPricingFailed(true);
        trackAnalyticsEvent('paywall_prices_failed', {
          ...paywallProps(),
          error_code: purchaseErrorCode(err),
          reason: err instanceof Error ? err.message.slice(0, 80) : 'unknown',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, pricingAttempt, offering]);

  useEffect(() => {
    if (!open) return;
    setView('offer');
    setStep('offer');
    setStepDirection(1);
    setPlan('yearly');
    setPurchasing(false);
    setPurchaseError(null);
    setNeedsAccount(false);
    setLinkError(null);
    const session: PaywallSession = {
      id: crypto.randomUUID(),
      openedAt: Date.now(),
      ctaTaps: 0,
      sheetResult: 'none',
      sawCompare: false,
      planChanged: false,
      closeMethod: null,
      outcome: null,
      step: 'offer',
    };
    sessionRef.current = session;
    trackAnalyticsEvent('paywall_viewed', { placement, variant, paywall_session: session.id });
    return () => {
      if (session.outcome) return;
      trackAnalyticsEvent('paywall_dismissed', {
        placement,
        variant,
        paywall_session: session.id,
        step: session.step,
        seconds_elapsed: Math.round((Date.now() - session.openedAt) / 1000),
        close_method: session.closeMethod ?? 'external',
        plan: planRef.current,
        plan_changed: session.planChanged,
        saw_compare: session.sawCompare,
        cta_taps: session.ctaTaps,
        sheet_result: session.sheetResult,
        prices_loaded: pricesLoadedRef.current,
      });
    };
  }, [open, placement, variant]);

  const selectPlan = (next: PlanId) => {
    if (next === plan) return;
    if (sessionRef.current) sessionRef.current.planChanged = true;
    trackAnalyticsEvent('paywall_plan_selected', { ...paywallProps(), plan: next, from_plan: plan });
    setPlan(next);
  };

  const dismissAccountPrompt = () => {
    trackAnalyticsEvent('paywall_account_result', { ...paywallProps(), status: 'dismissed' });
    setNeedsAccount(false);
  };

  const linkGuestAccount = async (provider: 'google' | 'apple') => {
    const current = auth?.currentUser;
    if (!current || linking) return;
    setLinking(provider);
    setLinkError(null);
    try {
      await linkGuestAccountWith(provider);
      trackAnalyticsEvent('paywall_account_result', { ...paywallProps(), status: 'linked', provider });
      setNeedsAccount(false);
      void mutate(() => true);
      // Linking can change offer eligibility. Refresh before the user confirms.
      setPricingAttempt((attempt) => attempt + 1);
    } catch (err) {
      if (isExistingAccountError(err)) {
        trackAnalyticsEvent('paywall_account_result', { ...paywallProps(), status: 'existing_account', provider });
        window.location.assign(GUEST_UPGRADE_PATH);
        return;
      }
      trackAnalyticsEvent('paywall_account_result', {
        ...paywallProps(),
        status: 'failed',
        provider,
        error_code: purchaseErrorCode(err),
      });
      setLinkError(guestLinkErrorMessage(provider, err));
    } finally {
      setLinking(null);
    }
  };

  const startPurchase = async () => {
    if (purchasing || !pricing?.[plan]) return;
    const session = sessionRef.current;
    const isGuest = !!auth?.currentUser?.isAnonymous;
    if (session) session.ctaTaps += 1;
    trackAnalyticsEvent('paywall_cta_tapped', {
      ...paywallProps(),
      plan,
      has_trial: !!pricing[plan]?.trialDuration,
      is_guest: isGuest,
    });
    if (isGuest) {
      trackAnalyticsEvent('paywall_account_required', { ...paywallProps(), plan });
      setNeedsAccount(true);
      return;
    }
    setPurchaseError(null);
    setPurchasing(true);
    try {
      const outcome = await purchasePlus(plan, placement, session?.id, offering);
      if (session) {
        session.sheetResult = outcome;
        if (outcome === 'purchased') session.outcome = 'purchased';
      }
      if (outcome === 'purchased') {
        const confirmed = await confirmPremiumActive(60000);
        await refreshPremiumState();
        const deliver = onStartTrial;
        onClose();
        if (!deliver) {
          showPlusWelcome();
        } else if (confirmed) {
          void deliverPlusUnlock(() => deliver(plan), true);
        } else {
          showNotification(
            'Plus is activating — your reward lands in a moment.',
            undefined,
            { durationMs: 5000 },
          );
          void (async () => {
            await confirmPremiumActive(PREMIUM_CONFIRM_LATE_MS);
            await refreshPremiumState();
            await deliverPlusUnlock(() => deliver(plan), true);
          })();
        }
      }
    } catch (err) {
      console.error('Plus purchase failed', err);
      if (session) session.sheetResult = isPaymentPending(err) ? 'pending' : 'failed';
      setPurchaseError("Purchase didn't go through. Please try again.");
    } finally {
      setPurchasing(false);
    }
  };

  const restorePurchases = async () => {
    if (purchasing) return;
    setPurchaseError(null);
    setPurchasing(true);
    try {
      const restored = await restorePlusPurchases();
      trackAnalyticsEvent('paywall_restore_result', { ...paywallProps(), status: restored ? 'restored' : 'nothing' });
      if (restored) {
        if (sessionRef.current) sessionRef.current.outcome = 'restored';
        await confirmPremiumActive(60000);
        await refreshPremiumState();
        const deliver = onStartTrial;
        onClose();
        if (deliver) void deliverPlusUnlock(() => deliver(plan), false);
      } else {
        setPurchaseError('No previous purchases found.');
      }
    } catch (err) {
      console.error('Restore purchases failed', err);
      trackAnalyticsEvent('paywall_restore_result', {
        ...paywallProps(),
        status: 'failed',
        error_code: purchaseErrorCode(err),
      });
      setPurchaseError('Restore failed. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const continueWithEmail = () => {
    trackAnalyticsEvent('paywall_account_result', { ...paywallProps(), status: 'email' });
    window.location.assign(GUEST_UPGRADE_PATH);
  };

  const selected = pricing?.[plan];
  const paywallContext = getPlusContext(placement, frogName);
  const changeView = (next: View) => {
    setView(next);
    scrollRef.current?.scrollTo({ top: 0 });
    if (next !== 'compare') return;
    if (sessionRef.current) sessionRef.current.sawCompare = true;
    trackAnalyticsEvent('paywall_compare_viewed', paywallProps());
  };
  const steps: Step[] = ['offer', 'checkout'];
  const stepIndex = Math.max(0, steps.indexOf(step));
  const onPlans = step === 'checkout';
  const goStep = (next: Step) => {
    setStepDirection(steps.indexOf(next) >= stepIndex ? 1 : -1);
    setStep(next);
    scrollRef.current?.scrollTo({ top: 0 });
    if (next !== 'offer') markStep(next);
    else if (sessionRef.current) sessionRef.current.step = next;
  };
  const showBack = view === 'compare' || step !== 'offer';
  const goBack = () => {
    if (view === 'compare') changeView('offer');
    else goStep(steps[Math.max(0, stepIndex - 1)]);
  };
  const pricesPending = !pricing && !pricingFailed;
  const period = plan === 'yearly' ? 'year' : 'month';
  const freeWeek = isFreeWeek(selected?.trialPeriod);
  const ctaLabel = onPlans
    ? freeWeek ? 'Start my free week' : selected?.trialDuration ? 'Start my free trial' : 'Get Plus'
    : 'Continue';
  const ctaContent = purchasing
    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Processing…</>
    : onPlans && pricesPending
      ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading prices" />
      : ctaLabel;
  const caption = !selected
    ? pricingFailed ? 'Store prices are unavailable right now' : onPlans ? 'Checking your store’s prices…' : 'Cancel anytime'
    : !onPlans
      ? selected.trialDuration ? `Free for ${selected.trialDuration} · Cancel anytime` : 'Cancel anytime'
      : selected.hasIntroPrice
        ? `Intro offer at checkout, then ${selected.priceString}/${period}`
        : `${selected.trialDuration ? `${selected.trialDuration} free, then ` : ''}${selected.priceString}/${period}${plan === 'yearly' && selected.pricePerMonthString ? ` (${selected.pricePerMonthString}/mo)` : ''}`;

  return {
    mounted,
    view,
    step,
    stepDirection,
    plan,
    purchasing,
    purchaseError,
    needsAccount,
    linking,
    linkError,
    pricing,
    pricingFailed,
    isDesktop,
    reduceMotion,
    setPricingAttempt,
    markClose,
    returnFocusRef,
    moreBelow,
    bindScroll,
    scrollRef,
    paywallProps,
    selectPlan,
    dismissAccountPrompt,
    linkGuestAccount,
    continueWithEmail,
    startPurchase,
    restorePurchases,
    selected,
    paywallContext,
    changeView,
    steps,
    stepIndex,
    onPlans,
    goStep,
    showBack,
    goBack,
    pricesPending,
    ctaLabel,
    ctaContent,
    caption,
    markStep,
    freeWeek,
  };
}

export function PlusUpgradeModal(props: PlusPaywallArgs) {
  const { open, onClose, placement = 'unknown' } = props;
  const { user } = useAuth();
  const preview = usePlusPreview();
  const { data: me } = useSWR<{ frogName?: string | null }>(
    user && open ? '/api/user' : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const frogName = props.frogName ?? me?.frogName ?? undefined;
  const look = usePaywallLook(open, props.previewItem);
  const {
    mounted,
    view,
    plan,
    purchasing,
    purchaseError,
    needsAccount,
    linking,
    linkError,
    pricing,
    pricingFailed,
    isDesktop,
    reduceMotion,
    setPricingAttempt,
    markClose,
    returnFocusRef,
    moreBelow,
    bindScroll,
    selectPlan,
    dismissAccountPrompt,
    linkGuestAccount,
    continueWithEmail,
    startPurchase,
    restorePurchases,
    selected,
    paywallContext,
    changeView,
    pricesPending,
  } = usePlusPaywall({
    ...props,
    frogName,
    offering: props.offering ?? (preview?.offer ? ONBOARDING_PLUS_OFFERING : undefined),
  });
  const fromPreview = placement.startsWith('plus_preview');
  const { data: previewData } = useSWR<PlusPreviewPayload>(
    open && fromPreview ? PLUS_PREVIEW_KEY : null,
    fetchPlusPreview,
    { revalidateOnFocus: false },
  );
  const [entered, setEntered] = useState(false);
  const [present, setPresent] = useState(open);
  const fade = useMotionValue(0);
  const lift = useMotionValue(0);
  useEffect(() => {
    if (open) setPresent(true);
    else setEntered(false);
  }, [open]);
  useEffect(() => {
    if (!open && fade.get() === 0) return;
    if (open && fade.get() === 0) lift.set(reduceMotion ? 0 : 32);
    let cancelled = false;
    const easing = { duration: 0.22, ease: 'easeOut' } as const;
    const fading = animate(fade, open ? 1 : 0, easing);
    const lifting = animate(lift, open || reduceMotion ? 0 : 24, easing);
    fading.then(() => {
      if (cancelled) return;
      if (open) setEntered(true);
      else setPresent(false);
    });
    return () => {
      cancelled = true;
      fading.stop();
      lifting.stop();
    };
  }, [open, fade, lift, reduceMotion]);

  if (!mounted) return null;

  const period = plan === 'yearly' ? 'year' : 'month';
  const days = trialDays(selected?.trialPeriod);
  const freeFor = days ? `${days} days` : selected?.trialDuration ?? null;
  const cta = freeFor ? (days ? `Try ${days} days free` : 'Start my free trial') : 'Get Plus';
  const discounted = !!selected?.regular && selected.regular.amount > selected.amount;
  const was = discounted ? (
    <s className="ml-1 font-semibold opacity-70">{selected!.regular!.priceString}</s>
  ) : null;
  const terms = !selected ? (
    pricingFailed ? null : 'Checking your store’s prices…'
  ) : selected.hasIntroPrice ? (
    `Intro offer at checkout, then ${selected.priceString}/${period}. Cancel anytime.`
  ) : (
    <>
      {freeFor ? `Free for ${freeFor}, then ` : ''}
      {selected.priceString}/{period}{was}. Cancel anytime.
    </>
  );
  const yearlyDeal = !!pricing?.yearly?.regular && pricing.yearly.regular.amount > pricing.yearly.amount;
  const deadline = !yearlyDeal
    ? null
    : preview?.phase === 'offer' && preview.offerUntil
      ? `Welcome price until ${new Date(preview.offerUntil).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`
      : preview?.phase === 'ended'
        ? 'Welcome price for the next 2 days'
        : null;
  const earned = fromPreview ? previewData?.earned : undefined;
  const previewSet = fromPreview ? previewData?.seasonSet : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !purchasing && !linking) onClose(); }}>
      <Dialog.Portal forceMount>
          {(open || present) && (
            <>
              <Dialog.Overlay forceMount asChild>
                <motion.div
                  style={{ opacity: fade }}
                  className={cn('fixed inset-0 z-[10008] bg-black/50 md:backdrop-blur-sm', !open && 'pointer-events-none')}
                />
              </Dialog.Overlay>
              <Dialog.Content
                forceMount
                asChild
                aria-describedby="plus-description"
                onOpenAutoFocus={() => { returnFocusRef.current = document.activeElement as HTMLElement | null; }}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  returnFocusRef.current?.focus();
                }}
                onEscapeKeyDown={(event) => {
                  if (needsAccount) {
                    event.preventDefault();
                    if (!linking) dismissAccountPrompt();
                  } else if (purchasing) event.preventDefault();
                  else markClose('escape');
                }}
                onPointerDownOutside={() => markClose('outside')}
              >
                <motion.div
                  style={{ opacity: fade, y: lift }}
                  className={cn('plus-paywall fixed inset-0 z-[10009] m-auto flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground shadow-2xl outline-none md:h-[min(600px,calc(100dvh-3rem))] md:w-[min(1000px,calc(100vw-3rem))] md:rounded-[32px]', !open && 'pointer-events-none')}
                >
                  <Dialog.Title className="sr-only">Frogress Plus</Dialog.Title>
                  <Dialog.Description id="plus-description" className="sr-only">
                    {paywallContext.sub} Choose a plan below. Prices and eligible offers come from your store.
                  </Dialog.Description>
                  <SheetEnteredContext.Provider value={entered}>
                  <div inert={needsAccount || undefined} className="flex min-h-0 flex-1 flex-col">
                    <div className="flex min-h-0 flex-1">
                      {isDesktop ? (
                        <DesktopHero context={paywallContext} pass={props.previewItem ? { look } : null} />
                      ) : null}
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <header className="relative flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] short:pb-1 md:px-6 md:pt-4">
                          {view === 'compare' ? (
                            <button type="button" onClick={() => changeView('offer')} disabled={purchasing} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl pr-3 text-sm font-bold hover:bg-white/10 disabled:opacity-50">
                              <ChevronLeft className="h-5 w-5" aria-hidden /> Back
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-base font-black tracking-tight">
                              <Icon name="frogPlus" className="h-10 w-10 drop-shadow-[0_2px_0_rgba(22,8,48,0.3)]" />
                              Frogress <span className="rounded-full bg-[hsl(var(--primary))] px-2.5 py-1 text-[11px] tracking-wide text-[hsl(var(--primary-foreground))]">PLUS</span>
                            </span>
                          )}
                          <Dialog.Close asChild>
                            <button type="button" disabled={purchasing} onClick={() => markClose('close_button')} aria-label="Close Plus" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.14)] transition-[background-color,transform] hover:bg-white/15 active:scale-90 disabled:opacity-50">
                              <X className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                            </button>
                          </Dialog.Close>
                        </header>
                        <div ref={bindScroll} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pb-4 md:px-6">
                          {view === 'compare' ? <CompareView /> : (
                            <div className={cn('flex min-h-full flex-col', isDesktop && 'justify-center')}>
                              {!isDesktop ? <CoverHero context={paywallContext} pass={props.previewItem ? { look } : null} /> : null}
                              {earned && (earned.flies > 0 || earned.rareItems > 0) ? (
                                <PlusEarnedStrip
                                  earned={earned}
                                  label={preview?.phase === 'active' ? 'So far, Plus got you' : 'In 3 days, Plus got you'}
                                  className="mt-3.5 md:mb-4 md:mt-0"
                                />
                              ) : null}
                              {previewSet ? (
                                <PlusSetStrip
                                  set={previewSet}
                                  ended={preview?.phase !== 'active'}
                                  className="mt-2.5 md:mb-4 md:mt-0"
                                />
                              ) : null}
                              <PerkLedger perks={paywallContext.perks} onSeeAll={() => changeView('compare')} className="mt-3.5 short:mt-3 md:mt-0" />
                            </div>
                          )}
                        </div>
                        <footer data-more={moreBelow || undefined} className="plus-dock relative shrink-0 px-5 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-3.5 md:px-6 md:pb-4">
                          {deadline ? (
                            <p className="mb-2 text-center text-[12.5px] font-black text-primary">{deadline}</p>
                          ) : null}
                          <PlanSwitch plan={plan} onSelect={selectPlan} pricing={pricing}
                            pricingFailed={pricingFailed} busy={purchasing}
                            onRetry={() => setPricingAttempt((attempt) => attempt + 1)} />
                          <PlusGoldButton
                            className="mt-3"
                            onClick={startPurchase}
                            disabled={purchasing || pricesPending || !selected}
                            loading={pricesPending}
                          >
                            {purchasing
                              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Processing…</>
                              : pricesPending
                                ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading prices" />
                                : cta}
                          </PlusGoldButton>
                          <p aria-live="polite" role={purchaseError ? 'alert' : undefined} className={cn('mt-2.5 min-h-[18px] text-balance text-center text-[12.5px] font-bold leading-snug', purchaseError ? 'text-red-200' : 'text-muted-foreground')}>
                            {purchaseError ?? terms}
                          </p>
                          <LegalRow busy={purchasing} onRestore={restorePurchases} />
                        </footer>
                      </div>
                    </div>
                  </div>
                  </SheetEnteredContext.Provider>

              <PlusAccountPrompt
                open={needsAccount}
                linking={linking}
                linkError={linkError}
                onDismiss={dismissAccountPrompt}
                onLink={(provider) => void linkGuestAccount(provider)}
                onEmail={continueWithEmail}
              />
                </motion.div>
              </Dialog.Content>
            </>
          )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}


export type PaywallPreviewItem ={ slot: WardrobeSlot; riveIndex: number };

function usePaywallLook(open: boolean, preview?: PaywallPreviewItem | null) {
  const { ownedIndices } = useWardrobeIndices(open);
  const { skin, hat, body, hand_item } = ownedIndices;
  const previewSlot = preview && preview.slot !== 'container' ? preview.slot : null;
  const previewIndex = preview?.riveIndex ?? 0;
  return React.useMemo<FrogStampIndices>(() => {
    const look = { skin, mood: 0, hat, body, hand_item };
    return previewSlot ? { ...look, [previewSlot]: previewIndex } : look;
  }, [skin, hat, body, hand_item, previewSlot, previewIndex]);
}

const COVER_SRC = '/premium-cover.webp';

type HeroPass = { look: FrogStampIndices } | null;

function PlusCover({ className, imageClassName }: { className?: string; imageClassName?: string }) {
  const reduceMotion = useReducedMotion();
  const image = React.useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (image.current?.complete) setLoaded(true);
  }, []);
  return (
    <div aria-hidden className={cn('relative isolate overflow-hidden', className)}>
      <motion.img
        ref={image}
        src={COVER_SRC}
        alt=""
        width={1200}
        height={675}
        decoding="async"
        fetchPriority="high"
        draggable={false}
        onLoad={() => setLoaded(true)}
        initial={false}
        animate={loaded ? { opacity: 1, scale: 1 } : { opacity: 0, scale: reduceMotion ? 1 : 1.06 }}
        transition={{ opacity: { duration: 0.35, ease: 'easeOut' }, scale: { duration: 1.2, ease: [0.23, 1, 0.32, 1] } }}
        className={cn('absolute inset-0 h-full w-full select-none object-cover', imageClassName)}
      />
    </div>
  );
}

function HeroTitle({ context, className }: { context: PaywallContext; className?: string }) {
  return (
    <h2 className={cn('text-balance font-black leading-[1.08] tracking-tight', className)}>
      {context.headline}<br /><span className="text-primary">{context.accent}</span>
    </h2>
  );
}

function CoverHero({ context, pass }: { context: PaywallContext; pass: HeroPass }) {
  return (
    <section className="flex flex-col items-center text-center">
      {pass ? (
        <div className="-mx-5 self-stretch">
          <PlusStage look={pass.look} greet="loveShy" fly={false} />
        </div>
      ) : (
        <div className="plus-stage-arc relative -mx-5 self-stretch">
          <span aria-hidden className="absolute inset-x-0 top-0 z-10 h-[2px] bg-[#f5c84c]/60" />
          <PlusCover className="plus-stage-cover aspect-[9/4] short:aspect-[11/4]" imageClassName="object-[50%_46%]" />
        </div>
      )}
      <HeroTitle context={context} className="relative mt-3 text-[26px] short:mt-2.5 short:text-[22px]" />
    </section>
  );
}

function DesktopHero({ context, pass }: { context: PaywallContext; pass: HeroPass }) {
  return (
    <section className="relative flex w-[58%] max-w-[600px] shrink-0 flex-col overflow-hidden bg-[hsl(var(--plus-band))]">
      {pass ? (
        <PlusStage look={pass.look} greet="loveShy" fly={false} className="aspect-video h-auto w-full" />
      ) : (
        <div className="plus-stage-arc shrink-0">
          <PlusCover className="plus-stage-cover aspect-video w-full" />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col justify-center px-9 pb-7 pt-4">
        <HeroTitle context={context} className="text-[32px]" />
        <p className="mt-3 max-w-[27rem] text-pretty text-[15px] font-semibold leading-snug text-muted-foreground">
          {context.sub}
        </p>
      </div>
    </section>
  );
}

function PlanSwitch({ plan, onSelect, pricing, pricingFailed, busy, onRetry }: {
  plan: PlanId;
  onSelect: (plan: PlanId) => void;
  pricing: Partial<Record<PlanId, PlusPriceInfo>> | null;
  pricingFailed: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  const yearly = pricing?.yearly;
  const monthly = pricing?.monthly;
  const savings = yearly && monthly && yearly.currency === monthly.currency && monthly.amount > 0
    ? Math.round((1 - yearly.amount / (monthly.amount * 12)) * 100) : 0;
  return (
    <fieldset disabled={busy} className="min-w-0">
      <legend className="sr-only">Choose your plan</legend>
      <div className="grid grid-cols-2 gap-2.5">
        {(['yearly', 'monthly'] as const).map((id) => {
          const price = pricing?.[id];
          const unavailable = pricing !== null && !price;
          const on = plan === id;
          const off = price?.regular && price.regular.amount > price.amount
            ? Math.round((1 - price.amount / price.regular.amount) * 100) : 0;
          const badge = id !== 'yearly' ? null : off >= 5 ? `${off}% off` : savings >= 5 ? `Save ${savings}%` : null;
          return (
            <label key={id} className={cn(
              'relative flex min-h-[62px] cursor-pointer flex-col justify-center rounded-[18px] px-3 py-2 transition-[box-shadow,background-color,transform] duration-150 ease-out active:scale-[0.985]',
              on
                ? 'bg-card shadow-[inset_0_0_0_2px_hsl(var(--primary)),0_3px_0_0_rgba(26,8,56,0.35)]'
                : 'bg-white/[0.06] shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.14)] hover:bg-white/10',
              (unavailable || busy) && 'cursor-default opacity-60',
            )}>
              <input type="radio" name="plus-plan" value={id} checked={on} disabled={busy || unavailable} onChange={() => onSelect(id)} className="peer sr-only" />
              <span className="pointer-events-none absolute inset-0 rounded-[18px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
              <span className="flex items-center gap-1.5">
                <span aria-hidden className={cn(
                  'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full transition-[background-color,box-shadow] duration-150',
                  on ? 'bg-primary text-primary-foreground' : 'shadow-[inset_0_0_0_2px_rgba(255,255,255,0.3)]',
                )}>
                  {on ? <Check className="h-3 w-3 motion-safe:animate-[plus-chip-in_200ms_ease-out]" strokeWidth={3.5} /> : null}
                </span>
                <span className="text-[14px] font-black leading-none">{id === 'yearly' ? 'Yearly' : 'Monthly'}</span>
                {badge ? (
                  <span className="ml-auto whitespace-nowrap rounded-full bg-[hsl(var(--primary))] px-1.5 py-[3px] text-[10.5px] font-black leading-none text-[hsl(var(--primary-foreground))]">
                    {badge}
                  </span>
                ) : null}
              </span>
              <span className="mt-1.5 flex items-baseline gap-0.5 tabular-nums">
                <span className={cn('font-black leading-none', price ? 'text-[17px]' : 'text-[14px] text-muted-foreground')}>
                  {price ? price.priceString : unavailable ? 'Unavailable' : '—'}
                </span>
                {price ? <span className="text-[12px] font-bold text-muted-foreground">/{id === 'yearly' ? 'yr' : 'mo'}</span> : null}
                {price && off >= 5 ? <s className="ml-1 text-[12px] font-bold text-muted-foreground">{price.regular!.priceString}</s> : null}
              </span>
            </label>
          );
        })}
      </div>
      {pricingFailed ? <p role="status" className="mt-2 text-center text-xs font-bold text-muted-foreground">Couldn’t load store prices. <button type="button" onClick={onRetry} className="min-h-10 rounded-lg px-2 font-black text-primary underline underline-offset-2">Try again</button></p> : null}
    </fieldset>
  );
}

function LegalRow({ busy, onRestore }: {
  busy: boolean;
  onRestore: () => void | Promise<void>;
}) {
  const isNative = Capacitor.isNativePlatform();
  const isIos = Capacitor.getPlatform() === 'ios';
  const link = 'inline-flex min-h-7 items-center underline underline-offset-2 hover:text-foreground';
  return (
    <p className="mt-0.5 flex flex-wrap items-center justify-center gap-x-3 text-center text-[11px] font-semibold text-muted-foreground">
      {isNative ? <button type="button" disabled={busy} onClick={onRestore} className={link}>Restore</button> : null}
      <a href={isIos ? APPLE_EULA_URL : TERMS_URL} target="_blank" rel="noreferrer" className={link}>Terms</a>
      <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className={link}>Privacy</a>
    </p>
  );
}


const COMPARISON_GROUPS: Array<{
  title: string;
  icon: 'x2' | 'leap' | 'wardrobe' | 'planner';
  rows: Array<{ label: string; free: string; plus: string }>;
}> = [
  { title: 'Quests & gifts', icon: 'x2', rows: [
    { label: 'Flies from daily quests', free: '1×', plus: '2×' },
    { label: 'Prizes in each gift', free: '1', plus: '2' },
    { label: 'Season Plus reward track', free: '—', plus: 'Included' },
    { label: 'Golden fly companion', free: '—', plus: 'Included' },
  ] },
  { title: 'Habits & Leap', icon: 'leap', rows: [
    { label: 'Flies from every habit', free: '1×', plus: '2×' },
    { label: 'Prizes at each new league', free: '1', plus: '2' },
    { label: 'Weekly league gifts', free: '1', plus: '2' },
    { label: 'Free Lily Pad', free: '—', plus: '1 / month' },
    { label: 'Lily Pads you can keep', free: '2', plus: '3' },
  ] },
  { title: 'Wardrobe & shop', icon: 'wardrobe', rows: [
    { label: 'Special shop items a day', free: String(DEFAULT_SHOP_SALES.freeSlots), plus: String(DEFAULT_SHOP_SALES.freeSlots + DEFAULT_SHOP_SALES.plusSlots) },
    { label: `Daily ${DEFAULT_SHOP_SALES.saleDiscountPercent}% off pick`, free: '—', plus: 'Included' },
    { label: 'Daily legendary in the shop', free: '—', plus: 'Included' },
    { label: 'Shop refreshes a day', free: `${DEFAULT_SHOP_SALES.adRerolls} ad`, plus: String(Math.max(DEFAULT_SHOP_SALES.plusRefreshes, DEFAULT_SHOP_SALES.freeRerolls)) },
    { label: 'Trade reward rerolls', free: 'With ads', plus: 'No ads' },
    { label: 'Wishlist slots', free: '4', plus: '10' },
    { label: 'Saved looks', free: String(SAVED_LOOKS_FREE), plus: String(SAVED_LOOKS_PLUS) },
  ] },
  { title: 'Planning & coaching', icon: 'planner', rows: [
    { label: 'Weekly coach read', free: '—', plus: 'Included' },
    { label: 'Tags for your tasks', free: String(FREE_TAG_LIMIT), plus: String(PREMIUM_TAG_LIMIT) },
  ] },
];

function CompareValue({ value, plus = false }: { value: string; plus?: boolean }) {
  if (value === 'Included') {
    return (
      <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-[var(--plus-cta)] text-[var(--plus-cta-ink)]">
        <Check className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden />
        <span className="sr-only">Included</span>
      </span>
    );
  }
  if (value === '—') {
    return (
      <span className="text-muted-foreground/40">
        <span aria-hidden>—</span>
        <span className="sr-only">Not included</span>
      </span>
    );
  }
  return <span className={plus ? 'text-[13px] font-black text-primary' : ''}>{value}</span>;
}

function CompareView() {
  return (
    <div className="mx-auto w-full max-w-xl pb-4 pt-2">
      <h2 className="text-[26px] font-black leading-tight tracking-tight">Everything in Plus</h2>
      <p className="mt-1 text-sm font-medium text-muted-foreground">Everything free stays free. Plus adds these on top.</p>

      <div className="sticky top-0 z-10 -mx-1 mt-4 grid grid-cols-[minmax(0,1fr)_64px_84px] items-end bg-background px-1 pb-2 pt-2">
        <span />
        <span className="text-center text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">Free</span>
        <span className="flex flex-col items-center gap-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-primary">
          <Icon name="frogPlus" className="h-7 w-7" />
          Plus
        </span>
      </div>

      <div className="space-y-3">
        {COMPARISON_GROUPS.map((group) => (
          <section key={group.title} className={cn('overflow-hidden', HOME_CARD_SURFACE)}>
            <h3 className="flex items-center gap-2 px-3.5 pb-1.5 pt-3 text-[13px] font-black text-foreground">
              <span className="grid h-7 w-7 place-items-center rounded-xl bg-primary/10">
                <Icon name={group.icon} className="h-5 w-5" />
              </span>
              {group.title}
            </h3>
            <table className="w-full table-fixed border-collapse text-left text-[13px]">
              <caption className="sr-only">{group.title}: Free compared with Plus</caption>
              <colgroup><col /><col className="w-16" /><col className="w-[84px]" /></colgroup>
              <thead className="sr-only"><tr><th scope="col">Benefit</th><th scope="col">Free</th><th scope="col">Plus</th></tr></thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.label} className="border-t border-border/60">
                    <th scope="row" className="py-3 pl-3.5 pr-2 font-semibold leading-snug">{row.label}</th>
                    <td className="px-1 py-3 text-center text-xs font-semibold tabular-nums text-muted-foreground"><CompareValue value={row.free} /></td>
                    <td className="bg-[rgba(245,200,76,0.1)] px-1 py-3 text-center tabular-nums"><CompareValue value={row.plus} plus /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}

export function PlusAccountPrompt({
  open,
  linking,
  linkError,
  onDismiss,
  onLink,
  onEmail,
}: {
  open: boolean;
  linking: 'google' | 'apple' | null;
  linkError: string | null;
  onDismiss: () => void;
  onLink: (provider: 'google' | 'apple') => void;
  onEmail: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10011] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
          onClick={onDismiss}
        >
          <motion.div
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{
              type: 'spring',
              stiffness: 380,
              damping: 30,
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-[28px] bg-white p-6 text-center text-slate-900 shadow-2xl"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <ShieldAlert
                className="h-7 w-7 text-[#447d3f]"
                strokeWidth={2.5}
              />
            </div>
            <h3 className="mt-3 text-lg font-black tracking-tight">
              Save your frog first
            </h3>
            <p className="mt-2 text-sm font-medium text-slate-600">
              Plus is tied to your account. Save your frog, and
              you can review your plan before continuing.
            </p>
            <button
              type="button"
              onClick={() => onLink('apple')}
              disabled={!!linking}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-slate-900 text-[15px] font-black text-white shadow-[0_4px_0_0_#020617] transition-all hover:brightness-110 active:translate-y-1 active:shadow-none disabled:opacity-60"
            >
              {linking === 'apple' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <AppleIcon /> Continue with Apple
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => onLink('google')}
              disabled={!!linking}
              className="mt-2.5 flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-slate-200 bg-white text-[15px] font-black text-slate-900 shadow-[0_4px_0_0_#e2e8f0] transition-all hover:bg-slate-50 active:translate-y-1 active:shadow-none disabled:opacity-60"
            >
              {linking === 'google' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <GoogleIcon /> Continue with Google
                </>
              )}
            </button>
            {linkError && (
              <p className="mt-2.5 text-xs font-bold text-red-500">
                {linkError}
              </p>
            )}
            <button
              type="button"
              onClick={onEmail}
              disabled={!!linking}
              className="mt-2 h-10 w-full rounded-2xl text-sm font-bold text-slate-500 transition-colors hover:text-slate-700"
            >
              Use email instead
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
