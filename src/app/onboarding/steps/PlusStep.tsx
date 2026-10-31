'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, Crown } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import Frog, { type FrogEmote, type FrogHandle } from '@/components/ui/frog';
import { Icon } from '@/components/ui/Icon';
import { PremiumFrogAura } from '@/components/ui/PremiumFrogAura';
import {
  APPLE_EULA_URL,
  PRIVACY_URL,
  PlusAccountPrompt,
  TERMS_URL,
  usePlusPaywall,
} from '@/components/ui/PlusUpgradeModal';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNotificationStatus } from '@/hooks/useNotificationStatus';
import type { PlusPriceInfo } from '@/lib/purchases';
import {
  ONBOARDING_PLUS_OFFERING,
  TRIAL_REMINDER_LEAD_MS,
  trialEndsAt,
  trialReminderPush,
  type TrialPeriod,
} from '@/lib/plusPaywall';
import { DEFAULT_BACKGROUND_IMAGES } from '@/lib/backgrounds/constants';
import { cn } from '@/lib/utils';
import type { WardrobeSlot } from '@/components/ui/frog';
import { ONBOARDING_SPLIT_BAR_CLASS, ONBOARDING_SPLIT_STEP_CLASS } from './OnboardingFrogHeader';
import { OnboardingTopBar } from './OnboardingTopBar';
import { OnboardingButton, OnboardingFooter } from './OnboardingFooter';

type Page = 'free' | 'reminder' | 'discount' | 'checkout';

const EASE = [0.22, 1, 0.36, 1] as const;
const DAY_MS = 24 * 60 * 60 * 1000;
const LEAD_DAYS = Math.round(TRIAL_REMINDER_LEAD_MS / DAY_MS);
const SEAT_LIFT = 72;

const PAGE_EMOTE: Record<Page, FrogEmote> = {
  free: 'loveBurst',
  reminder: 'loveShy',
  discount: 'tada',
  checkout: 'celebrate',
};

const PAGE_LOOK: Record<Page, string[]> = {
  free: [],
  reminder: ['3025', '2016', '4004'],
  discount: ['1022', '3026'],
  checkout: ['1005', '3024', '4005'],
};

type CatalogItem = { id: string | number; slot: string; riveIndex: number };

let catalogRequest: Promise<CatalogItem[]> | null = null;

function loadCatalog() {
  catalogRequest ??= fetch('/api/skins/catalog')
    .then((res) => (res.ok ? res.json() : null))
    .then((payload: { items?: CatalogItem[] } | null) => payload?.items ?? [])
    .catch(() => {
      catalogRequest = null;
      return [];
    });
  return catalogRequest;
}

const LOOK_SLOTS: readonly WardrobeSlot[] = ['hat', 'body', 'hand_item'];

function pageLook(
  page: Page,
  catalog: readonly CatalogItem[],
  base: Partial<Record<WardrobeSlot, number>> | undefined,
) {
  const look: Partial<Record<WardrobeSlot, number>> = { ...base };
  if (!catalog.length || !PAGE_LOOK[page].length) return look;
  LOOK_SLOTS.forEach((slot) => {
    look[slot] = 0;
  });
  PAGE_LOOK[page].forEach((id) => {
    const item = catalog.find((entry) => String(entry.id) === id);
    if (item && (item.slot === 'skin' || (LOOK_SLOTS as readonly string[]).includes(item.slot))) {
      look[item.slot as WardrobeSlot] = item.riveIndex;
    }
  });
  return look;
}

const SPARKLES = [
  { className: '-left-6 top-0 h-3.5 w-3.5', delay: '0s' },
  { className: '-right-7 -top-2 h-4 w-4', delay: '0.9s' },
  { className: '-right-4 bottom-[-8px] h-3 w-3', delay: '1.7s' },
];

const UNIT = { D: 'day', W: 'week', M: 'month', Y: 'year' } as const;

const shortDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const longDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

