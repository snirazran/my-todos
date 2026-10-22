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
import { CATALOG, rarityRank, type ItemDef, type Rarity } from '@/lib/skins/catalog';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import type { FrogStampIndices } from '@/lib/frogStampEngine';
import Frog from '@/components/ui/frog';
import { PremiumFrogAura } from '@/components/ui/PremiumFrogAura';
import { useSettled } from '@/hooks/useSettled';
import {
  formatPlusPrice,
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
type Step = 'offer' | 'trial' | 'plans';
type PlanId = 'yearly' | 'monthly';
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
  step: Step;
};

const PAYWALL_VARIANT = 'trial_steps_v1';

const APPLE_EULA_URL =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const TERMS_URL = 'https://frogress.com/terms';
const PRIVACY_URL = 'https://frogress.com/privacy';


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

let cachedPricing: { uid: string; prices: Partial<Record<PlanId, PlusPriceInfo>> } | null = null;

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


export function PlusUpgradeModal({
  open,
  onClose,
  onStartTrial,
  placement = 'unknown',
  frogName,
}: {
  open: boolean;
  onClose: () => void;
  onStartTrial?: (plan: PlanId) => void | Promise<void>;
  placement?: string;
  frogName?: string;
}) {
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
    variant: PAYWALL_VARIANT,
    paywall_session: sessionRef.current?.id,
  });
  const markClose = (method: CloseMethod) => {
    if (sessionRef.current) sessionRef.current.closeMethod = method;
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
    setPricing(uid && cachedPricing?.uid === uid ? cachedPricing.prices : null);
    getPlusPricing()
      .then((prices) => {
        if (uid && (prices.yearly || prices.monthly)) cachedPricing = { uid, prices };
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
  }, [open, pricingAttempt]);

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
    trackAnalyticsEvent('paywall_viewed', { placement, variant: PAYWALL_VARIANT, paywall_session: session.id });
    return () => {
      if (session.outcome) return;
      trackAnalyticsEvent('paywall_dismissed', {
        placement,
        variant: PAYWALL_VARIANT,
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
  }, [open, placement]);

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
      const outcome = await purchasePlus(plan, placement, session?.id);
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

  if (!mounted) return null;

  const selected = pricing?.[plan];
  const paywallContext = getPlusContext(placement, frogName);
  const changeView = (next: View) => {
    setView(next);
    scrollRef.current?.scrollTo({ top: 0 });
    if (next !== 'compare') return;
    if (sessionRef.current) sessionRef.current.sawCompare = true;
    trackAnalyticsEvent('paywall_compare_viewed', paywallProps());
  };
  const steps: Step[] = selected?.trialPeriod ? ['offer', 'trial', 'plans'] : ['offer', 'plans'];
  const stepIndex = Math.max(0, steps.indexOf(step));
  const onPlans = step === 'plans';
  const goStep = (next: Step) => {
    setStepDirection(steps.indexOf(next) >= stepIndex ? 1 : -1);
    setStep(next);
    scrollRef.current?.scrollTo({ top: 0 });
    if (sessionRef.current) sessionRef.current.step = next;
    if (next !== 'offer') trackAnalyticsEvent('paywall_step_viewed', { ...paywallProps(), step: next });
  };
  const showBack = view === 'compare' || step !== 'offer';
  const goBack = () => {
    if (view === 'compare') changeView('offer');
    else goStep(steps[Math.max(0, stepIndex - 1)]);
  };
  const pricesPending = !pricing && !pricingFailed;
  const ctaLabel = onPlans
    ? selected?.trialDuration ? 'Start my free trial' : 'Get Plus'
    : step === 'trial'
      ? 'Try it for free'
      : selected?.trialDuration ? `Try for ${formatPlusPrice(0, selected.currency)}` : 'Continue';
  const ctaContent = purchasing
    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Processing…</>
    : pricesPending
      ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading prices" />
      : ctaLabel;
  const caption = selected
    ? selected.trialDuration ? 'No charge today · Cancel anytime' : 'Cancel anytime'
    : pricingFailed ? 'Store prices are unavailable right now' : 'Checking your store’s prices and offers…';

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
                  className="plus-paywall fixed inset-0 z-[10009] m-auto flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground shadow-2xl outline-none md:h-[min(760px,calc(100dvh-3rem))] md:w-[min(940px,calc(100vw-3rem))] md:rounded-[32px]"
                >
                  <Dialog.Title className="sr-only">Frogress Plus</Dialog.Title>
                  <Dialog.Description id="plus-description" className="sr-only">
                    A weekly coach for your habits, double quest and gift rewards, and more outfits every season.
                    Choose a subscription below. Prices and eligible offers come from your store.
                  </Dialog.Description>
                  <div inert={needsAccount || undefined} className="flex min-h-0 flex-1 flex-col">
                    <header className={cn('relative flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] short:pb-1 md:px-7 md:pt-4', !isDesktop && view === 'offer' && step === 'offer' && 'absolute inset-x-0 top-0 z-20')}>
                      {showBack ? (
                        <button type="button" onClick={goBack} disabled={purchasing} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl pr-3 text-sm font-bold hover:bg-muted disabled:opacity-50">
                          <ChevronLeft className="h-5 w-5" aria-hidden /> Back
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-base font-black tracking-tight">
                          <Icon name="frogPlus" className="h-10 w-10 drop-shadow-[0_2px_0_rgba(52,99,31,0.2)]" />
                          Frogress <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] tracking-wide text-amber-950">PLUS</span>
                        </span>
                      )}
                      <Dialog.Close asChild>
                        <button type="button" disabled={purchasing} onClick={() => markClose('close_button')} aria-label="Close Plus" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition-[background-color,transform] hover:bg-white/25 active:scale-90 disabled:opacity-50">
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
                              initial={step !== 'offer' || stepDirection < 0 ? (reduceMotion ? { opacity: 0 } : { opacity: 0, x: 28 * stepDirection }) : false}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                              className="flex min-h-full flex-col"
                            >
                              {step === 'trial' && selected?.trialPeriod ? (
                                <TrialTimeline trial={selected.trialPeriod} showFrog={!isDesktop} />
                              ) : step === 'plans' ? (
                                <section className="flex flex-1 flex-col justify-center py-2">
                                  {!isDesktop ? <PlusEmblem /> : null}
                                  <h2 className="text-balance text-center text-[24px] font-black leading-[1.1] tracking-tight short:text-[21px] md:text-left md:text-[28px]">
                                    {selected?.trialDuration ? <>Choose a plan for<br /><span className="text-primary">after your free trial</span></> : 'Choose your plan'}
                                  </h2>
                                  <div className="mt-6 short:mt-4 [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:mt-4">
                                    <PlanPicker plan={plan} onSelect={selectPlan} pricing={pricing}
                                      pricingFailed={pricingFailed} busy={purchasing}
                                      onRetry={() => setPricingAttempt((attempt) => attempt + 1)} />
                                  </div>
                                  <PlanFooter plan={plan} selected={selected} busy={purchasing} onRestore={restorePurchases} />
                                </section>
                              ) : (
                                <>
                                  {!isDesktop ? <FrogHero context={paywallContext} /> : null}
                                  <div className={cn(isDesktop && 'flex flex-1 flex-col justify-center')}>
                                    <OfferBenefits context={paywallContext} onSeeAll={() => changeView('compare')} />
                                  </div>
                                </>
                              )}
                            </motion.div>
                          )}
                        </div>
                        <footer className={cn('relative shrink-0 bg-background px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 transition-shadow duration-200 md:px-7 md:pb-5', moreBelow ? 'shadow-[0_-1px_0_hsl(var(--border)),0_-10px_24px_-14px_rgba(15,23,42,0.35)]' : 'shadow-none')}>
                          <span aria-hidden className={cn('pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-background to-transparent transition-opacity duration-200', moreBelow ? 'opacity-100' : 'opacity-0')} />
                          {view === 'compare' ? (
                            <PrimaryButton onClick={() => { changeView('offer'); goStep(steps[1]); }} disabled={pricesPending} loading={pricesPending}>{ctaContent}</PrimaryButton>
                          ) : (
                            <>
                              <p aria-live="polite" role={purchaseError ? 'alert' : undefined} className={cn('mb-2 mt-2 truncate text-center text-xs font-bold', purchaseError ? 'text-red-200' : 'text-muted-foreground', selected && !selected.trialDuration && !purchaseError && 'short:hidden')}>
                                {purchaseError ?? (pricesPending ? '\u00a0' : caption)}
                              </p>
                              <PrimaryButton onClick={onPlans ? startPurchase : () => goStep(steps[Math.min(steps.length - 1, stepIndex + 1)])} disabled={purchasing || pricesPending || (onPlans && !selected)} loading={pricesPending} className={selected && !selected.trialDuration ? 'short:mt-2.5' : undefined}>
                                {ctaContent}
                              </PrimaryButton>
                            </>
                          )}
                          <button type="button" onClick={() => { markClose('continue_free'); onClose(); }} disabled={purchasing} className="mt-0.5 min-h-8 w-full rounded-xl text-center text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50">
                            Maybe later
                          </button>
                        </footer>
                      </div>
                    </div>
                  </div>

              <AnimatePresence>
                {needsAccount && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[10011] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
                    onClick={dismissAccountPrompt}
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
                        onClick={() => void linkGuestAccount('apple')}
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
                        onClick={() => void linkGuestAccount('google')}
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
                        onClick={() => {
                          trackAnalyticsEvent('paywall_account_result', { ...paywallProps(), status: 'email' });
                          window.location.assign('/login?upgrade=1');
                        }}
                        disabled={!!linking}
                        className="mt-2 h-10 w-full rounded-2xl text-sm font-bold text-slate-500 transition-colors hover:text-slate-700"
                      >
                        Use email instead
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
                </motion.div>
              </Dialog.Content>
            </>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


type ShowcaseItem = Pick<ItemDef, 'slot' | 'rarity' | 'riveIndex'>;
type ShowcaseLook = { indices: FrogStampIndices; rarity: Rarity };

const SHOWCASE_RARITIES: readonly Rarity[] = ['rare', 'epic', 'legendary'];
const LOOK_ROTATE_MS = 4000;

let liveShowcaseItems: ShowcaseItem[] | null = null;
let liveShowcaseRequest: Promise<ShowcaseItem[] | null> | null = null;

function loadLiveShowcaseItems() {
  liveShowcaseRequest ??= fetch('/api/skins/catalog')
    .then((res) => (res.ok ? res.json() : null))
    .then((payload: { items?: ShowcaseItem[] } | null) => {
      if (payload?.items?.length) liveShowcaseItems = payload.items;
      return liveShowcaseItems;
    })
    .catch(() => {
      liveShowcaseRequest = null;
      return null;
    });
  return liveShowcaseRequest;
}

type ShowcaseSlot = 'skin' | 'hat' | 'body' | 'hand_item';

const SHOWCASE_SLOTS: readonly ShowcaseSlot[] = ['skin', 'hat', 'body', 'hand_item'];

const SLOT_WEAR_CHANCE: Record<ShowcaseSlot, number> = {
  skin: 0.35,
  hat: 0.8,
  body: 0.55,
  hand_item: 0.6,
};

function shuffle<T>(list: T[]) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function createShowcaseDrawer(items: readonly ShowcaseItem[]) {
  const pools = Object.fromEntries(
    SHOWCASE_SLOTS.map((slot) => [
      slot,
      items.filter((item) => item.slot === slot && SHOWCASE_RARITIES.includes(item.rarity)),
    ]),
  ) as Record<ShowcaseSlot, ShowcaseItem[]>;
  const bags: Record<ShowcaseSlot, ShowcaseItem[]> = { skin: [], hat: [], body: [], hand_item: [] };
  const last: Partial<Record<ShowcaseSlot, ShowcaseItem>> = {};

  const draw = (slot: ShowcaseSlot) => {
    if (!pools[slot].length) return undefined;
    if (!bags[slot].length) {
      bags[slot] = shuffle([...pools[slot]]);
      const end = bags[slot].length - 1;
      if (end > 0 && bags[slot][end] === last[slot]) {
        [bags[slot][0], bags[slot][end]] = [bags[slot][end], bags[slot][0]];
      }
    }
    const item = bags[slot].pop();
    last[slot] = item;
    return item;
  };

  return (): ShowcaseLook | null => {
    const available = SHOWCASE_SLOTS.filter((slot) => pools[slot].length);
    if (!available.length) return null;
    let slots = available.filter((slot) => Math.random() < SLOT_WEAR_CHANCE[slot]);
    if (slots.length < 2) {
      slots = shuffle([...available]).slice(0, Math.min(2, available.length));
    }
    const indices: FrogStampIndices = { skin: 0, mood: 0, hat: 0, body: 0, hand_item: 0 };
    let rarity: Rarity = 'rare';
    for (const slot of slots) {
      const item = draw(slot);
      if (!item) continue;
      indices[slot] = item.riveIndex;
      if (rarityRank[item.rarity] > rarityRank[rarity]) rarity = item.rarity;
    }
    return { indices, rarity };
  };
}

const STATIC_SHOWCASE_ITEMS = CATALOG.filter((item) => item.slot !== 'skin');
const EMPTY_LOOK: ShowcaseLook = {
  indices: { skin: 0, mood: 0, hat: 0, body: 0, hand_item: 0 },
  rarity: 'rare',
};

function useShowcaseLook(rotating: boolean) {
  const drawRef = React.useRef<(() => ShowcaseLook | null) | null>(null);
  const [look, setLook] = useState<ShowcaseLook>(() => {
    drawRef.current = createShowcaseDrawer(liveShowcaseItems ?? STATIC_SHOWCASE_ITEMS);
    return drawRef.current() ?? EMPTY_LOOK;
  });
  const [tick, setTick] = useState(0);
  const rotatingRef = React.useRef(rotating);
  rotatingRef.current = rotating;

  useEffect(() => {
    if (liveShowcaseItems) return;
    let cancelled = false;
    void loadLiveShowcaseItems().then((items) => {
      if (cancelled || !items) return;
      drawRef.current = createShowcaseDrawer(items);
      if (!rotatingRef.current) {
        const next = drawRef.current();
        if (next) setLook(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!rotating) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const next = drawRef.current?.();
      if (!next) return;
      setLook(next);
      setTick((t) => t + 1);
    }, LOOK_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [rotating]);

  return { look, tick };
}


const CHEER_LINES = [
  'I feel so fancy!',
  'You work, I glow up!',
  'My fly loves it too!',
  'Can we keep this one?',
  'Double flies? Yes please!',
  'Next look, even cuter!',
  'Let’s make habits fun!',
  'Me + my fly = ready!',
];

/** One live frog changes outfits in place; no remount between looks or plan choices. */
function useLookHop(look: ShowcaseLook, dressed: boolean, reduceMotion: boolean) {
  const [shownLook, setShownLook] = useState(look);
  const hop = useAnimationControls();
  useEffect(() => {
    if (shownLook === look) return;
    if (!dressed || reduceMotion) {
      setShownLook(look);
      return;
    }
    void hop.start({
      scaleX: [1, 1.08, 0.96, 1],
      scaleY: [1, 0.9, 1.06, 1],
      y: [0, 3, -9, 0],
      transition: { duration: 0.55, times: [0, 0.2, 0.55, 1], ease: 'easeOut' },
    });
    const timer = window.setTimeout(() => setShownLook(look), 110);
    return () => window.clearTimeout(timer);
  }, [look, shownLook, dressed, reduceMotion, hop]);
  return { shownLook, hop };
}

const BAND_SPARKLES = [
  { className: 'left-[16%] top-[34%] h-3 w-3', delay: '0s' },
  { className: 'right-[18%] top-[26%] h-4 w-4', delay: '0.8s' },
  { className: 'left-[24%] top-[66%] h-2.5 w-2.5', delay: '1.5s' },
  { className: 'right-[13%] top-[60%] h-3 w-3', delay: '2.2s' },
  { className: 'left-[9%] top-[52%] h-2 w-2', delay: '2.8s' },
];

function Sparkle({ className, delay }: { className: string; delay: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={cn('absolute text-white opacity-0 motion-safe:animate-[plus-sparkle_2.8s_ease-in-out_infinite] motion-reduce:opacity-60', className)} style={{ animationDelay: delay }}>
      <path d="M8 0 9.8 6.2 16 8 9.8 9.8 8 16 6.2 9.8 0 8 6.2 6.2Z" fill="currentColor" />
    </svg>
  );
}

function FrogBand({ desktop = false }: { desktop?: boolean }) {
  const reduceMotion = useReducedMotion();
  const settled = useSettled(150);
  const [dressed, setDressed] = useState(false);
  const { look, tick } = useShowcaseLook(dressed && !reduceMotion);
  const { shownLook, hop } = useLookHop(look, dressed, !!reduceMotion);
  const size = desktop ? 354 : 236;
  const height = Math.round(size * 1.125);
  const lift = desktop ? 27 : 18;
  const hasHat = look.indices.hat !== 0;
  return (
    <>
      <span className={cn('absolute left-1/2 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.2),rgba(255,255,255,0.06)_55%,transparent)]', desktop ? 'bottom-[40px] h-[440px] w-[520px]' : '-bottom-6 h-[300px] w-[380px]')} />
      {BAND_SPARKLES.map((sparkle) => <Sparkle key={sparkle.delay} {...sparkle} />)}
      <div className={cn(
        'absolute left-1/2 z-20 w-max -translate-x-1/2',
        desktop
          ? cn('max-w-[80%]', hasHat ? 'bottom-[243px]' : 'bottom-[177px]')
          : cn('max-w-[min(78%,280px)]', hasHat ? 'bottom-[162px] short:bottom-[113px] [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:bottom-[143px]' : 'bottom-[118px] short:bottom-[83px] [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:bottom-[104px]'),
      )}>
        <AnimatePresence mode="wait" initial={false}>
          {dressed ? (
            <motion.div
              key={tick}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.7, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 440, damping: 24 }}
              className={cn('relative origin-bottom rounded-2xl bg-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.45)]', desktop ? 'px-4 py-2.5' : 'px-3.5 py-2')}
            >
              <p className={cn('text-center font-black leading-snug text-slate-900', desktop ? 'text-[16px]' : 'text-[14px] short:text-[13px]')}>{CHEER_LINES[tick % CHEER_LINES.length]}</p>
              <span className="absolute -bottom-1.5 left-1/2 -ml-[7px] h-3.5 w-3.5 rotate-45 rounded-[3px] bg-white" />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <div className={cn('absolute inset-0 origin-bottom', !desktop && 'short:scale-[0.7] [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:scale-[0.88]')}>
        <div className="absolute inset-0 motion-safe:animate-[plus-frog-float_3.6s_ease-in-out_infinite]">
          <motion.div animate={hop} className={cn('absolute left-1/2 origin-[50%_77%] transition-opacity duration-200 ease-out', dressed ? 'opacity-100' : 'opacity-0')} style={{ bottom: -Math.round(height * 0.2) + lift, width: size, height, marginLeft: -size / 2 }}>
            {settled ? (
              <Frog width={size} height={height} indices={shownLook.indices} visualOffsetY={-5}
                paused={!!reduceMotion} emote={reduceMotion ? null : 'love'}
                ignoreIdlePause onDressed={() => setDressed(true)} />
            ) : null}
            {dressed ? (
              <PremiumFrogAura
                show
                alwaysPlay
                paused={!!reduceMotion}
                flySize={desktop ? 68 : 52}
                className={desktop
                  ? '[--premium-fly-top:12%] [--premium-fly-x-max:132px] [--premium-fly-x-min:-214px] [--premium-fly-y-max:30px] [--premium-fly-y-min:-36px]'
                  : '[--premium-fly-top:12%] [--premium-fly-x-max:87px] [--premium-fly-x-min:-146px] [--premium-fly-y-max:20px] [--premium-fly-y-min:-24px]'}
              />
            ) : null}
          </motion.div>
        </div>
      </div>
    </>
  );
}

function FrogHero({ context }: { context: PaywallContext }) {
  return (
    <section className="flex flex-col items-center text-center">
      <div aria-hidden className="relative -mx-5 self-stretch overflow-hidden bg-[hsl(var(--plus-band))] pt-[calc(max(0.75rem,env(safe-area-inset-top))+52px)] [clip-path:polygon(0_0,100%_0,100%_100%,0_calc(100%_-_12px))] short:pt-[calc(max(0.75rem,env(safe-area-inset-top))+48px)]">
        <div className="relative h-[230px] short:h-[168px] [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:h-[205px]">
          <FrogBand />
        </div>
      </div>
      <h2 className="mt-2 text-balance text-[24px] font-black leading-[1.12] tracking-tight short:mt-1 short:text-[21px]">
        {context.headline}<br /><span className="text-primary">{context.accent}</span>
      </h2>
    </section>
  );
}

function DesktopHero({ context }: { context: PaywallContext }) {
  return (
    <section className="relative flex w-full flex-col overflow-hidden rounded-[28px] bg-[hsl(var(--plus-band))]">
      <h2 className="relative z-10 text-balance px-7 pt-7 text-[30px] font-black leading-[1.08] tracking-tight">
        {context.headline}<br /><span className="text-primary">{context.accent}</span>
      </h2>
      <div aria-hidden className="relative min-h-0 flex-1">
        <FrogBand desktop />
      </div>
    </section>
  );
}

const BENEFIT_BLOBS = [
  'rounded-[48%_52%_44%_56%/56%_47%_53%_44%]',
  'rounded-[56%_44%_53%_47%/46%_56%_44%_54%]',
  'rounded-[44%_56%_47%_53%/53%_44%_56%_47%]',
];

function OfferBenefits({ context, onSeeAll }: { context: PaywallContext; onSeeAll: () => void }) {
  const reduceMotion = useReducedMotion();
  const enter = (index: number) => reduceMotion ? {} : {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.12 + index * 0.05, duration: 0.32, ease: [0.22, 1, 0.36, 1] as const },
  };
  return (
    <>
      <ul className="mt-4 space-y-3 rounded-[24px] bg-card px-4 py-4 short:mt-3 short:space-y-2 short:py-3 md:mt-1 [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:mt-3 [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:space-y-2.5 [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:py-3.5">
        {context.benefits.map((benefit, index) => (
          <motion.li key={benefit.title} {...enter(index)} className="flex items-center gap-3.5">
            <motion.span
              initial={reduceMotion ? false : { scale: 0.4, rotate: -14 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 17, delay: 0.2 + index * 0.07 }}
              className={cn('flex h-12 w-[52px] shrink-0 items-center justify-center bg-amber-50 shadow-[0_3px_0_rgba(0,0,0,0.16)] short:h-10 short:w-11 [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:h-[46px] [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:w-[50px]', BENEFIT_BLOBS[index % BENEFIT_BLOBS.length])}
            >
              {benefit.icon === 'store' ? <span aria-hidden className="h-16 w-16 shrink-0 -translate-y-2"><GiftRive color={0} paused /></span> : <Icon name={benefit.icon} className="h-11 w-11 short:h-9 short:w-9 [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:h-10 [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:w-10" />}
            </motion.span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-[15px] font-black leading-tight md:text-[16px]">{benefit.title}</span>
              <span className="mt-0.5 block text-[13px] font-semibold leading-snug text-muted-foreground short:hidden">{benefit.body}</span>
            </span>
          </motion.li>
        ))}
      </ul>
      <motion.div {...enter(context.benefits.length)} className="mt-2 flex justify-center short:mt-1">
        <button type="button" onClick={onSeeAll} className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-[14px] font-black text-primary transition-colors hover:bg-white/10 active:bg-white/15 short:min-h-9">
          See everything in Plus
          <ChevronRight className="h-4 w-4" strokeWidth={2.75} aria-hidden />
        </button>
      </motion.div>
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
      className={cn('plus-upgrade-button relative isolate flex min-h-[52px] w-full touch-manipulation items-center justify-center overflow-hidden rounded-2xl bg-amber-400 px-4 [--plus-button-base:#d38a0c] py-3 text-[17px] font-black text-amber-950 hover:bg-amber-300 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none', loading && 'disabled:opacity-100', className)}>
      {!disabled ? (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-[40%] -z-10 w-[35%] bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 motion-safe:animate-[plus-cta-shine_4.2s_ease-in-out_1.2s_infinite]" />
      ) : null}
      {children}
    </button>
  );
}

function TrialTimeline({ trial, showFrog }: { trial: TrialPeriod; showFrog: boolean }) {
  const reduceMotion = useReducedMotion();
  const notifications = useNotificationStatus();
  const [start] = useState(() => new Date());
  const end = trialEndsAt(trial, start);
  const reminder = new Date(end.getTime() - TRIAL_REMINDER_LEAD_MS);
  const day = (date: Date) => date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const rows: Array<{ key: string; icon: React.ReactNode; title: string; body: string; active?: boolean; action?: React.ReactNode }> = [
    { key: 'today', icon: <Sparkles className="h-4 w-4" strokeWidth={2.75} />, title: 'Today', body: 'All of Plus unlocks. Nothing to pay today.', active: true },
  ];
  if (reminder.getTime() - start.getTime() >= 12 * 60 * 60 * 1000) {
    rows.push({
      key: 'reminder',
      icon: <Bell className="h-4 w-4" strokeWidth={2.75} />,
      title: day(reminder),
      body: notifications.isEnabled ? 'We’ll send you a reminder that your trial is ending.' : 'Turn on notifications to get a reminder before it ends.',
      action: !notifications.isEnabled && notifications.canEnable ? (
        <button type="button" onClick={() => void notifications.enableOrConfigure()} className="mt-1.5 inline-flex min-h-9 items-center rounded-xl bg-primary/10 px-3 text-[13px] font-black text-primary hover:bg-primary/15 active:scale-95">
          Turn on reminders
        </button>
      ) : null,
    });
  }
  rows.push({ key: 'end', icon: <Crown className="h-4 w-4" strokeWidth={2.75} />, title: day(end), body: 'Your Plus plan starts. Cancel before then and pay nothing.' });
  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col md:mx-0">
      <div className="flex flex-1 flex-col justify-center py-2">
      <h2 className="text-balance text-center text-[24px] font-black leading-[1.1] tracking-tight short:text-[21px] md:text-left md:text-[28px]">
        How your <span className="text-primary">free trial</span> works
      </h2>
      <ol className="mt-6 short:mt-4">
        {rows.map((row, index) => (
          <motion.li
            key={row.key}
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.1, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex gap-4 pb-6 last:pb-0 short:pb-4"
          >
            {index < rows.length - 1 ? (
              <span aria-hidden className={cn('absolute bottom-0 left-[19px] top-11 w-0.5 origin-top rounded-full motion-safe:animate-[plus-rail-draw_480ms_cubic-bezier(0.22,1,0.36,1)_both]', row.active ? 'bg-gradient-to-b from-amber-400 to-border' : 'bg-border')} style={{ animationDelay: `${260 + index * 100}ms` }} />
            ) : null}
            <span className={cn('relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full', row.active ? 'bg-amber-400 text-amber-950 shadow-[0_0_0_5px_rgba(251,191,36,0.22)]' : 'bg-primary/10 text-primary')}>
              {row.active ? <span aria-hidden className="absolute inset-0 rounded-full bg-amber-400/60 motion-safe:animate-[plus-halo_2.4s_cubic-bezier(0,0,0.2,1)_infinite]" /> : null}
              <span className="relative">{row.icon}</span>
            </span>
            <div className="min-w-0 pt-0.5 text-left">
              <p className="text-[16px] font-black leading-tight">{row.title}</p>
              <p className="mt-1 text-[14px] font-semibold leading-snug text-muted-foreground">{row.body}</p>
              {row.action}
            </div>
          </motion.li>
        ))}
      </ol>
      </div>
      {showFrog ? (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="mb-1 mt-4 shrink-0"
        >
          <TrialPromise />
        </motion.div>
      ) : null}
    </section>
  );
}

const PROMISE_LINES = [
  'I’ll remind you before it ends. Promise!',
  'No charge today. Just fun!',
  'My golden fly is already here!',
  'Cancel anytime. I won’t mind!',
  'Double flies start right now!',
  'Let’s make every day count!',
];
const PROMISE_ROTATE_MS = 3600;

function TrialPromise() {
  const reduceMotion = useReducedMotion();
  const settled = useSettled(880);
  const [dressed, setDressed] = useState(false);
  const [look] = useState(() => createShowcaseDrawer(liveShowcaseItems ?? STATIC_SHOWCASE_ITEMS)() ?? EMPTY_LOOK);
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (!dressed || reduceMotion) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setLine((current) => (current + 1) % PROMISE_LINES.length);
    }, PROMISE_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [dressed, reduceMotion]);
  const size = 168;
  const height = Math.round(size * 1.125);
  return (
    <div aria-hidden className="relative isolate flex h-[136px] items-end overflow-hidden rounded-[24px] bg-[linear-gradient(160deg,hsl(110_32%_46%)_0%,hsl(112_32%_41%)_100%)] pb-[22px] pl-[132px] pr-3.5 shadow-[0_12px_28px_-16px_rgba(0,0,0,0.45)] ring-1 ring-inset ring-white/15 short:h-[116px] short:pb-4 short:pl-[112px]">
      <span className="absolute -left-10 -bottom-12 -z-10 h-56 w-64 rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,0.24),rgba(255,255,255,0.06)_55%,transparent)]" />
      <Sparkle className="left-[30%] top-[16%] h-3 w-3" delay="0.3s" />
      <Sparkle className="left-[6%] top-[30%] h-2.5 w-2.5" delay="1.4s" />
      <Sparkle className="right-[8%] top-[18%] h-3 w-3" delay="2.1s" />
      <div className="absolute bottom-0 left-0 h-[136px] w-[132px] origin-bottom-left short:scale-[0.84]">
        <div className={cn('absolute left-1/2 transition-opacity duration-300 ease-out', dressed ? 'opacity-100' : 'opacity-0')} style={{ bottom: -Math.round(height * 0.2), width: size, height, marginLeft: -size / 2 }}>
          {settled ? (
            <Frog width={size} height={height} indices={look.indices} visualOffsetY={-5}
              paused={!!reduceMotion} emote={reduceMotion ? null : 'love'}
              ignoreIdlePause onDressed={() => setDressed(true)} />
          ) : null}
          {dressed ? <PremiumFrogAura show alwaysPlay paused={!!reduceMotion} flySize={40} className="[--premium-fly-top:12%] [--premium-fly-x-max:44px] [--premium-fly-x-min:-58px] [--premium-fly-y-max:18px] [--premium-fly-y-min:0px]" /> : null}
        </div>
      </div>
      <div className="relative flex min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          {dressed ? (
            <motion.div
              key={line}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -6, scale: 0.85 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, transition: { duration: 0.14 } }}
              transition={{ type: 'spring', stiffness: 440, damping: 26 }}
              className="relative w-fit max-w-full origin-bottom-left rounded-2xl bg-white px-3.5 py-2.5 shadow-[0_8px_18px_-8px_rgba(0,0,0,0.45)]"
            >
              <p className="text-[14px] font-black leading-snug text-slate-900">{PROMISE_LINES[line]}</p>
              <span className="absolute -left-1.5 bottom-3 h-3.5 w-3.5 rotate-45 rounded-[3px] bg-white" />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

