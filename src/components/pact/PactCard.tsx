'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  ArrowLeftRight,
  Flame,
  HelpCircle,
  Loader2,
  Play,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FlyWorth,
  type QuestRewardCatalogItem,
} from '@/components/ui/QuestCards';
import {
  HintButton,
  ObjectiveProgressBar,
  QuestRewardTileBadge,
  primeQuestsPageCache,
  refreshQuestHomeView,
} from '@/lib/questClaims';
import { useUIStore } from '@/lib/uiStore';
import { pactViewKey } from '@/lib/pact/viewKey';
import type { PactView, PactWeekResult } from '@/lib/pact/types';
import { formatPactRate, pactWeekRewardTiles } from '@/lib/pact/format';
import { PACT_DEFAULT_DAYS } from '@/lib/pact/types';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import { PactChangeSheet } from './PactChangeSheet';
import { LeapMoveSheet, canMoveSession } from './LeapMoveSheet';
import { openShieldSheet } from '@/hooks/useShields';
import LilyPadIcon from '../../../public/icons/LilyPad.svg';
import { PactWeekResultSheet } from './PactWeekResultSheet';
import { PactPickSheet } from './PactPickSheet';
import { RotatingWeekPrice } from './RotatingWeekPrice';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const PREVIEW_OUTCOMES = ['kept', 'rescued', 'near_miss', 'missed'] as const;
type PreviewOutcome = (typeof PREVIEW_OUTCOMES)[number];
/** Not an outcome — a kept week aimed at the first rung, to see the landing. */
type PreviewMode = PreviewOutcome | 'landed';

/**
 * Settlement runs once, on the first load after a real week rolls over, which
 * makes this sheet all but impossible to look at while it is being worked on.
 *
 * So it can be summoned by hand — `?leapResult=kept|landed|rescued|near_miss|
 * missed` — and only by hand. Nothing opens it unasked but a real settled
 * week. Read after mount rather than during render: the URL is not knowable on
 * the server, and reading it in the body would hydrate a different tree.
 */
function useWeekResultPreview(data: PactView | undefined) {
  const [outcome, setOutcome] = useState<PreviewMode | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('leapResult');
    if (raw === null) return;
    setOutcome(
      raw === 'landed'
        ? 'landed'
        : (PREVIEW_OUTCOMES.find((entry) => entry === raw) ?? 'kept'),
    );
  }, []);

  const dismissPreview = () => setDismissed(true);

  if (!outcome || dismissed || !data) return { preview: null, dismissPreview };

  const target = data.active?.target ?? 2;
  // `landed` walks the streak up to the first rung, which is the only way to
  // see the pad-to-pad hop without waiting out four real weeks.
  const firstRung =
    data.ladder.rungs.find((rung) => rung.weeks > 0)?.weeks ?? 4;
  const streakBefore =
    outcome === 'landed' ? Math.max(0, firstRung - 1) : data.streak.weeks;
  const preview: PactWeekResult = {
    weekKey: `preview-${outcome}`,
    categoryName:
      data.active?.categoryName ?? data.areas[0]?.name ?? 'Mindfulness',
    outcome: outcome === 'landed' ? 'kept' : outcome,
    progress:
      outcome === 'kept' || outcome === 'landed'
        ? target
        : Math.max(0, target - 1),
    target,
    streakBefore,
    streakAfter:
      outcome === 'kept' || outcome === 'landed'
        ? streakBefore + 1
        : outcome === 'missed'
          ? 0
          : streakBefore,
    milestoneWeeks:
      outcome === 'kept' || outcome === 'landed' ? streakBefore + 1 : undefined,
    fliesGranted: outcome === 'missed' ? 0 : 24,
    shieldsLeft: outcome === 'missed' ? 0 : data.streak.shields,
  };
  return { preview, dismissPreview };
}

/** A preview sheet must never post a real settlement dismissal. */
function isPreviewResult(result: PactWeekResult) {
  return result.weekKey.startsWith('preview-');
}

