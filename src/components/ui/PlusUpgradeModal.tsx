'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from 'framer-motion';
import { mutate } from 'swr';
import { useNotification } from '@/components/providers/NotificationProvider';
import { Capacitor } from '@capacitor/core';
import { Icon } from '@/components/ui/Icon';
import { Bell, Check, ChevronLeft, ChevronRight, Crown, Loader2, ShieldAlert, Sparkles, X } from 'lucide-react';
import { SAVED_LOOKS_FREE, SAVED_LOOKS_PLUS } from '@/lib/skins/looks';
import { FREE_TAG_LIMIT, PREMIUM_TAG_LIMIT } from '@/lib/tags/limits';
import { DEFAULT_SHOP_SALES } from '@/lib/skins/shopSales';
import type { WardrobeSlot } from '@/lib/skins/catalog';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import type { FrogStampIndices } from '@/lib/frogStampEngine';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { pickEmote } from '@/lib/frogEmotes';
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
  TRIAL_REMINDER_LEAD_MS,
  getPlusContext,
  trialEndsAt,
  type PaywallContext,
  type TrialPeriod,
} from '@/lib/plusPaywall';
import { useNotificationStatus } from '@/hooks/useNotificationStatus';
import { showPlusWelcome } from '@/components/ui/PlusWelcome';
import { establishSessionCookie } from '@/lib/authCookie';
import {
  GoogleAccountExistsError,
  getGoogleAuthErrorMessage,
  signInWithGoogle,
} from '@/lib/googleAuth';
import {
  AppleAccountExistsError,
  getAppleAuthErrorMessage,
  signInWithApple,
} from '@/lib/appleAuth';
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