const EMBLEM_RAYS_MASK = 'linear-gradient(to bottom, transparent 4%, black 34%), radial-gradient(160px 132px at 50% 50%, black 12%, rgba(0,0,0,0.55) 55%, transparent 100%)';
const EMBLEM_RAYS_STYLE: React.CSSProperties = {
  maskImage: EMBLEM_RAYS_MASK,
  WebkitMaskImage: EMBLEM_RAYS_MASK,
  maskComposite: 'intersect',
  WebkitMaskComposite: 'source-in',
};

const EMBLEM_SPARKLES = [
  { className: 'left-[24%] top-[14%] h-3.5 w-3.5', delay: '0s' },
  { className: 'right-[25%] top-[24%] h-2.5 w-2.5', delay: '0.9s' },
  { className: 'left-[31%] bottom-[18%] h-2.5 w-2.5', delay: '1.7s' },
  { className: 'right-[20%] bottom-[26%] h-4 w-4', delay: '2.4s' },
];

function PlusEmblem() {
  return (
    <div aria-hidden className="relative mb-3 flex h-[148px] w-full shrink-0 items-center justify-center short:mb-1 short:h-[100px] [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:mb-2 [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:h-[128px]">
      <span className="absolute left-1/2 top-1/2 h-[260px] w-[320px] -translate-x-1/2 -translate-y-1/2">
        <span
          className="absolute inset-0 motion-safe:animate-[plus-rays-in_900ms_cubic-bezier(0.22,1,0.36,1)_both]"
          style={EMBLEM_RAYS_STYLE}
        >
          <span className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2">
            <span className="block h-full w-full will-change-transform motion-safe:animate-[spin_28s_linear_infinite] [background:repeating-conic-gradient(from_0deg,rgba(255,240,190,0.3)_0deg_8deg,transparent_8deg_24deg)]" />
          </span>
        </span>
      </span>
      <span className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,236,170,0.4),transparent)]" />
      <span className="absolute bottom-1.5 left-1/2 -ml-8 h-2.5 w-16 rounded-full bg-black/20 blur-[3px] motion-safe:animate-[plus-emblem-shadow_3.6s_ease-in-out_0.56s_infinite] dark:bg-black/50 short:bottom-0" />
      <span className="relative motion-safe:animate-[plus-emblem-pop_560ms_cubic-bezier(0.34,1.56,0.64,1)_both]">
        <span className="block motion-safe:animate-[plus-emblem-float_3.6s_ease-in-out_0.56s_infinite]">
          <Icon name="frogPlus" className="h-[120px] w-[120px] drop-shadow-[0_5px_0_rgba(0,0,0,0.18)] short:h-[84px] short:w-[84px] [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:h-[104px] [@media(max-width:767px)_and_(min-height:701px)_and_(max-height:820px)]:w-[104px]" />
        </span>
      </span>
      {EMBLEM_SPARKLES.map((sparkle) => (
        <svg key={sparkle.delay} viewBox="0 0 16 16" className={cn('absolute text-amber-400 opacity-0 motion-safe:animate-[plus-sparkle_2.8s_ease-in-out_infinite] motion-reduce:opacity-100', sparkle.className)} style={{ animationDelay: sparkle.delay }}>
          <path d="M8 0 9.8 6.2 16 8 9.8 9.8 8 16 6.2 9.8 0 8 6.2 6.2Z" fill="currentColor" />
        </svg>
      ))}
    </div>
  );
}