/**
 * One settlement sheet, whichever surface gets there first.
 *
 * The week that ended is reported on home AND on the quests page, because
 * gating it to one of them let a payoff the user earned sit unseen for days if
 * they never opened that tab. But it is a modal: two PactCards alive at once
 * would stack two of them, which is exactly the bug that shipped when the
 * quests page mounted a mobile and a desktop copy of the same panel. So the
 * right to render it is claimed by one card and released when that card goes.
 */
let weekResultOwner: symbol | null = null;

function useOwnsWeekResult() {
  const idRef = useRef<symbol>(null as unknown as symbol);
  idRef.current ??= Symbol('pact-week-result');
  const [owns, setOwns] = useState(false);

  useEffect(() => {
    const id = idRef.current;
    if (weekResultOwner === null) weekResultOwner = id;
    setOwns(weekResultOwner === id);
    return () => {
      if (weekResultOwner === id) weekResultOwner = null;
    };
  }, []);

  return owns;
}

export function usePactView() {
  return useSWR<PactView>(pactViewKey(), fetcher, {
    revalidateOnFocus: false,
  });
}

/**
 * Home shares vertical space with the frog scene and the task list, so its
 * banner is roughly half the height of the one on the quests page, where the
 * card is the main event. Ratios are inline rather than Tailwind arbitrary
 * classes so they cannot be dropped by a stale JIT pass.
 */
/**
 * Weeks the home teaser has been waved off. Per-device and per-week on
 * purpose: the pick is a nudge, and a nudge that cannot be dismissed becomes
 * a demand. The quests page ignores this entirely, so saying no here never
 * closes the door — it just stops the home page asking twice.
 */
const DEFERRED_WEEK_KEY = 'frog:pactDeferredWeek';

const WEEK_START_DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const BANNER_RATIO = {
  home: { active: '16 / 4' },
  // The quests page is where this card is the main event and has the room —
  // home shares its fold with the frog scene, the quest strip and the list.
  panel: { active: '16 / 6' },
} as const;

/**
 * The empty band's ratio, per variant. A class rather than an inline style so
 * it can answer the width: at 320px a 16:4.2 band is 84px of art with two
 * lines of copy over it, which is a caption with a texture behind it.
 */
const EMPTY_RATIO_CLASS = {
  home: 'aspect-[16/5.8] min-[360px]:aspect-[16/4.2]',
  panel: 'aspect-[16/5.8] min-[360px]:aspect-[16/5]',
} as const;

const badgeCount = (value: number) => (value > 9 ? '9+' : String(value));

function PactStartButtons({
  onStart,
  onDefer,
}: {
  onStart: () => void;
  onDefer: (() => void) | null;
}) {
  return (
    <>
      {onDefer && (
        <button
          type="button"
          onClick={onDefer}
          className="rounded-lg px-2 py-2 text-[11px] font-semibold text-muted-foreground/70 transition-colors min-[400px]:px-2.5 min-[400px]:text-[12px] [@media(hover:hover)]:hover:text-foreground"
        >
          Not now
        </button>
      )}
      <button
        type="button"
        data-hint="pact-pick-area"
        onClick={onStart}
        className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3.5 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309] transition active:translate-y-[2px] active:shadow-none roomy:flex-none"
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        Take my Leap
      </button>
    </>
  );
}