const PAYWALL_VARIANT = 'two_step_v1';

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
      if (provider === 'google') {
        await signInWithGoogle({ linkTo: current });
      } else {
        await signInWithApple({ linkTo: current });
      }
      const user = auth?.currentUser;
      if (!user) throw new Error('Authentication did not complete');
      await user.getIdToken(true);
      await establishSessionCookie(user);
      await fetch('/api/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      trackAnalyticsEvent('paywall_account_result', { ...paywallProps(), status: 'linked', provider });
      setNeedsAccount(false);
      void mutate(() => true);
      // Linking can change offer eligibility. Refresh before the user confirms.
      setPricingAttempt((attempt) => attempt + 1);
    } catch (err) {
      if (
        err instanceof GoogleAccountExistsError ||
        err instanceof AppleAccountExistsError
      ) {
        trackAnalyticsEvent('paywall_account_result', { ...paywallProps(), status: 'existing_account', provider });
        window.location.assign('/login?upgrade=1');
        return;
      }
      trackAnalyticsEvent('paywall_account_result', {
        ...paywallProps(),
        status: 'failed',
        provider,
        error_code: purchaseErrorCode(err),
      });
      setLinkError(
        provider === 'google'
          ? getGoogleAuthErrorMessage(err)
          : getAppleAuthErrorMessage(err),
      );
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
    window.location.assign('/login?upgrade=1');
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
  const { open, onClose } = props;
  const look = usePaywallLook(open, props.previewItem);
  const {
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
    freeWeek,
  } = usePlusPaywall(props);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!open) setEntered(false);
  }, [open]);

  if (!mounted) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next && !purchasing && !linking) onClose(); }}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open && (
            <>
              <Dialog.Overlay forceMount asChild>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[10008] bg-black/50 md:backdrop-blur-sm"
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
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  onAnimationComplete={() => { if (open) setEntered(true); }}
                  className="plus-paywall fixed inset-0 z-[10009] m-auto flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground shadow-2xl outline-none md:h-[min(760px,calc(100dvh-3rem))] md:w-[min(940px,calc(100vw-3rem))] md:rounded-[32px]"
                >
                  <Dialog.Title className="sr-only">Frogress Plus</Dialog.Title>
                  <Dialog.Description id="plus-description" className="sr-only">
                    Double quest and gift rewards, every Special shop item and a weekly coach for your habits.
                    Choose a subscription below. Prices and eligible offers come from your store.
                  </Dialog.Description>
                  <PaywallEnteredContext.Provider value={entered}>
                  <PaywallLookContext.Provider value={look}>
                  <div inert={needsAccount || undefined} className="flex min-h-0 flex-1 flex-col">
                    <header className={cn('relative flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] short:pb-1 md:px-7 md:pt-4')}>
                      {showBack ? (
                        <button type="button" onClick={goBack} disabled={purchasing} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl pr-3 text-sm font-bold hover:bg-muted disabled:opacity-50">
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

                    <div className="flex min-h-0 flex-1">
                      {isDesktop && view === 'offer' ? (
                        <div className="flex w-[43%] shrink-0 p-4 pr-0 pt-1">
                          <DesktopHero context={paywallContext} />
                        </div>
                      ) : null}
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <div ref={bindScroll} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 pb-4 md:px-7 md:[scrollbar-gutter:stable]">
                          {view === 'compare' ? <CompareView /> : (
                            <motion.div
                              key={step}
                              initial={step !== 'offer' || stepDirection < 0 ? (reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24 * stepDirection }) : false}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                              className="flex min-h-full flex-col"
                            >
                              {step === 'checkout' ? (
                                <section className="flex flex-1 flex-col justify-center py-2">
                                  <MemberCard name={props.frogName} plan={plan} />
                                  <h2 className="text-balance text-center text-[25px] font-black leading-[1.08] tracking-tight short:text-[21px] md:text-left md:text-[28px]">
                                    {freeWeek
                                      ? <>Start your<br /><span className="text-primary">free week</span></>
                                      : selected?.trialDuration
                                        ? <>Try Plus<br /><span className="text-primary">free for {selected.trialDuration}</span></>
                                        : <>Pick your<br /><span className="text-primary">Plus plan</span></>}
                                  </h2>
                                  {selected?.trialPeriod ? <TrialRail trial={selected.trialPeriod} /> : null}
                                  <div className="mt-6 short:mt-4">
                                    <PlanPicker plan={plan} onSelect={selectPlan} pricing={pricing}
                                      pricingFailed={pricingFailed} busy={purchasing}
                                      onRetry={() => setPricingAttempt((attempt) => attempt + 1)} />
                                  </div>
                                  <PlanFooter busy={purchasing} onRestore={restorePurchases} />
                                </section>
                              ) : (
                                <>
                                  {!isDesktop ? <CoverHero context={paywallContext} /> : null}
                                  <div className={cn(isDesktop && 'flex flex-1 flex-col justify-center')}>
                                    <OfferBenefits context={paywallContext} onSeeAll={() => changeView('compare')} />
                                  </div>
                                </>
                              )}
                            </motion.div>
                          )}
                        </div>
                        <footer data-more={moreBelow || undefined} className="plus-dock relative shrink-0 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 md:px-7 md:pb-5">                          {view === 'compare' ? (
                            <PrimaryButton onClick={() => { changeView('offer'); goStep('checkout'); }}>Continue</PrimaryButton>
                          ) : (
                            <>
                              <p aria-live="polite" role={purchaseError ? 'alert' : undefined} className={cn('mb-2.5 text-balance text-center leading-snug', purchaseError ? 'text-[13px] font-bold text-red-200' : onPlans ? 'text-[14px] font-black text-foreground' : 'text-[13px] font-bold text-muted-foreground')}>
                                {purchaseError ?? caption}
                              </p>
                              <PrimaryButton onClick={onPlans ? startPurchase : () => goStep(steps[Math.min(steps.length - 1, stepIndex + 1)])} disabled={purchasing || (onPlans && (pricesPending || !selected))} loading={onPlans && pricesPending}>
                                {ctaContent}
                              </PrimaryButton>
                            </>
                          )}
                          <button type="button" onClick={() => { markClose('continue_free'); onClose(); }} disabled={purchasing} className="mt-3 min-h-10 w-full rounded-xl text-center text-[13px] font-bold text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground disabled:opacity-50">
                            Maybe later
                          </button>
                        </footer>
                      </div>
                    </div>
                  </div>
                  </PaywallLookContext.Provider>
                  </PaywallEnteredContext.Provider>

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
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


export type PaywallPreviewItem = { slot: WardrobeSlot; riveIndex: number };

const BARE_LOOK: FrogStampIndices = { skin: 0, mood: 0, hat: 0, body: 0, hand_item: 0 };
const PaywallLookContext = React.createContext<FrogStampIndices>(BARE_LOOK);

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

const PaywallEnteredContext = React.createContext(true);

const COVER_SRC = '/premium-cover.webp';

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

function CoverHero({ context }: { context: PaywallContext }) {
  return (
    <section className="flex flex-col items-center text-center">
      <div className="plus-stage-arc relative -mx-5 self-stretch">
        <span aria-hidden className="absolute inset-x-0 top-0 z-10 h-[2px] bg-[#f5c84c]/60" />
        <PlusCover className="plus-stage-cover aspect-video short:aspect-[2/1]" imageClassName="object-[50%_70%]" />
      </div>
      <h2 className="relative mt-4 text-balance text-[26px] font-black leading-[1.08] tracking-tight short:mt-3 short:text-[22px]">
        {context.headline}<br /><span className="text-primary">{context.accent}</span>
      </h2>
    </section>
  );
}

function DesktopHero({ context }: { context: PaywallContext }) {
  return (
    <section className="plus-hero-panel relative isolate flex w-full flex-col overflow-hidden rounded-[28px]">
      <h2 className="text-balance px-7 pt-7 text-[30px] font-black leading-[1.08] tracking-tight">
        {context.headline}<br /><span className="text-primary">{context.accent}</span>
      </h2>
      <div className="flex flex-1 items-center px-4 pb-4">
        <div className="plus-stage-arc w-full">
          <PlusCover className="plus-stage-cover aspect-[16/10] w-full rounded-t-[20px]" imageClassName="object-[50%_70%]" />
        </div>
      </div>
    </section>
  );
}

function BenefitTitle({ title }: { title: string }) {
  const match = title.match(/^(\d+\s?[×%]?)(\s.*)$/);
  if (!match) return <>{title}</>;
  return (
    <>
      <span className="text-primary">{match[1]}</span>
      {match[2]}
    </>
  );
}

function OfferBenefits({ context, onSeeAll }: { context: PaywallContext; onSeeAll: () => void }) {
  return (
    <>
      <ul className="mt-5 divide-y divide-white/10 rounded-[24px] bg-card px-4 shadow-[0_4px_0_0_rgba(26,8,56,0.35)] short:mt-3 md:mt-1">
        {context.benefits.map((benefit, index) => (
          <li key={benefit.title} className="plus-benefit-rise flex items-center gap-3.5 py-3.5 short:py-2.5" style={{ animationDelay: `${120 + index * 50}ms` }}>
            <span
              style={{ animationDelay: `${200 + index * 70}ms` }}
              className="plus-benefit-pop plus-icon-tone grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#f3edff] shadow-[inset_0_-3px_0_rgba(70,30,130,0.2)] short:h-10 short:w-10"
            >
              {benefit.icon === 'store' ? <span aria-hidden className="h-14 w-14 shrink-0 -translate-y-1.5"><GiftRive color={0} paused /></span> : <Icon name={benefit.icon} className="h-10 w-10 short:h-8 short:w-8" />}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[16px] font-black leading-tight"><BenefitTitle title={benefit.title} /></span>
              <span className="mt-0.5 block text-[13px] font-semibold leading-snug text-muted-foreground short:hidden">{benefit.body}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="plus-benefit-rise mt-2 flex justify-center short:mt-1" style={{ animationDelay: `${120 + context.benefits.length * 50}ms` }}>
        <button type="button" onClick={onSeeAll} className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-[14px] font-black text-primary transition-colors hover:bg-white/10 active:bg-white/15 short:min-h-9">
          See everything in Plus
          <ChevronRight className="h-4 w-4" strokeWidth={2.75} aria-hidden />
        </button>
      </div>
    </>
  );
}

function PrimaryButton({ onClick, children, disabled, loading, className }: {
  onClick: () => void | Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-busy={loading || undefined}
      className={cn('plus-upgrade-button relative isolate flex min-h-[54px] w-full touch-manipulation items-center justify-center overflow-hidden rounded-2xl bg-[var(--plus-cta)] px-4 [--plus-button-base:var(--plus-cta-edge)] py-3 text-[17px] font-black text-[var(--plus-cta-ink)] hover:bg-[var(--plus-cta-hover)] disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none', loading && 'disabled:opacity-100', className)}>
      {!disabled ? (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-[40%] -z-10 w-[35%] bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 motion-safe:animate-[plus-cta-shine_4.2s_ease-in-out_1.2s_infinite]" />
      ) : null}
      {children}
    </button>
  );
}

function MemberCard({ name, plan }: { name?: string; plan: PlanId }) {
  const reduceMotion = useReducedMotion();
  const look = React.useContext(PaywallLookContext);
  const frog = React.useRef<FrogHandle>(null);
  const seal = useAnimationControls();
  const lastPlan = React.useRef(plan);
  useEffect(() => {
    if (lastPlan.current === plan) return;
    lastPlan.current = plan;
    frog.current?.fireEmote(pickEmote('pick'), { soft: true });
    if (!reduceMotion) void seal.start({ rotate: [0, -12, 9, -4, 0], scale: [1, 1.12, 1], transition: { duration: 0.5, ease: 'easeOut' } });
  }, [plan, reduceMotion, seal]);
  const member = auth?.currentUser?.displayName?.trim().split(/\s+/)[0] || name?.trim() || 'You';
  const [since] = useState(() => new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
  return (
    <div aria-hidden className="mb-5 flex justify-center short:mb-3 md:justify-start">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 14, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ type: 'spring', duration: 0.5, bounce: 0.25, delay: 0.05 }}
        className="plus-club-card relative isolate h-[140px] w-[min(100%,316px)] overflow-hidden rounded-[24px] short:h-[120px]"      >
        <span className="absolute -bottom-[58px] right-0 -z-10 h-[156px] w-[156px] rounded-full bg-white/[0.09] short:-bottom-[66px]" />
        <span className="absolute -bottom-[8px] right-1 h-[176px] w-[148px] short:h-[156px] short:w-[132px]">
          <Frog ref={frog} width="100%" height="100%" indices={look} visualOffsetY={0} placeholder arrive="pop" arriveDelay={180} greet="loveShy" paused={!!reduceMotion} />
        </span>
        <span className="absolute left-5 top-[16px] flex items-center gap-1.5 short:top-[12px]">
          <motion.span animate={seal} className="block">
            <Icon name="frogPlus" className="h-7 w-7" />
          </motion.span>
          <span className="text-[11px] font-black uppercase leading-none tracking-[0.14em] text-[#d6c6ff]">Frogress Plus</span>
        </span>
        <span className="absolute bottom-[18px] left-5 right-[150px] short:bottom-[14px] short:right-[134px]">
          <span className="block truncate pb-[3px] text-[26px] font-black leading-none tracking-[-0.01em] text-white short:text-[22px]">{member}</span>
          <span className="mt-1.5 block truncate text-[12px] font-bold leading-none text-[#d6c6ff]">Member since {since}</span>
        </span>
      </motion.div>
    </div>
  );
}

function CalendarTile({ date, today = false }: { date: Date; today?: boolean }) {
  return (
    <span className={cn('flex h-11 w-10 flex-col overflow-hidden rounded-[11px] bg-white shadow-[0_3px_0_0_rgba(26,8,56,0.4)]', today && 'ring-2 ring-[var(--plus-cta)] ring-offset-2 ring-offset-[hsl(var(--card))]')}>
      <span className={cn('py-[3px] text-center text-[9px] font-black uppercase leading-none tracking-wide', today ? 'bg-[var(--plus-cta)] text-[var(--plus-cta-ink)]' : 'bg-[hsl(var(--background))] text-white')}>
        {date.toLocaleDateString('en-US', { month: 'short' })}
      </span>
      <span className="grid flex-1 place-items-center text-[17px] font-black leading-none tabular-nums text-[#3a1a78]">
        {date.getDate()}
      </span>
    </span>
  );
}

function TrialRail({ trial }: { trial: TrialPeriod }) {
  const reduceMotion = useReducedMotion();
  const notifications = useNotificationStatus();
  const [start] = useState(() => new Date());
  const end = trialEndsAt(trial, start);
  const reminder = new Date(end.getTime() - TRIAL_REMINDER_LEAD_MS);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const dayCount = (date: Date) => Math.round((date.getTime() - start.getTime()) / DAY_MS);
  const shortDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const label = (date: Date) => (dayCount(end) <= 31 ? `Day ${dayCount(date)}` : shortDate(date));
  const canRemind = notifications.isEnabled || notifications.canEnable;
  const hasReminder = reminder.getTime() - start.getTime() >= 12 * 60 * 60 * 1000 && canRemind;
  const nodes: Array<{ key: string; date: Date; today?: boolean; title: string; body: string }> = [
    { key: 'today', date: start, today: true, title: 'Today', body: 'Plus unlocks' },
    ...(hasReminder ? [{ key: 'reminder', date: reminder, title: label(reminder), body: 'Reminder' }] : []),
    { key: 'end', date: end, title: label(end), body: 'First payment' },
  ];
  const inset = `${50 / nodes.length}%`;
  return (
    <div className="mt-6 short:mt-4">
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${nodes.length}, minmax(0, 1fr))` }}>
        <span aria-hidden className="absolute top-[22px] h-[3px] -translate-y-1/2 rounded-full bg-white/15" style={{ left: inset, right: inset }} />
        <span aria-hidden className="absolute top-[22px] h-[3px] -translate-y-1/2 origin-left rounded-full bg-gradient-to-r from-[var(--plus-cta)] to-transparent motion-safe:animate-[plus-rail-grow_700ms_cubic-bezier(0.23,1,0.32,1)_200ms_both]" style={{ left: inset, right: inset }} />
        {nodes.map((node, index) => (
          <motion.li
            key={node.key}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + index * 0.08, duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="relative flex min-w-0 flex-col items-center px-1 text-center"
          >
            <CalendarTile date={node.date} today={node.today} />
            <span className="mt-2 text-[14px] font-black leading-tight">{node.body}</span>
            <span className="mt-0.5 text-[12.5px] font-bold leading-tight text-muted-foreground">{node.title}</span>
          </motion.li>
        ))}
      </ol>
      {hasReminder && !notifications.isEnabled ? (
        <div className="mt-3 flex justify-center">
          <button type="button" onClick={() => void notifications.enableOrConfigure()} className="inline-flex min-h-9 items-center rounded-xl bg-white/10 px-3 text-[13px] font-black text-primary transition-[background-color,transform] duration-150 hover:bg-white/15 active:scale-95">
            Turn on the reminder
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PlanPicker({ plan, onSelect, pricing, pricingFailed, busy, onRetry }: {
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
  const reduceMotion = useReducedMotion();
  return (
    <fieldset disabled={busy} className="min-w-0">
      <legend className="sr-only">Choose your plan</legend>
      <div className="grid grid-cols-1 gap-2.5">
        {(['yearly', 'monthly'] as const).map((id, index) => {
          const price = pricing?.[id];
          const unavailable = pricing !== null && !price;
          const selectedCard = plan === id;
          return (
            <motion.div
              key={id}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 + index * 0.06, duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              <label className={cn(
                'relative flex min-h-[60px] cursor-pointer items-center gap-3 rounded-[18px] px-4 py-3 transition-[box-shadow,background-color,transform] duration-150 ease-out active:scale-[0.985]',
                selectedCard
                  ? 'bg-card shadow-[inset_0_0_0_2px_hsl(var(--primary)),0_4px_0_0_rgba(26,8,56,0.35)]'
                  : 'bg-white/[0.06] shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.14)] hover:bg-white/10',
                (unavailable || busy) && 'cursor-default opacity-60',
              )}>
                <input type="radio" name="plus-plan" value={id} checked={selectedCard} disabled={busy || unavailable} onChange={() => onSelect(id)} className="peer sr-only" />
                <span aria-hidden className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full transition-[background-color,box-shadow] duration-150',
                  selectedCard ? 'bg-primary text-primary-foreground' : 'shadow-[inset_0_0_0_2px_rgba(255,255,255,0.3)]',
                )}>
                  {selectedCard ? <Check className="h-3.5 w-3.5 motion-safe:animate-[plus-chip-in_200ms_ease-out]" strokeWidth={3.5} /> : null}
                </span>
                <span className="pointer-events-none absolute inset-0 rounded-[18px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="text-[16px] font-black leading-tight">{id === 'yearly' ? 'Yearly' : 'Monthly'}</span>
                  {id === 'yearly' && savings >= 5 ? (
                    <span className="rounded-full bg-[hsl(var(--primary))] px-2 py-1 text-[11px] font-black leading-none text-[hsl(var(--primary-foreground))]">
                      Save {savings}%
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className={cn('font-black [overflow-wrap:anywhere]', price ? 'text-[17px]' : 'text-[15px] text-muted-foreground')}>
                    {price ? price.priceString : unavailable ? 'Unavailable' : '—'}
                  </span>
                  {price ? <span className="text-[13px] font-bold text-muted-foreground">/{id === 'yearly' ? 'yr' : 'mo'}</span> : null}
                </span>
              </label>
            </motion.div>
          );
        })}
      </div>
      {pricingFailed ? <p role="status" className="mt-2 text-center text-xs font-bold text-muted-foreground">Couldn’t load store prices. <button type="button" onClick={onRetry} className="min-h-10 rounded-lg px-2 font-black text-primary underline underline-offset-2">Try again</button></p> : null}
    </fieldset>
  );
}

export function PlanFooter({ busy, onRestore }: {
  busy: boolean;
  onRestore: () => void | Promise<void>;
}) {
  const isNative = Capacitor.isNativePlatform();
  const isIos = Capacitor.getPlatform() === 'ios';
  return (
    <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2.5 text-center text-[11px] font-semibold text-muted-foreground">
      <span>Renews automatically. Cancel anytime.</span>
      {isNative ? <button type="button" disabled={busy} onClick={onRestore} className="min-h-8 underline underline-offset-2 hover:text-foreground">Restore</button> : null}
      <a href={isIos ? APPLE_EULA_URL : TERMS_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center underline underline-offset-2 hover:text-foreground">Terms</a>
      <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center underline underline-offset-2 hover:text-foreground">Privacy</a>
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
    { label: 'Wishlist slots', free: '4', plus: '10' },
    { label: 'Saved looks', free: String(SAVED_LOOKS_FREE), plus: String(SAVED_LOOKS_PLUS) },
    { label: 'Trade reward rerolls', free: 'With ads', plus: 'No ads' },
    { label: 'Shop refreshes a day', free: `${DEFAULT_SHOP_SALES.freeRerolls} + ${DEFAULT_SHOP_SALES.adRerolls} ad`, plus: String(Math.max(DEFAULT_SHOP_SALES.plusRefreshes, DEFAULT_SHOP_SALES.freeRerolls)) },
  ] },
  { title: 'Planning & coaching', icon: 'planner', rows: [
    { label: 'Weekly coach read', free: '—', plus: 'Included' },
    { label: 'Tags for your tasks', free: String(FREE_TAG_LIMIT), plus: String(PREMIUM_TAG_LIMIT) },
  ] },
];

function CompareValue({ value, plus = false }: { value: string; plus?: boolean }) {
  if (value === 'Included') {
    return (
      <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-amber-400 text-amber-950">
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
      <p className="mt-1 text-sm font-medium text-muted-foreground">Your free experience stays. Plus adds these extras and supports our small team.</p>

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
                    <td className="bg-amber-400/10 px-1 py-3 text-center tabular-nums"><CompareValue value={row.plus} plus /></td>
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