function PlanPicker({ plan, onSelect, pricing, pricingFailed, busy, onRetry }: {
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
  const compareAt = monthly && savings >= 5 ? formatPlusPrice(monthly.amount * 12, monthly.currency) : null;
  const reduceMotion = useReducedMotion();
  return (
    <fieldset disabled={busy} className="min-w-0">
      <legend className="sr-only">Choose your plan</legend>
      <div className="grid grid-cols-1 gap-3">
        {(['yearly', 'monthly'] as const).map((id) => {
          const price = pricing?.[id];
          const unavailable = pricing !== null && !price;
          const selectedCard = plan === id;
          return (
            <motion.div
              key={id}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + (id === 'yearly' ? 0 : 0.07), duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            >
            <label className={cn(
              'relative flex cursor-pointer items-center gap-3.5 rounded-[20px] px-4 py-3.5 transition-[box-shadow,background-color,transform] duration-150 active:scale-[0.99] short:py-2.5',
              selectedCard
                ? 'bg-primary/[0.07] shadow-[inset_0_0_0_2px_hsl(var(--primary)),0_8px_18px_-12px_hsl(var(--primary)/0.7)]'
                : 'bg-card shadow-[inset_0_0_0_1.5px_hsl(var(--border)),0_2px_0_0_rgba(15,23,42,0.05)] hover:shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.45),0_2px_0_0_rgba(15,23,42,0.05)]',
              (unavailable || busy) && 'cursor-default opacity-60',
            )}>
              <input type="radio" name="plus-plan" value={id} checked={selectedCard} disabled={busy || unavailable} onChange={() => onSelect(id)} className="peer sr-only" />
              <span aria-hidden className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-[background-color,box-shadow] duration-150',
                selectedCard ? 'bg-primary text-primary-foreground shadow-[0_2px_0_rgba(15,23,42,0.15)]' : 'bg-background shadow-[inset_0_0_0_2px_hsl(var(--border))]',
              )}>
                {selectedCard ? <Check className="h-4 w-4 motion-safe:animate-[plus-chip-in_200ms_ease-out]" strokeWidth={3.5} /> : null}
              </span>
              <span className="pointer-events-none absolute inset-0 rounded-[20px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-black leading-tight text-muted-foreground">{id === 'yearly' ? 'Yearly' : 'Monthly'}</span>
                <span className="mt-1 flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
                  {id === 'yearly' && compareAt && price ? <s className="text-[13px] font-bold text-muted-foreground decoration-2">{compareAt}</s> : null}
                  <span className="text-[22px] font-black leading-none text-foreground [overflow-wrap:anywhere]">{price ? price.priceString : unavailable ? 'Unavailable' : '—'}</span>
                  {price ? <span className="text-[13px] font-bold text-muted-foreground">/{id === 'yearly' ? 'year' : 'month'}</span> : null}
                </span>
                {(id === 'yearly' && price?.pricePerMonthString) || price?.trialDuration ? (
                  <span className="mt-1.5 block text-[12.5px] font-bold leading-tight tabular-nums text-muted-foreground">
                    {id === 'yearly' && price?.pricePerMonthString ? `${price.pricePerMonthString}/month` : null}
                    {id === 'yearly' && price?.pricePerMonthString && price?.trialDuration ? ' · ' : null}
                    {price?.trialDuration ? <span className="text-primary">{price.trialDuration} free</span> : null}
                  </span>
                ) : null}
              </span>
              {id === 'yearly' && savings >= 5 ? (
                <span className="absolute -top-2.5 right-4 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-black leading-none text-amber-950 shadow-[0_2px_0_rgba(146,64,14,0.28)]">
                  Save {savings}%
                </span>
              ) : null}
            </label>
            </motion.div>
          );
        })}
      </div>
      {pricingFailed ? <p role="status" className="mt-2 text-xs text-muted-foreground">Couldn’t load store prices. <button type="button" onClick={onRetry} className="min-h-10 rounded-lg px-2 font-bold text-primary underline underline-offset-2">Try again</button></p> : null}
    </fieldset>
  );
}