function PactHudButton({
  icon: Icon,
  iconClassName = 'h-[17px] w-[17px]',
  label,
  badge,
  tone = 'have',
  urgent,
  onClick,
}: {
  icon: LucideIcon | React.FC<React.SVGProps<SVGSVGElement>>;
  iconClassName?: string;
  label: string;
  badge: string | null;
  tone?: 'have' | 'action';
  urgent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition active:scale-95 after:absolute after:-inset-1.5 after:content-[''] [@media(hover:hover)]:hover:bg-black/65"
    >
      <Icon className={iconClassName} strokeWidth={2.75} aria-hidden="true" />
      {badge && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute -right-1 -top-1 grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 text-[10px] font-black leading-none ring-2 ring-black/55',
            tone === 'have'
              ? 'bg-lime-400 text-lime-950'
              : 'bg-amber-400 text-amber-950',
            urgent && 'animate-pulse',
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export function PactCard({
  variant = 'home',
}: {
  variant?: 'home' | 'panel';
} = {}) {
  const ratio = BANNER_RATIO[variant];
  const { data, mutate } = usePactView();
  const [pickOpen, setPickOpen] = useState(false);
  const [introOnly, setIntroOnly] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [claimingRetro, setClaimingRetro] = useState(false);
  const [confirmChange, setConfirmChange] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const startHintGuide = useUIStore((state) => state.startHintGuide);
  const [deferredWeek, setDeferredWeek] = useState<string | null>(null);
  const wasLockedRef = useRef(false);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const loaded = !!data;
  // Shown in the card's place right after deferring, so the escape hatch is
  // learned at the one moment the user is looking for it.
  const [justDeferred, setJustDeferred] = useState(false);
  const { preview, dismissPreview } = useWeekResultPreview(data);
  const ownsWeekResult = useOwnsWeekResult();

  useEffect(() => {
    try {
      setDeferredWeek(window.localStorage.getItem(DEFERRED_WEEK_KEY));
    } catch {
      /* private mode — the nudge simply keeps showing */
    }
  }, []);

  useEffect(() => {
    if (!justDeferred) return;
    const timer = window.setTimeout(() => setJustDeferred(false), 7000);
    return () => window.clearTimeout(timer);
  }, [justDeferred]);

  const unlocked = !!data && data.enabled && !data.needsAreas;

  useEffect(() => {
    if (!loaded) return;
    if (!unlocked) {
      wasLockedRef.current = true;
      return;
    }
    if (!wasLockedRef.current) return;
    wasLockedRef.current = false;
    setJustUnlocked(true);
    const timer = window.setTimeout(() => setJustUnlocked(false), 600);
    return () => window.clearTimeout(timer);
  }, [loaded, unlocked]);

  if (!unlocked || !data) return null;

  const openPicker = () => {
    setIntroOnly(false);
    setPickOpen(true);
  };

  const shownWeekResult = data.weekResult ?? preview;

  const dismissWeekResult = async () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await fetch('/api/pact/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone }),
    });
    const payload = await res.json().catch(() => ({}));
    if (res.ok) mutate(payload.view, { revalidate: false });
  };

  const claim = async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/pact/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });
      const payload = await res.json();
      if (res.ok) mutate(payload.view, { revalidate: false });
    } finally {
      setClaiming(false);
    }
  };

  const claimRetro = async () => {
    if (claimingRetro) return;
    setClaimingRetro(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/pact/retro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone }),
      });
      const payload = await res.json();
      if (res.ok) mutate(payload.view, { revalidate: false });
    } finally {
      setClaimingRetro(false);
    }
  };

  // Swapping is destructive — the week's tasks are released and the pact is
  // deleted — so it always states its price first. A swap token absorbs it;
  // without one the streak goes back to zero.
  const changeCommitment = async () => {
    if (changing) return;
    setChanging(true);
    setChangeError(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch('/api/pact/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone, action: 'drop' }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChangeError(payload.error || 'Could not swap your Leap');
        void mutate();
        return;
      }
      mutate(payload.view, { revalidate: false });
      setConfirmChange(false);
      openPicker();
    } catch {
      setChangeError('Could not swap your Leap');
    } finally {
      setChanging(false);
    }
  };

  const active = data.active;
  // Every session done. The week is over as far as the work goes, whether or
  // not the reward has been collected yet — and nothing that implies more is
  // owed ("next session", "to finish", "change commitment") may show again.
  const weekFinished = !!active && active.progress >= active.target;
  // Offered when the week has actually lost something — a missed day, or a
  // target it can no longer reach. A week still on track keeps its schedule.
  const offerMove =
    !!active &&
    !weekFinished &&
    canMoveSession(data) &&
    (active.missedSessions > 0 || !active.canStillFinish);
  // Named, not "next week": the day a new commitment opens is the user's own
  // week-start setting, and "Sunday" is a date you can plan around in a way
  // that "when the week rolls over" is not.
  const weekStartDayName =
    WEEK_START_DAY_NAMES[data.weekStartsOn] ?? 'the new week';
  // Home shows a running pact through the quest strip instead — a full card
  // there sat between the frog and the task list and read as an interruption.
  // The quests page keeps the whole card, where it is the main event.
  //
  // Hidden, not unmounted: the pick sheet lives inside this component, so
  // returning null the instant a pact exists tore the sheet off the screen
  // mid-commit and took its success step with it.
  const hideCard = variant === 'home' && !!active;
  // Only the home nudge can be waved off. The quests page is where the user
  // goes looking for this, so it always offers it.
  const deferredHere =
    variant === 'home' && deferredWeek === data.weekKey;
  const deferWeek = () => {
    try {
      window.localStorage.setItem(DEFERRED_WEEK_KEY, data.weekKey);
    } catch {
      /* private mode — deferral lasts for this render only */
    }
    setDeferredWeek(data.weekKey);
    setJustDeferred(true);
  };
  const teaser = data.areas.find((entry) => entry.recommended) ?? data.areas[0];
  const defaultDays = PACT_DEFAULT_DAYS.length;
  const startPreview =
    data.weekPreview.find((entry) => entry.sessions === defaultDays) ??
    data.weekPreview[Math.floor(data.weekPreview.length / 2)] ??
    null;
  return (
    <>
      <div
        className={cn(
          'mx-1.5 mb-2 w-[calc(100%-0.75rem)] md:mx-4 md:w-[calc(100%-2rem)]',
          hideCard && 'hidden',
          justUnlocked && !hideCard && 'leap-card-in',
        )}
      >
        {/* Only ever an owed payout, never a pitch. The gold Plus banner sat
            above the artwork and was the loudest thing on the card — it out-
            shouted the commitment the card exists to show, and for a free
            user it advertised flies they could not take. Plus users still
            need somewhere to collect, so that case keeps a quiet row. */}
        {data.isPremium && data.forgoneFlies > 0 && (
          <button
            type="button"
            onClick={() => void claimRetro()}
            className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 text-left transition active:scale-[0.99] [@media(hover:hover)]:hover:bg-muted/70"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
              <FlyWorth amount={data.forgoneFlies} />
              <span className="truncate">earned before Plus</span>
            </span>
            <span className="shrink-0 text-[12px] font-black text-primary">
              {claimingRetro ? '…' : 'Collect'}
            </span>
          </button>
        )}

        {!active && deferredHere ? (
          justDeferred ? (
            <div className="rounded-[20px] border border-border/50 bg-card px-4 py-3">
              <p className="text-[12.5px] font-bold text-foreground">
                Put off until next week.
              </p>
              <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">
                Changed your mind? Your areas are on the Quests page.
              </p>
            </div>
          ) : null
        ) : !active ? (
          <div className="relative w-full overflow-hidden rounded-[24px] border border-border/50 bg-card text-left shadow-sm">
          {/* Outside the banner's own button, not inside it: a button nested
              in a button is invalid, and the browser picks its own winner. */}
          <button
            type="button"
            aria-label="What is a Leap?"
            onClick={() => {
              setIntroOnly(true);
              setPickOpen(true);
            }}
            className="absolute right-2.5 top-2.5 z-20 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm transition active:scale-95 [@media(hover:hover)]:hover:bg-black/70"
          >
            <HelpCircle className="h-[18px] w-[18px]" strokeWidth={2.75} />
          </button>
          <button
            type="button"
            data-hint="pact-pick-area"
            onClick={openPicker}
            className="block w-full text-left transition active:scale-[0.99]"
          >
            {/* The art is a backdrop, not a box the text has to fit inside:
                the ratio is a preferred height, and the copy sits in normal
                flow so a 320px screen grows the band instead of wrapping the
                sub-line up over the chip. The crop is biased upward so the
                frog's head survives a ratio this wide. */}
            {/* `grid-cols-1` is load-bearing: an `auto` column sizes to its
                content's max-content width, so the sub-line pushed the column
                wider than the card and ran off the edge instead of wrapping.
                Tailwind's `grid-cols-1` is `minmax(0, 1fr)`. */}
            <div className="relative grid w-full grid-cols-1 overflow-hidden">
              {/* The ratio as a grid sibling, not as the band's own height.
                  `aspect-ratio` on a block sets the height outright and lets
                  content spill past it — which is how a wrapped sub-line ended
                  up sliced off. Sharing one grid cell, the row takes whichever
                  is taller: the ratio, or the words. */}
              <div
                aria-hidden="true"
                className={cn(
                  'col-start-1 row-start-1 w-full',
                  EMPTY_RATIO_CLASS[variant],
                )}
              />
              {teaser?.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={teaser.coverImageUrl}
                  alt={teaser.name}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover object-[center_40%]"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, ${teaser?.backgroundFrom ?? '#134e4a'}, ${teaser?.backgroundTo ?? '#0f172a'})`,
                  }}
                />
              )}
              {/* Two short scrims, not one flat wash: a gradient that darkens
                  only the slice behind each text block clears the 3:1 large-
                  text floor where the words are and leaves the middle of the
                  art — the frog — at full strength. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[38%] bg-gradient-to-b from-black/22 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

              <div className="relative col-start-1 row-start-1 flex flex-col justify-between gap-2 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2 pr-9">
                  {/* Narrower than 376px the badge is the only thing on the
                      band besides the headline, so it shrinks rather than
                      claiming a third of the artwork. */}
                  <span className="inline-flex min-w-0 items-center gap-2 rounded-lg bg-black/45 px-2.5 py-1 backdrop-blur-sm narrow:gap-1.5 narrow:px-1.5 narrow:py-0.5">
                    <span className="shrink-0 text-[9.5px] font-black uppercase tracking-[0.14em] text-white/60 narrow:text-[8.5px]">
                      Suggested
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-3 w-px shrink-0 rounded-full bg-white/25 narrow:h-2.5"
                    />
                    <span className="min-w-0 truncate text-[13px] font-black tracking-[-0.01em] text-white narrow:text-[11px]">
                      {teaser?.name ?? 'an area'}
                    </span>
                  </span>
                  {data.streak.weeks > 0 && (
                    <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-black/50 px-2.5 text-[11px] font-black text-white backdrop-blur-sm">
                      <Flame
                        className="h-3.5 w-3.5 fill-current text-amber-300"
                        strokeWidth={2}
                      />
                      {data.streak.weeks}w · pays{' '}
                      {formatPactRate(data.ladder.multiplier)}
                    </span>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-1">
                  <span
                    className="text-[19px] leading-none tracking-[0.03em] text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.9)] min-[360px]:text-[22px]"
                    style={{
                      fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                      WebkitTextStroke: '2.2px rgba(15, 23, 42, 0.95)',
                      paintOrder: 'stroke fill',
                    }}
                  >
                    Take your Leap
                  </span>
                  {/* Two lines, one slot. Someone who has never landed a Leap
                      needs to know what the word means; someone who has needs
                      a reason to start another, and a week turning over is the
                      reason — new periods reliably restart goal commitment. */}
                  <span className="block text-[11.5px] font-semibold leading-tight text-white/90 drop-shadow-[0_1px_2px_rgba(15,23,42,0.95)] narrow:hidden">
                    {data.streak.best === 0
                      ? 'Pick one thing and your days — we’ll add it to your list'
                      : 'A new week, a new commitment'}
                  </span>
                </div>
              </div>
            </div>
          </button>
            {/* One row: the week's price on the left, the only two things to
                do on the right. The area name lives on the art now, so the
                footer never repeats what the picture already says. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3.5 py-2.5">
              {/* Never `flex-1 min-w-0`: a flex item shrinks before it wraps,
                  so the price would silently clip on a narrow phone instead
                  of dropping the buttons onto their own line. */}
              {startPreview && (
                <span className="shrink-0">
                  <RotatingWeekPrice
                    previews={data.weekPreview}
                    startIndex={Math.max(
                      0,
                      data.weekPreview.findIndex(
                        (entry) => entry.sessions === startPreview.sessions,
                      ),
                    )}
                    catalog={
                      data.rewardCatalog as Record<
                        string,
                        QuestRewardCatalogItem
                      >
                    }
                    isPremium={data.isPremium}
                  />
                </span>
              )}
              {/* Narrow: the price and two buttons cannot share a line, so
                  the buttons take a full row and the primary stretches to it —
                  the app's own CTA style, and the easiest thing to hit
                  one-handed. Wide: back to one row, buttons at natural size.
                  `roomy` is a named screen in tailwind.config.js, not an
                  arbitrary `min-[460px]:` — a fresh arbitrary variant value
                  was not making it into the build. */}
              <div className="flex w-full items-center justify-end gap-1 roomy:ml-auto roomy:w-auto">
                <PactStartButtons
                  onStart={openPicker}
                  onDefer={variant === 'home' ? deferWeek : null}
                />
              </div>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'overflow-hidden rounded-[24px] border shadow-sm',
              active.claimable
                ? 'border-lime-500/50 bg-lime-500/10'
                : 'border-border/50 bg-card',
            )}
          >
            <div
              className="relative w-full overflow-hidden"
              style={{ aspectRatio: ratio.active }}
            >
              {active.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={active.coverImageUrl}
                  alt={active.categoryName}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover object-center"
                />
              ) : (
                <div
                  className="h-full w-full"
                  style={{
                    background: `linear-gradient(135deg, ${active.backgroundFrom ?? '#0f172a'}, ${active.backgroundTo ?? '#1e293b'})`,
                  }}
                />
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/55 to-transparent" />
              <span
                className="absolute bottom-2 left-3.5 text-[19px] leading-none tracking-wide text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.9)]"
                style={{
                  fontFamily: 'var(--font-display), "Luckiest Guy", cursive',
                  WebkitTextStroke: '1.8px rgba(15, 23, 42, 0.95)',
                  paintOrder: 'stroke fill',
                }}
              >
                {active.categoryName}
              </span>
              {/* When it happens next, on the art rather than under the bar:
                  it belongs with the area's identity, and down in the body it
                  was a third line competing with what the week is worth. */}
              {!weekFinished && (active.nextTaskLabel || active.scheduleLabel) && (
                <span className="absolute bottom-2.5 right-2.5 max-w-[60%] truncate rounded-lg bg-black/55 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                  {active.nextTaskLabel
                    ? `Next: ${active.nextTaskLabel}`
                    : active.scheduleLabel}
                </span>
              )}
              <div className="absolute right-2.5 top-2.5 flex items-center gap-3">
                {data.streak.weeks > 0 && (
                  <span className="inline-flex h-8 items-center gap-1 rounded-full bg-black/45 px-2.5 text-[11px] font-black text-amber-300 backdrop-blur-sm">
                    <Flame className="h-3.5 w-3.5" strokeWidth={2.75} />
                    {data.streak.weeks}
                  </span>
                )}
                <PactHudButton
                  icon={LilyPadIcon}
                  iconClassName="h-[23px] w-[23px]"
                  onClick={() => openShieldSheet()}
                  badge={
                    data.streak.shields > 0
                      ? badgeCount(data.streak.shields)
                      : '+'
                  }
                  tone={data.streak.shields > 0 ? 'have' : 'action'}
                  urgent={data.streak.shields === 0 && data.streak.atRisk}
                  label={
                    data.streak.shields > 0
                      ? `Lily Pad — ${data.streak.shields} held`
                      : 'Nothing under your week — get a Lily Pad'
                  }
                />
                {!weekFinished && (
                  <PactHudButton
                    icon={ArrowLeftRight}
                    onClick={() => {
                      setChangeError(null);
                      setConfirmChange(true);
                    }}
                    badge={
                      data.swapTokens > 0 ? badgeCount(data.swapTokens) : null
                    }
                    label={
                      data.swapTokens > 0
                        ? `Change Leap — ${data.swapTokens} swap${data.swapTokens === 1 ? '' : 's'} left`
                        : 'Change Leap — no swaps left'
                    }
                  />
                )}
              </div>
            </div>

            <div className="px-3.5 py-3">
              {/* Laid out exactly like a quest objective row — reward tile
                  spanning the left, what-to-do stacked over its own bar, hint
                  on the right — because that is what a pact is. The prize
                  beside the bar answers "what am I filling this for" while
                  the bar is being read, not in a line underneath it. */}
              <div className="flex items-center gap-2.5">
                <QuestRewardTileBadge
                  rewards={pactWeekRewardTiles(active)}
                  catalog={data.rewardCatalog as never}
                  isPremium={data.isPremium}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p
                    className={cn(
                      'text-[15px] font-black leading-snug',
                      weekFinished
                        ? 'text-muted-foreground line-through decoration-1'
                        : 'text-foreground',
                    )}
                  >
                    {active.commitmentText}
                  </p>
                  <ObjectiveProgressBar
                    progress={active.progress}
                    target={active.target}
                  />
                </div>
                <span
                  className="shrink-0"
                  onClick={(event) => event.stopPropagation()}
                >
                  {active.claimable && !active.claimed ? (
                    // The Hint slot, holding the one action left. The tiles to
                    // the left already say what the week pays, so the reward
                    // never needs restating in words underneath them.
                    <button
                      type="button"
                      onClick={claim}
                      disabled={claiming}
                      className="inline-flex h-8 min-w-[5.5rem] items-center justify-center rounded-xl bg-amber-500 px-3 text-[13px] font-black text-white shadow-[0_3px_0_0_#b45309] transition-transform active:translate-y-[2px] active:shadow-none disabled:opacity-60"
                    >
                      {claiming ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Claim'
                      )}
                    </button>
                  ) : weekFinished ? (
                    // Nothing left to explain, and leaving the slot empty made
                    // the finished row reflow narrower than the one it replaced.
                    <span className="inline-flex h-8 items-center justify-center rounded-xl border border-lime-500/40 bg-lime-500/10 px-3 text-[13px] font-black text-lime-600 dark:text-lime-400 min-[400px]:px-3.5">
                      Done
                    </span>
                  ) : (
                  <HintButton
                    text={
                      weekFinished
                        ? `All ${active.target} day${active.target === 1 ? '' : 's'} done. You can take a new Leap when the week rolls over.`
                        : active.openToday
                          ? `Today's is on your list, tagged ${active.categoryName}. Finish all ${active.target} days this week.`
                          : active.nextTaskLabel
                            ? `Next up: ${active.nextTaskLabel}. ${active.progress} of ${active.target} days done this week.`
                            : `No days left. ${active.progress} of ${active.target} done this week.`
                    }
                    onShowMe={
                      !weekFinished && active.openToday
                        ? () =>
                            startHintGuide(
                              'pact-session',
                              active.tagId ? { tagIds: [active.tagId] } : undefined,
                            )
                        : undefined
                    }
                  />
                  )}
                </span>
              </div>

              {/* Only what the tiles above cannot say. The reward is already
                  drawn there, so this line carries the two things art cannot:
                  a day that went by untouched, and what the week is worth now
                  that it did. Nothing said either until the week had quietly
                  ended and the streak was gone. */}
              {(active.claimed ||
                (!weekFinished &&
                  (active.missedSessions > 0 ||
                    !active.canStillFinish ||
                    offerMove))) && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
                    {active.claimed ? (
                      <span className="truncate">
                        Next Leap opens {weekStartDayName}
                      </span>
                    ) : active.catchableSessions > 0 ? (
                      // Ranked above the move on purpose: logging a session
                      // you actually did costs nothing, and a move spent on a
                      // day you could still tick is a move wasted. Asked, not
                      // instructed — "check it off" is an order anyone can
                      // follow, a question is answered by the person who did
                      // the work.
                      <span className="truncate font-bold text-amber-600 dark:text-amber-400">
                        Did yesterday&apos;s? You can still log it today
                      </span>
                    ) : !active.canHoldStreak ? (
                      // Nothing can save this week, so the only useful thing
                      // left to say is what happens next.
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setChangeError(null);
                          setConfirmChange(true);
                        }}
                        className="truncate font-black text-muted-foreground underline decoration-muted-foreground/40 underline-offset-2"
                      >
                        This Leap won&apos;t land — start a different one
                      </button>
                    ) : offerMove ? (
                      // A state that names a problem and offers nothing is
                      // what teaches people to stop looking at the card.
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMoveOpen(true);
                        }}
                        className="truncate font-black text-amber-600 underline decoration-amber-600/40 underline-offset-2 dark:text-amber-400 dark:decoration-amber-400/40"
                      >
                        {active.missedSessions > 0
                          ? `Missed ${active.missedSessions} day${active.missedSessions === 1 ? '' : 's'} — move one to a free day`
                          : 'Move a session to another day'}
                      </button>
                    ) : (
                      <span
                        className={cn(
                          'truncate font-bold',
                          active.canStillFinish
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-muted-foreground',
                        )}
                      >
                        {/* Past here the week is always out of reach: a day
                            outside the catch-up window can never be logged,
                            and no move is left to rescue it. The streak may
                            still be, and which of the two it is decides
                            between "why bother" and one more session. */}
                        {active.progress >= active.nearMissTarget
                          ? 'Short of the target, but your streak holds'
                          : `${active.nearMissTarget - active.progress} more day${active.nearMissTarget - active.progress === 1 ? '' : 's'} and your streak holds`}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <PactPickSheet
        open={pickOpen}
        onClose={() => {
          setPickOpen(false);
          setIntroOnly(false);
        }}
        view={data}
        forceIntro={introOnly}
        onCommitted={(next) => {
          mutate(next, { revalidate: false });
          primeQuestsPageCache();
          void refreshQuestHomeView();
        }}
        onUpgrade={() => setPlusOpen(true)}
      />

      {ownsWeekResult && shownWeekResult && (
        <PactWeekResultSheet
          key={shownWeekResult.weekKey}
          view={data}
          result={shownWeekResult}
          onClose={() => {
            if (isPreviewResult(shownWeekResult)) return dismissPreview();
            void dismissWeekResult();
          }}
          onGetShield={() => {
            if (isPreviewResult(shownWeekResult)) dismissPreview();
            else void dismissWeekResult();
            openShieldSheet();
          }}
          // Straight into the pick, from whichever surface reported the week.
          // The settlement is dismissed on the way through, so backing out of
          // the pick lands on the page rather than on the sheet again.
          onStartLeap={() => {
            if (isPreviewResult(shownWeekResult)) dismissPreview();
            else void dismissWeekResult();
            openPicker();
          }}
        />
      )}

      <LeapMoveSheet
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        view={data}
      />

      <PactChangeSheet
        open={confirmChange}
        onClose={() => {
          setConfirmChange(false);
          setChangeError(null);
        }}
        view={data}
        changing={changing}
        error={changeError}
        onConfirm={changeCommitment}
        onUpgrade={() => {
          setConfirmChange(false);
          setPlusOpen(true);
        }}
      />

      <PlusUpgradeModal
        open={plusOpen}
        onClose={() => setPlusOpen(false)}
        placement="pact_write_own"
      />
    </>
  );
}
