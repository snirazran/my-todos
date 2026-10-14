'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from 'framer-motion';
import { mutate } from 'swr';
import { useNotification } from '@/components/providers/NotificationProvider';
import { Capacitor } from '@capacitor/core';
import { Icon } from '@/components/ui/Icon';
import { Check, ChevronLeft, ChevronRight, Loader2, ShieldAlert, X } from 'lucide-react';
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
  getPlusPricing,
  purchasePlus,
  restorePlusPurchases,
  type PlusPriceInfo,
} from '@/lib/purchases';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { mutateInventoryCaches } from '@/hooks/useInventory';
import { auth } from '@/lib/firebase';
import { getPlusContext, type PaywallContext } from '@/lib/plusPaywall';
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
import { RARITY_CONFIG } from '@/components/ui/gift-box/constants';
import { RotatingRays } from '@/components/ui/gift-box/RotatingRays';
import { HOME_CARD_SURFACE } from '@/components/ui/taskSurfaces';
import { cn } from '@/lib/utils';

type View = 'offer' | 'compare';
type PlanId = 'yearly' | 'monthly';

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
    setPricing(null);
    getPlusPricing()
      .then((prices) => {
        if (cancelled) return;
        setPricing(prices);
        setPricingFailed(!prices.yearly && !prices.monthly);
        setPlan((current) => prices[current] ? current : prices.yearly ? 'yearly' : 'monthly');
      })
      .catch((err) => {
        console.error('Could not read Plus prices from the store', err);
        if (!cancelled) setPricingFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, pricingAttempt]);

  useEffect(() => {
    if (open) {
      setView('offer');
      setPlan('yearly');
      setPurchasing(false);
      setPurchaseError(null);
      setNeedsAccount(false);
      setLinkError(null);
      trackAnalyticsEvent('paywall_viewed', { placement, variant: 'reward_first_v2' });
      trackAnalyticsEvent('paywall_step_viewed', { placement, step: 1, variant: 'reward_first_v2' });
    }
  }, [open, placement]);

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
      setNeedsAccount(false);
      void mutate(() => true);
      // Linking can change offer eligibility. Refresh before the user confirms.
      setPricingAttempt((attempt) => attempt + 1);
    } catch (err) {
      if (
        err instanceof GoogleAccountExistsError ||
        err instanceof AppleAccountExistsError
      ) {
        window.location.assign('/login?upgrade=1');
        return;
      }
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
    if (auth?.currentUser?.isAnonymous) {
      setNeedsAccount(true);
      return;
    }
    setPurchaseError(null);
    setPurchasing(true);
    try {
      const outcome = await purchasePlus(plan, placement);
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
      if (restored) {
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
    trackAnalyticsEvent('paywall_step_viewed', {
      placement, step: next === 'compare' ? 2 : 1, view: next, variant: 'reward_first_v2',
    });
  };

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
                    if (!linking) setNeedsAccount(false);
                  } else if (purchasing) event.preventDefault();
                }}
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
                    More rewards for your daily quests, more gift prizes, and support for your streak.
                    Choose a subscription below. Prices and eligible offers come from your store.
                  </Dialog.Description>
                  <div inert={needsAccount || undefined} className="flex min-h-0 flex-1 flex-col">
                    <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] short:pb-1 md:px-7 md:pt-4">
                      {view === 'compare' ? (
                        <button type="button" onClick={() => changeView('offer')} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl pr-3 text-sm font-bold hover:bg-muted">
                          <ChevronLeft className="h-5 w-5" aria-hidden /> Back to plans
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-base font-black tracking-tight">
                          <Icon name="frogPlus" className="h-10 w-10 drop-shadow-[0_2px_0_rgba(52,99,31,0.2)]" />
                          Frogress <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] tracking-wide text-amber-950">PLUS</span>
                        </span>
                      )}
                      <Dialog.Close asChild>
                        <button type="button" disabled={purchasing} aria-label="Close Plus" className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-[background-color,transform] hover:bg-muted/70 active:scale-90 disabled:opacity-50">
                          <X className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                        </button>
                      </Dialog.Close>
                    </header>

                    <div className="flex min-h-0 flex-1">
                      {isDesktop && view === 'offer' ? (
                        <div className="flex w-[43%] shrink-0 p-4 pr-0 pt-1">
                          <OfferHero context={paywallContext} desktop />
                        </div>
                      ) : null}
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <div ref={bindScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 [scrollbar-gutter:stable] md:px-7">
                          {view === 'compare' ? <CompareView /> : (
                            <>
                              {!isDesktop ? <OfferHero context={paywallContext} /> : null}
                              <OfferBenefits context={paywallContext} onSeeAll={() => changeView('compare')} />
                            </>
                          )}
                        </div>
                        <footer className={cn('relative shrink-0 bg-background px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 transition-shadow duration-200 md:px-7 md:pb-5', moreBelow ? 'shadow-[0_-1px_0_hsl(var(--border)),0_-10px_24px_-14px_rgba(15,23,42,0.35)]' : 'shadow-none')}>
                          <span aria-hidden className={cn('pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-background to-transparent transition-opacity duration-200', moreBelow ? 'opacity-100' : 'opacity-0')} />
                          {view === 'compare' ? (
                            <PrimaryButton onClick={() => changeView('offer')}>Choose your plan</PrimaryButton>
                          ) : (
                            <>
                              <PlanPicker plan={plan} onSelect={setPlan} pricing={pricing}
                                pricingFailed={pricingFailed} busy={purchasing}
                                onRetry={() => setPricingAttempt((attempt) => attempt + 1)} />
                              <p aria-live="polite" className={cn('mb-2 mt-2 text-center text-xs font-bold text-muted-foreground', selected && !selected.trialDuration && 'short:hidden')}>
                                {selected
                                  ? selected.trialDuration ? `${selected.trialDuration} free · No charge today` : 'Cancel anytime'
                                  : pricingFailed ? 'Store prices are unavailable right now' : 'Checking your store’s prices and offers…'}
                              </p>
                              <PrimaryButton onClick={startPurchase} disabled={purchasing || !selected} className={selected && !selected.trialDuration ? 'short:mt-2.5' : undefined}>
                                {purchasing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Processing…</>
                                  : selected?.trialDuration ? 'Start my free trial' : 'Get Plus'}
                              </PrimaryButton>
                              <PlanFooter plan={plan} selected={selected} busy={purchasing} error={purchaseError} onRestore={restorePurchases} />
                            </>
                          )}
                          <button type="button" onClick={onClose} disabled={purchasing} className="mt-0.5 min-h-8 w-full rounded-xl text-center text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50">
                            Continue free
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
                    onClick={() => setNeedsAccount(false)}
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
                        onClick={() =>
                          window.location.assign('/login?upgrade=1')
                        }
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
const STAGE_TINT: Partial<Record<Rarity, string>> = {
  rare: 'from-sky-200 via-sky-100 to-sky-50 dark:from-sky-800/50 dark:via-sky-900/40 dark:to-sky-950/30',
  epic: 'from-violet-200 via-violet-100 to-violet-50 dark:from-violet-800/50 dark:via-violet-900/40 dark:to-violet-950/30',
  legendary: 'from-amber-200 via-amber-100 to-amber-50 dark:from-amber-700/40 dark:via-amber-900/35 dark:to-amber-950/30',
};
const LOOK_ROTATE_MS = 4000;
const SPARKLE_ANGLES = [-150, -105, -60, -20, 200, 245];

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


/** One live frog changes outfits in place; no remount between looks or plan choices. */
function LookStage({ desktop }: { desktop?: boolean }) {
  const reduceMotion = useReducedMotion();
  const settled = useSettled();
  const [dressed, setDressed] = useState(false);
  const { look, tick } = useShowcaseLook(dressed && !reduceMotion);
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
  const size = desktop ? 330 : 200;
  const height = Math.round(size * 1.125);
  const rarity = RARITY_CONFIG[shownLook.rarity];
  const sparkleColor = shownLook.rarity === 'legendary' ? '#f59e0b' : shownLook.rarity === 'epic' ? '#a78bfa' : '#38bdf8';
  return (
    <div
      aria-hidden
      className={cn(
        'relative isolate w-full overflow-hidden rounded-[24px] ring-1 ring-inset ring-black/[0.05] dark:ring-white/10',
        desktop ? 'min-h-[300px] flex-1' : 'h-[160px] short:h-[96px]',
      )}
    >
      {SHOWCASE_RARITIES.map((id) => (
        <span
          key={id}
          className={cn(
            'absolute inset-0 -z-10 bg-gradient-to-b transition-opacity duration-700 ease-out',
            STAGE_TINT[id],
            id === shownLook.rarity ? 'opacity-100' : 'opacity-0',
          )}
        />
      ))}
      <div
        className="absolute inset-x-0 -bottom-1/2 top-0 -z-10 opacity-70 motion-reduce:hidden"
        style={{
          maskImage: 'radial-gradient(circle at center, black 45%, transparent 95%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black 45%, transparent 95%)',
        }}
      >
        <RotatingRays colorClass={rarity.rays} masked={false} size={desktop ? '720px' : '480px'} />
      </div>
      <span className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-[radial-gradient(ellipse_at_50%_100%,rgba(255,255,255,0.75),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_50%_100%,rgba(255,255,255,0.1),transparent_70%)]" />
      <span
        key={shownLook.rarity}
        className={cn(
          'absolute left-3 top-3 rounded-full px-2 py-1 text-[11px] font-black leading-none ring-1 ring-inset ring-black/5 motion-safe:animate-[plus-chip-in_320ms_cubic-bezier(0.2,0.25,0.15,1)]',
          rarity.bg,
          rarity.text,
        )}
      >
        {rarity.label} look
      </span>
      <div className="absolute inset-0 origin-bottom short:scale-[0.7]">
      <motion.div
        animate={hop}
        className={cn('absolute left-1/2 origin-[50%_77%]', dressed ? '' : 'invisible')}
        style={{ bottom: -Math.round(height * 0.2), width: size, height, marginLeft: -size / 2 }}
      >
        {settled ? (
          <Frog width={size} height={height} indices={shownLook.indices} visualOffsetY={-5}
            paused={!!reduceMotion} emote={reduceMotion ? null : 'love'}
            ignoreIdlePause onDressed={() => setDressed(true)} />
        ) : null}
        {dressed ? <PremiumFrogAura show alwaysPlay paused={!!reduceMotion} flySize={desktop ? 54 : 40} /> : null}
      </motion.div>
      </div>
      {!reduceMotion && tick > 0 ? (
        <span key={tick} className="pointer-events-none absolute inset-0">
          {SPARKLE_ANGLES.map((angle, i) => {
            const rad = angle * Math.PI / 180;
            const distance = size * (0.36 + (i % 2) * 0.08);
            return <motion.span key={angle}
              className="absolute left-1/2 top-[62%] h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: sparkleColor, boxShadow: `0 0 8px ${sparkleColor}` }}
              initial={{ x: -3, y: -3, scale: 0, opacity: 0 }}
              animate={{ x: Math.cos(rad) * distance - 3, y: Math.sin(rad) * distance * 0.7 - 3, scale: [0, 1.1, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 0.7, delay: 0.08 + i * 0.02, ease: 'easeOut' }} />;
          })}
        </span>
      ) : null}
    </div>
  );
}

function OfferHero({ context, desktop = false }: {
  context: PaywallContext;
  desktop?: boolean;
}) {
  return (
    <section className={cn('flex w-full flex-col items-center text-center', desktop ? 'pb-1' : 'pt-1')}>
      <h2 className={cn('text-balance font-black leading-[1.1] tracking-tight', desktop ? 'mt-3 text-[30px]' : 'text-[24px] short:text-[21px]')}>
        {context.headline}<br /><span className="text-primary">{context.accent}</span>
      </h2>
      {desktop ? (
        <p className="mt-2 max-w-[22rem] text-pretty text-[15px] font-semibold leading-snug text-muted-foreground">{context.sub}</p>
      ) : null}
      <div className={cn('flex w-full', desktop ? 'mt-5 min-h-0 flex-1' : 'mt-3 short:mt-2')}>
        <LookStage desktop={desktop} />
      </div>
    </section>
  );
}

function OfferBenefits({ context, onSeeAll }: { context: PaywallContext; onSeeAll: () => void }) {
  return (
    <ul className={cn('mb-3 mt-3 overflow-hidden short:mb-2 short:mt-2 md:mt-1', HOME_CARD_SURFACE)}>
      {context.benefits.map((benefit, index) => (
        <li key={benefit.title} className="relative flex items-center gap-3 px-3.5 py-2 short:py-1.5 md:py-2.5">
          {index > 0 ? <span aria-hidden className="absolute inset-x-3.5 top-0 h-px bg-border/70" /> : null}
          <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl short:h-9 short:w-9 short:rounded-xl', index === 0 ? 'bg-amber-100 dark:bg-amber-400/15' : 'bg-primary/10')}>
            {benefit.icon === 'store' ? <span aria-hidden className="h-14 w-14 shrink-0 -translate-y-2"><GiftRive color={0} paused /></span> : <Icon name={benefit.icon} className="h-7 w-7" />}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-[15px] font-black leading-tight md:text-[16px]">{benefit.title}</span>
            <span className="mt-0.5 block text-[13px] font-semibold leading-snug text-muted-foreground short:hidden">{benefit.body}</span>
          </span>
        </li>
      ))}
      <li className="relative">
        <span aria-hidden className="absolute inset-x-3.5 top-0 h-px bg-border/70" />
        <button type="button" onClick={onSeeAll} className="flex min-h-11 w-full short:min-h-9 items-center justify-between px-3.5 text-[14px] font-black text-primary transition-colors hover:bg-primary/[0.06] active:bg-primary/10">
          See everything in Plus
          <ChevronRight className="h-4 w-4" strokeWidth={2.75} aria-hidden />
        </button>
      </li>
    </ul>
  );
}

function PrimaryButton({ onClick, children, disabled, className }: {
  onClick: () => void | Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn('plus-upgrade-button flex min-h-[52px] w-full touch-manipulation items-center justify-center rounded-2xl bg-amber-400 px-4 [--plus-button-base:#d38a0c] py-3 text-[17px] font-black text-amber-950 hover:bg-amber-300 disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none', className)}>
      {children}
    </button>
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
  return (
    <fieldset disabled={busy} className="min-w-0">
      <legend className="sr-only">Choose your plan</legend>
      <div className="grid grid-cols-2 gap-2">
        {(['yearly', 'monthly'] as const).map((id) => {
          const price = pricing?.[id];
          const unavailable = pricing !== null && !price;
          return (
            <label key={id} className={`relative flex min-h-[68px] short:min-h-[60px] short:py-2 cursor-pointer items-start gap-2.5 rounded-[18px] bg-card px-3 py-2.5 transition-[box-shadow,background-color] duration-150 ${plan === id ? 'bg-primary/[0.06] shadow-[inset_0_0_0_2px_hsl(var(--primary))]' : 'shadow-[inset_0_0_0_1px_hsl(var(--border)),0_2px_0_0_rgba(15,23,42,0.05)] hover:shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.4),0_2px_0_0_rgba(15,23,42,0.05)]'} ${unavailable || busy ? 'cursor-default opacity-60' : ''}`}>
              <input type="radio" name="plus-plan" value={id} checked={plan === id} disabled={busy || unavailable} onChange={() => onSelect(id)} className="peer sr-only" />
              <span aria-hidden className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-colors ${plan === id ? 'bg-primary text-primary-foreground' : 'shadow-[inset_0_0_0_2px_hsl(var(--border))]'}`}>
                {plan === id ? <Check className="h-3 w-3" strokeWidth={4} /> : null}
              </span>
              <span className="pointer-events-none absolute inset-0 rounded-[18px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] font-black text-muted-foreground">
                  {id === 'yearly' ? 'Yearly' : 'Monthly'}
                  {id === 'yearly' && savings >= 5 ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] leading-none text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">Save {savings}%</span> : null}
                </span>
                <span className="mt-0.5 block text-[17px] font-black leading-tight tabular-nums text-foreground [overflow-wrap:anywhere]">
                  {price ? <>{price.priceString}<span className="text-[12px] font-bold text-muted-foreground">/{id === 'yearly' ? 'year' : 'month'}</span></> : unavailable ? 'Unavailable' : '—'}
                </span>
                {id === 'yearly' && price?.pricePerMonthString ? (
                  <span className="mt-0.5 block text-[11px] font-bold tabular-nums text-muted-foreground">
                    {price.pricePerMonthString}/month
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {pricingFailed ? <p role="status" className="mt-2 text-xs text-muted-foreground">Couldn’t load store prices. <button type="button" onClick={onRetry} className="min-h-10 rounded-lg px-2 font-bold text-primary underline underline-offset-2">Try again</button></p> : null}
    </fieldset>
  );
}

function PlanFooter({ plan, selected, busy, error, onRestore }: {
  plan: PlanId;
  selected: PlusPriceInfo | undefined;
  busy: boolean;
  error: string | null;
  onRestore: () => void | Promise<void>;
}) {
  const isNative = Capacitor.isNativePlatform();
  const isIos = Capacitor.getPlatform() === 'ios';
  const period = plan === 'yearly' ? 'year' : 'month';
  return (
    <div className="mt-2.5 text-center">
      {error ? <p className="mb-2 text-xs font-bold text-red-600 dark:text-red-400" role="alert">{error}</p> : null}
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
  { title: 'Planning', icon: 'planner', rows: [
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
  return <span className={plus ? 'text-[13px] font-black text-amber-800 dark:text-amber-300' : ''}>{value}</span>;
}

function CompareView() {
  return (
    <div className="mx-auto w-full max-w-xl pb-4 pt-2">
      <h2 className="text-[26px] font-black leading-tight tracking-tight">Everything in Plus</h2>
      <p className="mt-1 text-sm font-medium text-muted-foreground">Your free experience stays. Plus adds these extras and supports our small team.</p>

      <div className="sticky top-0 z-10 -mx-1 mt-4 grid grid-cols-[minmax(0,1fr)_64px_84px] items-end bg-background px-1 pb-2 pt-2">
        <span />
        <span className="text-center text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">Free</span>
        <span className="flex flex-col items-center gap-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-800 dark:text-amber-300">
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
                    <td className="bg-amber-50 px-1 py-3 text-center tabular-nums dark:bg-amber-400/10"><CompareValue value={row.plus} plus /></td>
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