function PlanFooter({ plan, selected, busy, onRestore }: {
  plan: PlanId;
  selected: PlusPriceInfo | undefined;
  busy: boolean;
  onRestore: () => void | Promise<void>;
}) {
  const isNative = Capacitor.isNativePlatform();
  const isIos = Capacitor.getPlatform() === 'ios';
  const period = plan === 'yearly' ? 'year' : 'month';
  return (
    <div className="mt-4 text-center short:mt-2.5">
      {selected ? (
        <p className="text-[11px] font-medium leading-snug text-muted-foreground" aria-live="polite">
          {selected.hasIntroPrice
            ? `Introductory offer shown at checkout; then ${selected.priceString}/${period}.`
            : `${selected.trialDuration ? `${selected.trialDuration} free, then ` : ''}${selected.priceString}/${period}.`}
          {' '}Renews automatically. Cancel anytime.
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 text-[10px] font-medium text-muted-foreground">
        {isNative ? <button type="button" disabled={busy} onClick={onRestore} className="min-h-8 rounded-lg underline underline-offset-2 hover:text-foreground">Restore purchases</button> : null}
        <a href={isIos ? APPLE_EULA_URL : TERMS_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center rounded-lg underline underline-offset-2 hover:text-foreground">{isIos ? 'Terms of Use' : 'Terms'}</a>
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center rounded-lg underline underline-offset-2 hover:text-foreground">Privacy</a>
      </div>
    </div>
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
    { label: 'Daily shop rerolls', free: 'With ads', plus: 'No ads' },
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
  return <span className={plus ? 'text-[13px] font-black text-amber-200' : ''}>{value}</span>;
}

function CompareView() {
  return (
    <div className="mx-auto w-full max-w-xl pb-4 pt-2">
      <h2 className="text-[26px] font-black leading-tight tracking-tight">Everything in Plus</h2>
      <p className="mt-1 text-sm font-medium text-muted-foreground">Your free experience stays. Plus adds these extras and supports our small team.</p>

      <div className="sticky top-0 z-10 -mx-1 mt-4 grid grid-cols-[minmax(0,1fr)_64px_84px] items-end bg-background px-1 pb-2 pt-2">
        <span />
        <span className="text-center text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">Free</span>
        <span className="flex flex-col items-center gap-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-200">
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