function trialDates(trial: TrialPeriod, start: Date) {
  const end = trialEndsAt(trial, start);
  const reminder = new Date(end.getTime() - TRIAL_REMINDER_LEAD_MS);
  const dayCount = (date: Date) => Math.round((date.getTime() - start.getTime()) / DAY_MS);
  const label = (date: Date) => (dayCount(end) <= 31 ? `Day ${dayCount(date)}` : shortDate(date));
  return {
    end,
    reminder,
    hasReminder: reminder.getTime() - start.getTime() >= 12 * 60 * 60 * 1000,
    label,
  };
}

function savePercent(price: PlusPriceInfo | undefined) {
  if (!price?.regular) return 0;
  const save = Math.round((1 - price.amount / price.regular.amount) * 100);
  return save >= 5 ? save : 0;
}

function Sparkles() {
  return (
    <>
      {SPARKLES.map((sparkle) => (
        <svg
          key={sparkle.delay}
          aria-hidden
          viewBox="0 0 16 16"
          className={cn(
            'pointer-events-none absolute text-amber-400 opacity-0 motion-safe:animate-[vault-twinkle_2.6s_ease-in-out_infinite] motion-reduce:opacity-70',
            sparkle.className,
          )}
          style={{ animationDelay: sparkle.delay }}
        >
          <path fill="currentColor" d="M8 0c.6 4.4 3.6 7.4 8 8-4.4.6-7.4 3.6-8 8-.6-4.4-3.6-7.4-8-8 4.4-.6 7.4-3.6 8-8z" />
        </svg>
      ))}
    </>
  );
}

function PlusBar() {
  return (
    <span className="relative inline-flex items-center">
      <span className="relative inline-flex items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#fef3c7_0%,#fcd34d_38%,#f59e0b_100%)] py-3.5 pl-[80px] pr-12 shadow-[0_5px_0_0_#c47a0a,0_16px_30px_-14px_rgba(217,119,6,0.7),inset_0_1px_0_rgba(255,255,255,0.85)] ring-1 ring-amber-500/40 short:py-3 lg:py-4 lg:pl-[94px] lg:pr-14">
        <span className="text-[15px] font-black uppercase leading-6 tracking-[0.18em] text-amber-950 lg:text-[17px]">
          Frogress Plus
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-[40%] w-[30%] bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 motion-safe:animate-[plus-cta-shine_3.6s_ease-in-out_0.6s_infinite]"
        />
      </span>
      <span
        aria-hidden
        className="absolute -left-4 -top-[15px] drop-shadow-[0_4px_6px_rgba(146,64,14,0.35)] short:-top-[17px] lg:-left-5 lg:-top-5"
      >
        <Icon name="frogPlus" className="h-[74px] w-[74px] -rotate-[14deg] lg:h-[86px] lg:w-[86px]" />
      </span>
      <Sparkles />
    </span>
  );
}

function ReminderPhone({ date, renewDate, action }: { date: Date; renewDate: Date; action: ReactNode }) {
  const push = trialReminderPush(`in ${LEAD_DAYS} days`, longDate(renewDate));
  return (
    <div className="flex w-full flex-col items-center">
      <div className="w-full max-w-[318px] [-webkit-mask-image:linear-gradient(to_bottom,#000_80%,transparent)] [mask-image:linear-gradient(to_bottom,#000_80%,transparent)] lg:max-w-[340px]">
        <div className="rounded-t-[46px] bg-zinc-900 p-[7px] pb-0 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.6)] ring-1 ring-black/10 dark:bg-zinc-800">
          <div className="relative h-[244px] overflow-hidden rounded-t-[39px] font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Text',system-ui,sans-serif] short:h-[214px] lg:h-[258px]">
            <img
              src={DEFAULT_BACKGROUND_IMAGES.mobile}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-[50%_30%]"
            />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/5 to-black/20" />
            <div className="relative flex flex-col items-center px-2.5 pt-7 text-white short:pt-5">
              <span className="text-[14px] font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
                {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
              <span className="text-[62px] font-bold leading-[1.05] tracking-[-0.01em] drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)] short:text-[52px]">
                9:41
              </span>
              <motion.div
                initial={{ opacity: 0, y: 14, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.45, type: 'spring', stiffness: 380, damping: 26 }}
                className="mt-3 flex w-full items-start gap-2.5 rounded-[20px] bg-white/80 p-2.5 text-left shadow-[0_10px_24px_-12px_rgba(0,0,0,0.5)] backdrop-blur-md short:mt-2"
              >
                <img src="/frogress-icon.png" alt="" className="h-[38px] w-[38px] shrink-0 rounded-[9px]" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold leading-tight text-zinc-900">{push.title}</span>
                    <span className="shrink-0 text-[11.5px] font-medium text-zinc-500">now</span>
                  </div>
                  <p className="mt-0.5 line-clamp-3 text-[13px] leading-[1.28] text-zinc-800">{push.body}</p>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
      {action}
    </div>
  );
}

function OfferTicket({ percent }: { percent: number }) {
  return (
    <span className="relative inline-flex drop-shadow-[0_5px_0_#c47a0a]">
      <span className="relative flex items-center gap-3 overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#fef3c7_0%,#fcd34d_42%,#f59e0b_100%)] px-9 py-3.5 [-webkit-mask:radial-gradient(circle_12px_at_0_50%,transparent_96%,#000),radial-gradient(circle_12px_at_100%_50%,transparent_96%,#000)] [-webkit-mask-composite:source-in] [mask-composite:intersect] [mask:radial-gradient(circle_12px_at_0_50%,transparent_96%,#000),radial-gradient(circle_12px_at_100%_50%,transparent_96%,#000)] short:py-3">
        <span aria-hidden className="pointer-events-none absolute inset-[7px] rounded-[16px] border-2 border-dashed border-amber-800/25" />
        <span className="text-[54px] font-black leading-none tracking-tight text-amber-950 short:text-[46px]">
          {percent}%
        </span>
        <span className="flex flex-col items-start">
          <span className="text-[26px] font-black leading-none text-amber-950 short:text-[22px]">OFF</span>
          <span className="mt-1.5 text-[10.5px] font-black uppercase tracking-[0.14em] text-amber-900/75">
            Plus yearly
          </span>
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-[40%] w-[30%] bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 motion-safe:animate-[plus-cta-shine_3.6s_ease-in-out_0.8s_infinite]"
        />
      </span>
      <Sparkles />
    </span>
  );
}

function LockOpenSolid() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" fill="currentColor" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

function OfferTimeline({
  trial,
  start,
  price,
  remindersOn,
  action,
}: {
  trial: TrialPeriod;
  start: Date;
  price: string | null;
  remindersOn: boolean;
  action: ReactNode;
}) {
  const { end, reminder, hasReminder, label } = trialDates(trial, start);
  const rows: Array<{ key: string; icon: ReactNode; title: string; date?: string; body: string; action?: ReactNode }> = [
    {
      key: 'today',
      icon: <LockOpenSolid />,
      title: 'Today',
      body: 'Get instant access and see how it changes your life.',
    },
  ];
  if (hasReminder) {
    rows.push({
      key: 'reminder',
      icon: <Bell className="h-4 w-4" fill="currentColor" strokeWidth={2.5} />,
      title: label(reminder),
      date: shortDate(reminder),
      body: remindersOn
        ? 'We’ll remind you with a notification that your trial is ending.'
        : 'Get a heads-up before it ends.',
      action,
    });
  }
  rows.push({
    key: 'end',
    icon: <Crown className="h-4 w-4" fill="currentColor" strokeWidth={2.5} />,
    title: label(end),
    date: shortDate(end),
    body: price ? `You’ll be charged ${price}. Cancel anytime before.` : 'Plus starts. Cancel anytime before.',
  });
  return (
    <ol className="relative pb-14">
      {rows.map((row, index) => {
        const last = index === rows.length - 1;
        return (
          <li key={row.key} className="relative flex gap-4 pb-7 last:pb-0 short:pb-4 lg:short-screen:pb-4">
            {last ? (
              <span
                aria-hidden
                className="absolute left-0 top-[18px] h-[96px] w-7 bg-gradient-to-b from-amber-300 via-amber-200/60 to-transparent dark:from-amber-400/70 dark:via-amber-400/25"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'absolute left-0 top-0 w-7 bg-[#447d3f]',
                index === 0 && 'rounded-t-full',
                last ? 'h-[36px] rounded-b-full' : '-bottom-px',
              )}
            />
            <span className="relative grid h-[34px] w-7 shrink-0 place-items-center text-white">{row.icon}</span>
            <div className="min-w-0 flex-1 pt-1.5 text-left">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[17px] font-extrabold leading-[22px] text-foreground short:text-[16px]">
                  {row.title}
                  {row.date && row.date !== row.title ? (
                    <span className="font-semibold text-muted-foreground"> · {row.date}</span>
                  ) : null}
                </p>
                {row.action}
              </div>
              <p className="mt-1 text-pretty text-[14.5px] font-medium leading-[1.42] text-foreground/65 short:text-[13.5px]">
                {row.body}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

type Props = {
  frogName: string;
  indices?: Partial<Record<WardrobeSlot, number>>;
  onDone: () => void;
};

export default function PlusStep({ frogName, indices, onDone }: Props) {
  const {
    mounted,
    plan,
    purchasing,
    purchaseError,
    needsAccount,
    linking,
    linkError,
    pricingFailed,
    reduceMotion,
    setPricingAttempt,
    markClose,
    markStep,
    dismissAccountPrompt,
    linkGuestAccount,
    continueWithEmail,
    startPurchase,
    restorePurchases,
    selected,
    paywallContext,
    pricesPending,
  } = usePlusPaywall({
    open: true,
    onClose: onDone,
    placement: 'onboarding',
    frogName,
    offering: ONBOARDING_PLUS_OFFERING,
    variant: 'onboarding_offer_v1',
  });
  const notifications = useNotificationStatus();
  const frogRef = useRef<FrogHandle>(null);
  const shortScreen = useMediaQuery('(max-width: 767px) and (max-height: 700px)');
  const desktop = useMediaQuery('(min-width: 1024px)');
  const frogHeight = desktop ? 315 : shortScreen ? 176 : 216;
  const frogWidth = Math.round((frogHeight * 128) / 144);
  const [start] = useState(() => new Date());
  const [page, setPage] = useState<Page>('free');
  const [direction, setDirection] = useState(1);
  const firstPage = useRef(true);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    if (!desktop) return;
    const update = () => setViewportHeight(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [desktop]);

  useEffect(() => {
    let cancelled = false;
    void loadCatalog().then((items) => {
      if (!cancelled) setCatalog(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBodyHeight(el.clientHeight));
    observer.observe(el);
    setBodyHeight(el.clientHeight);
    return () => observer.disconnect();
  }, [mounted]);

  const trial = selected?.trialPeriod ?? null;
  const dates = trial ? trialDates(trial, start) : null;
  const canRemind = notifications.isEnabled || notifications.canEnable;
  const save = savePercent(selected);
  const pages: Page[] = [
    'free',
    ...(dates?.hasReminder && canRemind ? (['reminder'] as const) : []),
    ...(save ? (['discount'] as const) : []),
    'checkout',
  ];
  const index = Math.max(0, pages.indexOf(page));
  const checkout = page === 'checkout';
  const period = plan === 'yearly' ? 'year' : 'month';
  const trialDuration = selected?.trialDuration ?? null;
  const pricesReady = !pricesPending;
  const look = useMemo(() => pageLook(page, catalog, indices), [page, catalog, indices]);
  const frogHidden = checkout && !desktop;

  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    frogRef.current?.fireEmote(PAGE_EMOTE[page]);
  }, [page]);

  if (!mounted) return null;

  const go = (next: Page, dir: number) => {
    setDirection(dir);
    setPage(next);
    markStep(next);
  };
  const advance = () => {
    if (!checkout) {
      go(pages[Math.min(pages.length - 1, index + 1)], 1);
    } else if (!selected) {
      setPricingAttempt((attempt) => attempt + 1);
    } else {
      void startPurchase();
    }
  };
  const skip = () => {
    markClose('continue_free');
    onDone();
  };

  const accent = (text: string, className = 'text-primary') => <span className={className}>{text}</span>;
  const remindersAction =
    !notifications.isEnabled && notifications.canEnable ? (
      <button
        type="button"
        onClick={() => void notifications.enableOrConfigure()}
        className="inline-flex min-h-8 shrink-0 items-center rounded-xl bg-primary/10 px-2.5 text-[12.5px] font-black text-primary hover:bg-primary/15 active:scale-95"
      >
        Turn on reminders
      </button>
    ) : null;

  const copy: Record<Page, { eyebrow: ReactNode; title: ReactNode; eyebrowClass?: string }> = {
    free: {
      eyebrow: 'Frogress is free to use',
      title: trialDuration ? (
        <>But we’d love for you to try Plus for {accent(`${trialDuration} free`)} too!</>
      ) : (
        <>But we’d love for you to try {accent('Frogress Plus')} too!</>
      ),
    },
    reminder: {
      eyebrow: 'No surprise charges',
      title: notifications.isEnabled ? (
        <>
          We’ll remind you {accent(dates ? `on ${shortDate(dates.reminder)}` : `${LEAD_DAYS} days before`)}
          {dates ? `, ${LEAD_DAYS} days before your trial ends` : ' your trial ends'}
        </>
      ) : (
        <>
          Turn on reminders and we’ll ping you{' '}
          {accent(dates ? `on ${shortDate(dates.reminder)}` : `${LEAD_DAYS} days before`)}, before your trial ends
        </>
      ),
    },
    discount: {
      eyebrow: 'One-time offer!',
      eyebrowClass: 'font-black text-amber-600 dark:text-amber-400',
      title: trialDuration ? (
        <>{accent(`${save}% off`, 'text-amber-600 dark:text-amber-400')} when you start your free trial now</>
      ) : (
        <>{accent(`${save}% off`, 'text-amber-600 dark:text-amber-400')} Frogress Plus when you join now</>
      ),
    },
    checkout: {
      eyebrow: save ? (
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-4 w-4" strokeWidth={3.5} />
          One-time offer applied
        </span>
      ) : trialDuration ? (
        'No charge today'
      ) : (
        'Frogress Plus'
      ),
      eyebrowClass: save ? 'font-black text-primary' : undefined,
      title: trial ? (
        <>
          Start your <span className="whitespace-nowrap">{`${trial.count}-${UNIT[trial.unit]}`}</span> {accent('free')} trial
        </>
      ) : (
        'Get Frogress Plus'
      ),
    },
  };
  const heading = copy[page];

  const ctaLabel = checkout
    ? !selected
      ? 'Try again'
      : trialDuration
        ? 'Start my free trial'
        : 'Get Plus'
    : page === 'discount'
      ? 'See offer details'
      : trialDuration
        ? 'See my free offer'
        : 'See my offer';

  const slide = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: 28 * direction, scale: 0.96 },
        animate: { opacity: 1, x: 0, scale: 1 },
        exit: { opacity: 0, x: -28 * direction, scale: 0.96 },
      };

  const checkoutDetails = (
    <div className="w-full px-1">
      {trial && selected ? (
        <OfferTimeline
          trial={trial}
          start={start}
          price={selected.hasIntroPrice ? null : selected.priceString}
          remindersOn={notifications.isEnabled}
          action={remindersAction}
        />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {paywallContext.benefits.map((benefit) => (
            <li key={benefit.title} className="flex items-center gap-3 text-left">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-muted/70">
                <Icon name={benefit.icon} className="h-7 w-7" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-black leading-tight text-foreground">{benefit.title}</span>
                <span className="mt-0.5 block text-[13px] font-semibold leading-snug text-muted-foreground">
                  {benefit.body}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const object = (() => {
    if (page === 'reminder' && dates) {
      return (
        <ReminderPhone
          date={dates.reminder}
          renewDate={dates.end}
          action={remindersAction ? <div className="relative -mt-5 rounded-xl bg-card shadow-[0_6px_16px_-8px_rgba(15,23,42,0.35)]">{remindersAction}</div> : null}
        />
      );
    }
    if (page === 'discount') return <OfferTicket percent={save} />;
    if (checkout && !desktop) return null;
    return <PlusBar />;
  })();

  const isNative = Capacitor.isNativePlatform();
  const isIos = Capacitor.getPlatform() === 'ios';

  return (
    <div className={cn('relative isolate flex w-full flex-1 flex-col', ONBOARDING_SPLIT_STEP_CLASS, 'lg:short-screen:py-8')}>
      <OnboardingTopBar
        onBack={index > 0 && !purchasing ? () => go(pages[index - 1], -1) : undefined}
        className={ONBOARDING_SPLIT_BAR_CLASS}
      />

      <div
        className={cn(
          'flex w-full flex-col pt-[calc(4.5rem+env(safe-area-inset-top))] short:pt-[calc(3rem+env(safe-area-inset-top))] md:mx-auto md:max-w-md md:pt-24 lg:pt-0',
          !checkout && 'min-h-[calc(12.5rem+env(safe-area-inset-top))] short:min-h-[calc(10.25rem+env(safe-area-inset-top))] md:min-h-[14rem] lg:min-h-0',
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {pricesReady ? (
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="text-center"
            >
              <p
                className={cn(
                  'text-[16px] font-bold leading-snug text-muted-foreground short:text-[15px] lg:text-[18px]',
                  heading.eyebrowClass,
                )}
              >
                {heading.eyebrow}
              </p>
              <h1 className="mx-auto mt-1 max-w-[21rem] text-balance text-[27px] font-black leading-[1.16] tracking-tight text-foreground short:text-[24px] lg:mt-2 lg:max-w-[27rem] lg:text-[36px] lg:leading-[1.12] lg:short-screen:max-w-[30rem] lg:short-screen:text-[30px]">
                {heading.title}
              </h1>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {checkout && pricesReady ? (
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE }}
          className="mx-auto mt-7 w-full max-w-md short:mt-5 lg:mt-9 lg:short-screen:mt-5"
        >
          {checkoutDetails}
        </motion.div>
      ) : null}

      <div
        ref={bodyRef}
        className={cn(
          'relative w-full flex-1 md:mx-auto md:max-w-md lg:static lg:min-h-0 lg:flex-none',
          !checkout && 'min-h-[15rem] short:min-h-[13rem]',
        )}
      >
        <div
          className="absolute inset-x-0 lg:right-1/2"
          style={{
            top: desktop
              ? viewportHeight
                ? Math.round(viewportHeight / 2) + 31
                : 'calc(50vh + 31px)'
              : bodyHeight
                ? Math.max(Math.round(frogHeight * 0.45), Math.round(bodyHeight / 2 - SEAT_LIFT))
                : `calc(50% - ${SEAT_LIFT}px)`,
          }}
        >
          <div className="relative flex w-full justify-center lg:mx-auto lg:max-w-[26rem]">
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute bottom-[calc(100%-11px)] left-1/2 z-20 transition-opacity duration-300 lg:bottom-[calc(100%-14px)]',
                frogHidden && 'opacity-0',
              )}
              style={{ width: frogWidth, height: frogHeight, marginLeft: -frogWidth / 2 }}
            >
              <Frog
                ref={frogRef}
                width={frogWidth}
                height={frogHeight}
                indices={look}
                arrive="hop"
                greet="loveBurst"
                paused={!!reduceMotion || frogHidden}
              />
              <PremiumFrogAura
                show
                alwaysPlay
                paused={!!reduceMotion || frogHidden}
                flySize={desktop ? 56 : 46}
                className="[--premium-fly-top:34%] [--premium-fly-x-max:78px] [--premium-fly-x-min:-118px] [--premium-fly-y-max:14px] [--premium-fly-y-min:-16px] lg:[--premium-fly-x-max:112px] lg:[--premium-fly-x-min:-164px] lg:[--premium-fly-y-max:18px] lg:[--premium-fly-y-min:-22px]"
              />
            </div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={page}
                {...slide}
                transition={
                  page === 'discount' && !reduceMotion
                    ? { type: 'spring', stiffness: 420, damping: 22 }
                    : { duration: 0.3, ease: EASE }
                }
                className="relative z-10 flex w-full justify-center"
              >
                {object}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <OnboardingFooter className="gap-1.5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] short:gap-1 short:pb-3 md:bg-transparent md:pb-10 lg:static lg:mt-8 lg:pb-0 lg:short-screen:mt-3 md:[&>span:first-child]:hidden">
        {purchaseError ? (
          <p role="alert" className="text-center text-[13px] font-bold text-destructive">
            {purchaseError}
          </p>
        ) : null}
        {!checkout ? (
          <p
            className={cn(
              'mb-1 text-center text-[14px] font-bold text-muted-foreground',
              page !== 'discount' && 'invisible',
            )}
          >
            A welcome gift for you & {frogName}
          </p>
        ) : null}
        {checkout ? (
          <p aria-live="polite" className="mb-1 max-w-[22rem] text-balance text-center text-[14px] font-semibold leading-snug text-muted-foreground">
            {!selected ? (
              pricingFailed ? 'Store prices are unavailable right now.' : 'Checking your store’s prices…'
            ) : selected.hasIntroPrice ? (
              <>Introductory offer shown at checkout, then {selected.priceString} per {period}.</>
            ) : (
              <>
                {trialDuration ? `Frogress Plus is free for ${trialDuration}, then ` : 'Frogress Plus is '}
                <span className={cn('font-black', selected.regular ? 'text-amber-600 dark:text-amber-400' : 'text-foreground')}>
                  {selected.priceString}
                </span>
                {selected.regular ? (
                  <s className="ml-1 font-semibold decoration-[1.5px]">{selected.regular.priceString}</s>
                ) : null}{' '}
                <span className="font-black text-foreground">per {period}</span>
                {save ? <span className="text-foreground"> (save {save}%)</span> : null}
              </>
            )}
          </p>
        ) : null}
        <OnboardingButton
          onClick={advance}
          disabled={(checkout && pricesPending) || (!checkout && !pricesReady)}
          loading={purchasing || pricesPending}
          className={cn('isolate overflow-hidden', checkout && 'short:h-12')}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-[40%] -z-10 w-[35%] bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 motion-safe:animate-[plus-cta-shine_4.2s_ease-in-out_1.2s_infinite]"
          />
          {ctaLabel}
        </OnboardingButton>
        {checkout ? (
          <>
            <OnboardingButton variant="ghost" onClick={skip} disabled={purchasing} className="h-10 short:h-8">
              {save ? 'Skip this one-time offer' : 'Not now'}
            </OnboardingButton>
            {save ? (
              <p className="text-center text-[12.5px] font-black text-amber-600 dark:text-amber-400">
                Offer expires when you leave this screen
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-x-3 text-[10.5px] font-medium text-muted-foreground">
              <span>Renews automatically. Cancel anytime.</span>
              {isNative ? (
                <button
                  type="button"
                  disabled={purchasing}
                  onClick={() => void restorePurchases()}
                  className="min-h-7 rounded-lg underline underline-offset-2 hover:text-foreground"
                >
                  Restore
                </button>
              ) : null}
              <a
                href={isIos ? APPLE_EULA_URL : TERMS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-7 items-center rounded-lg underline underline-offset-2 hover:text-foreground"
              >
                {isIos ? 'Terms of Use' : 'Terms'}
              </a>
              <a
                href={PRIVACY_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-7 items-center rounded-lg underline underline-offset-2 hover:text-foreground"
              >
                Privacy
              </a>
            </div>
          </>
        ) : null}
      </OnboardingFooter>

      <PlusAccountPrompt
        open={needsAccount}
        linking={linking}
        linkError={linkError}
        onDismiss={dismissAccountPrompt}
        onLink={(provider) => void linkGuestAccount(provider)}
        onEmail={continueWithEmail}
      />
    </div>
  );
}
