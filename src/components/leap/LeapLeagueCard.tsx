'use client';

import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import useSWR from 'swr';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Check,
  ChevronRight,
  ChevronsDown,
  Clock,
  Lock,
  Play,
  X,
} from 'lucide-react';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import type { LeapBoardView } from '@/lib/leap/board';
import { Icon } from '@/components/ui/Icon';
import { BuddyFrogFace } from '@/components/ui/BuddyBadge';
import {
  QUEST_CARD_CLASS,
  QuestGoButton,
  QuestSectionHeader,
} from '@/components/ui/QuestCards';
import { openShieldSheet } from '@/hooks/useShields';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { preloadFrogFile, preloadGiftFile } from '@/lib/riveLoader';
import { useUIStore } from '@/lib/uiStore';
import { cn } from '@/lib/utils';
import { QuestTrack } from '@/components/ui/QuestTrack';
import type { BonusRewards, LeapView } from '@/lib/leap/types';
import { LILY_ART_BOTTOM, LILY_ART_TOP } from './LeapRail';
import { LeapLeaguesSheet } from './LeapLeaguesSheet';
import { LeapPlusRow } from './LeapPlusRow';
import { LeapPrizeTile } from './LeapPrizeTile';
import { PondBackdrop } from '@/components/ui/PondBackdrop';
import { PondLife } from './PondLife';
import { useLeapClaim } from './useLeapClaim';
import {
  habitsWord,
  leagueArt,
  leagueName,
  leagueTitle,
  leapCompeting,
  leapChestRewards,
  leapChestState,
  leapDaysLeft,
  leapHasHabits,
  leapRepeating,
  leapRule,
  leapStatus,
  leapStayMark,
  leapTarget,
  nextLeagueName,
  weekdayOf,
} from './leapCopy';
import { useLeapView } from './useLeapView';

function mergedChestRewards(rewards: BonusRewards): BonusRewards {
  const flies = rewards.reduce(
    (sum, reward) => (reward.type === 'FLIES' ? sum + Math.max(0, reward.amount ?? 0) : sum),
    0,
  );
  return [
    ...(flies > 0 ? [{ type: 'FLIES' as const, amount: flies }] : []),
    ...rewards.filter((reward) => reward.type !== 'FLIES'),
  ];
}

function nextChestDay(view: LeapView) {
  return weekdayOf(view.week.weekKey);
}

function LeapChestRow({ view, large = false }: { view: LeapView; large?: boolean }) {
  const startHintGuide = useUIStore((state) => state.startHintGuide);
  const { claim, busy, error } = useLeapClaim();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const state = leapChestState(view);
  const next = nextLeagueName(view);
  const target = leapTarget(view);
  const hops = view.week.hops;
  const merged = mergedChestRewards(leapChestRewards(view));
  const rewards = [
    ...merged.filter((reward) => reward.type !== 'FLIES'),
    ...merged.filter((reward) => reward.type === 'FLIES'),
  ];
  const ready = state === 'ready' || state === 'plusReady';
  const opened = state === 'opened';
  const repeating = leapRepeating(view);

  const title =
    state === 'ready'
      ? 'Your gift is ready!'
      : state === 'plusReady'
        ? 'Your Plus gift is ready!'
        : opened
          ? next
            ? `Moving up to ${next}`
            : 'Top gift won'
          : state === 'progress'
            ? `Finish ${habitsWord(target)} to open your gift`
            : leapStatus(view);

  return (
    <div
      ref={rowRef}
      className={cn(
        'flex items-center gap-3 px-3.5 transition-colors duration-300',
        large ? 'py-3.5' : 'py-3',
        ready && 'bg-[var(--season-tint,#fffbeb)] dark:bg-[var(--season-soft,rgba(245,158,11,0.1))]',
      )}
    >
      {rewards.length > 0 && (
        <span className="flex shrink-0 items-center gap-3 pt-2.5">
          {rewards.slice(0, 2).map((reward, index) => (
            <LeapPrizeTile
              key={index}
              reward={reward}
              view={view}
              size="md"
              offset={index}
              done={opened}
            />
          ))}
        </span>
      )}
      <span className={cn('flex min-w-0 flex-1 flex-col', large ? 'gap-2' : 'gap-1.5')}>
        <span
          className={cn(
            'flex min-w-0 items-center gap-1.5 font-bold leading-tight text-foreground',
            large ? 'text-[15px]' : 'text-[14px]',
          )}
        >
          {opened && (
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#4f9149] text-white">
              <Check className="h-2.5 w-2.5" strokeWidth={4} />
            </span>
          )}
          <span className="min-w-0 text-pretty">{title}</span>
        </span>
        {state === 'progress' || ready ? (
          <QuestTrack
            progress={ready ? Math.max(1, target) : hops}
            target={Math.max(1, target)}
            size={large ? 'lg' : 'md'}
            action={
              ready
                ? {
                    label: busy ? 'Opening…' : 'Open',
                    disabled: busy,
                    onPress: () => void claim({ source: rowRef.current }),
                  }
                : null
            }
          />
        ) : opened ? (
          <span className="text-[12.5px] font-semibold leading-tight text-muted-foreground">
            New gift {nextChestDay(view)}
          </span>
        ) : null}
        {error && (
          <span role="alert" className="text-[12.5px] font-semibold leading-tight text-destructive">
            {error}
          </span>
        )}
      </span>
      {!repeating ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            startHintGuide('take-leap');
          }}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--season-accent,#58a83f)] px-3 text-[13px] font-black text-[var(--season-on-accent,#fff)] shadow-[0_3px_0_0_var(--season-accent-lip,#2f6b1f)] transition-[transform,box-shadow] duration-150 active:translate-y-[2px] active:shadow-none"
        >
          <Play className="h-3 w-3 fill-current" />
          Show me
        </button>
      ) : state === 'progress' ? (
        <QuestGoButton onPress={() => startHintGuide('take-leap')} />
      ) : null}
    </div>
  );
}

function PlusChestStrip({ view }: { view: LeapView }) {
  const setPremiumModalOpen = useUIStore((state) => state.setPremiumModalOpen);
  const { chest } = view.week;
  if (view.isPremium || chest.plusRewards.length === 0) return null;
  if (!leapHasHabits(view) || !(leapCompeting(view) || chest.landed)) return null;
  return (
    <div className="border-t border-border/50 px-3 pb-3.5 pt-3">
      <LeapPlusRow view={view} onClick={() => setPremiumModalOpen(true, 'leap_leagues')} />
    </div>
  );
}

type LeapBoardResponse = { board: LeapBoardView | null };

const boardFetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error('Could not load the board');
    return res.json() as Promise<LeapBoardResponse>;
  });

function useLeapBoard(enabled: boolean) {
  return useSWR<LeapBoardResponse>(enabled ? '/api/leap/board' : null, boardFetcher, {
    revalidateOnFocus: false,
    refreshInterval: 60_000,
  });
}

function CrowdFaces({ faces, size = 26 }: { faces: LeapBoardView['faces']; size?: number }) {
  if (!faces.length) return null;
  return (
    <span className="flex shrink-0 items-center">
      {faces.map((indices, i) => (
        <span key={i} className={cn('relative', i > 0 && '-ml-2.5')} style={{ zIndex: faces.length - i }}>
          <BuddyFrogFace indices={indices} size={size} className="ring-2 ring-card" />
        </span>
      ))}
    </span>
  );
}

function crowdLine(board: LeapBoardView | null | undefined, league: string) {
  if (!board) return `Leaping in ${league}`;
  if (board.total !== null) {
    return `${board.total.toLocaleString()} frogs leaping in ${league}`;
  }
  const others = board.top.filter((entry) => !entry.isMe).map((entry) => entry.frogName);
  if (!others.length) {
    return board.myHops > 0 ? `You’re leading ${league}` : `Be the first frog leaping in ${league}`;
  }
  if (others.length === 1) return `${others[0]} is leaping with you`;
  if (others.length === 2) return `${others[0]} and ${others[1]} are leaping with you`;
  return `${others[0]}, ${others[1]} and others are leaping`;
}

const RANK_TONE = [
  'bg-amber-400 text-amber-950',
  'bg-slate-300 text-slate-800 dark:bg-slate-400',
  'bg-orange-300 text-orange-950',
];

function BoardRow({
  rank,
  name,
  indices,
  hops,
  isMe,
}: {
  rank: number;
  name: string;
  indices?: LeapBoardView['faces'][number];
  hops: number;
  isMe: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3.5 py-2.5',
        isMe && 'bg-[var(--season-tint,rgba(79,145,73,0.08))]',
      )}
    >
      <span
        className={cn(
          'grid h-7 min-w-7 shrink-0 place-items-center rounded-full px-1 text-[12.5px] font-black tabular-nums',
          rank <= 3 ? RANK_TONE[rank - 1] : 'text-muted-foreground',
        )}
      >
        {rank}
      </span>
      <BuddyFrogFace indices={indices} size={36} className="ring-2 ring-card" />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[14.5px] font-bold',
          isMe
            ? 'text-[var(--season-soft-text,#2f6b2c)] dark:text-[var(--season-soft-text-dark,#6ee7b7)]'
            : 'text-foreground',
        )}
      >
        {isMe ? 'You' : name}
      </span>
      <span className="shrink-0 text-[13px] font-black tabular-nums text-muted-foreground">
        {hops} {hops === 1 ? 'habit' : 'habits'}
      </span>
    </div>
  );
}

function SheetSection({
  title,
  right,
  subtitle,
  children,
}: {
  title: string;
  right?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="px-1 pb-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[19px] font-black tracking-tight text-foreground">{title}</h3>
          {right}
        </div>
        {subtitle ? (
          <div className="mt-0.5 text-[13px] font-semibold leading-snug text-muted-foreground">{subtitle}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function LeapGoalCard({ view }: { view: LeapView }) {
  const competing = leapHasHabits(view) && leapCompeting(view);
  const landed = view.week.leap.reached;
  const stay = leapStayMark(view);
  const prev = view.league > 0 ? leagueName(view, view.league - 1) : null;
  const atRisk = competing && !landed && !!stay && view.week.hops < stay && view.league > 0;

  return (
    <div className={QUEST_CARD_CLASS}>
      <LeapChestRow view={view} large />
      {atRisk && (
        <div className="flex items-center gap-2.5 border-t border-border/50 bg-rose-500/[0.06] px-3.5 py-2.5">
          <ChevronsDown className="h-4 w-4 shrink-0 text-rose-500" strokeWidth={3} />
          <span className="min-w-0 flex-1 text-[12.5px] font-bold leading-snug text-rose-600 dark:text-rose-300">
            Finish {habitsWord(stay)} to stay in {leagueName(view)}
            {prev ? `, or drop back to ${prev}` : ''}
          </span>
        </div>
      )}
      <PlusChestStrip view={view} />
    </div>
  );
}

function LeapBoardSection({ view, board }: { view: LeapView; board: LeapBoardView | null | undefined }) {
  const { indices } = useWardrobeIndices(true);
  const meInTop = !!board?.top.some((entry) => entry.isMe);
  return (
    <SheetSection
      title="Leaderboard"
      right={
        board && board.myHops > 0 ? (
          <span className="shrink-0 text-[13px] font-black text-muted-foreground">
            You’re #{board.myRank.toLocaleString()}
          </span>
        ) : null
      }
      subtitle={
        <span className="flex items-center gap-2">
          {board?.faces.length ? <CrowdFaces faces={board.faces} size={22} /> : null}
          <span className="min-w-0 truncate">{crowdLine(board, leagueName(view))}</span>
        </span>
      }
    >
      <div className={QUEST_CARD_CLASS}>
        {!board ? (
          <div className="px-3.5 py-6 text-center text-[13px] font-semibold text-muted-foreground">
            Loading the pond…
          </div>
        ) : board.top.length === 0 ? (
          <div className="px-3.5 py-6 text-center text-[13px] font-semibold text-muted-foreground">
            Finish a habit to be first on the board.
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {board.top.map((entry) => (
              <BoardRow
                key={entry.rank}
                rank={entry.rank}
                name={entry.frogName}
                indices={entry.isMe ? indices : entry.indices}
                hops={entry.hops}
                isMe={entry.isMe}
              />
            ))}
            {!meInTop && board.myHops > 0 && (
              <>
                <div className="py-1 text-center text-[13px] font-black leading-none text-muted-foreground/60">
                  ···
                </div>
                <BoardRow rank={board.myRank} name="You" indices={indices} hops={board.myHops} isMe />
              </>
            )}
          </div>
        )}
      </div>
    </SheetSection>
  );
}

const HOW_IT_WORKS: Array<{ title: string; body: string }> = [
  {
    title: 'Finish repeating tasks',
    body: 'Every repeating task you finish counts as one habit.',
  },
  {
    title: 'Hit the weekly goal',
    body: 'You win your league gift right away, with flies on top.',
  },
  {
    title: 'Move up for better gifts',
    body: 'Each week you hit the goal, you move up a league. Higher leagues hold better gifts.',
  },
];

function HowLeapWorks() {
  return (
    <SheetSection title="How it works">
      <ol className={cn(QUEST_CARD_CLASS, 'divide-y divide-border/40')}>
        {HOW_IT_WORKS.map((row, index) => (
          <li key={row.title} className="flex items-start gap-3 px-3.5 py-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--season-soft,rgba(79,145,73,0.12))] text-[13px] font-black text-[var(--season-soft-text,#2f6b2c)] dark:text-[var(--season-soft-text-dark,#6ee7b7)]">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-bold leading-tight text-foreground">{row.title}</span>
              <span className="mt-1 block text-[12.5px] font-semibold leading-snug text-muted-foreground">
                {row.body}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </SheetSection>
  );
}

const SEASON_VAR_NAMES = [
  '--season-band',
  '--season-band-lip',
  '--season-accent',
  '--season-accent-lip',
  '--season-on-accent',
  '--season-soft',
  '--season-soft-text',
  '--season-soft-text-dark',
  '--season-tint',
  '--season-fill',
  '--season-fill-strong',
  '--season-on-fill',
];

function readSeasonVars(el: HTMLElement | null): React.CSSProperties | undefined {
  if (!el) return undefined;
  const computed = getComputedStyle(el);
  const vars: Record<string, string> = {};
  SEASON_VAR_NAMES.forEach((name) => {
    const value = computed.getPropertyValue(name).trim();
    if (value) vars[name] = value;
  });
  return Object.keys(vars).length ? (vars as React.CSSProperties) : undefined;
}

function LilyIcon({
  index,
  box,
  width,
  className,
  imgClassName,
}: {
  index: number;
  box: number;
  width: number;
  className?: string;
  imgClassName?: string;
}) {
  const top = LILY_ART_TOP[Math.min(Math.max(0, index), LILY_ART_TOP.length - 1)] ?? 0;
  const lift = ((top + LILY_ART_BOTTOM) / 2) * 100;
  return (
    <span aria-hidden className={cn('relative block shrink-0', className)} style={{ width: box, height: box }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={leagueArt(index)}
        alt=""
        draggable={false}
        className={cn('absolute left-1/2 top-1/2 max-w-none select-none', imgClassName)}
        style={{ width, transform: `translate(-50%, -${lift}%)` }}
      />
    </span>
  );
}

const POND_SLIDE = 188;
const POND_ART_HEIGHT = (176 * 430) / 500;

function frogTop(index: number) {
  const top = LILY_ART_TOP[Math.min(Math.max(0, index), LILY_ART_TOP.length - 1)] ?? 0;
  return Math.round((top + 0.55 * (LILY_ART_BOTTOM - top)) * POND_ART_HEIGHT - 52);
}

function PondCarousel({
  view,
  onOpen,
}: {
  view: LeapView;
  onOpen: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const draggedRef = useRef(false);
  const { indices } = useWardrobeIndices(true);
  const [active, setActive] = useState(view.league);
  const best = Math.max(view.bestLeague, view.league);

  const onPointerDown = (event: React.PointerEvent) => {
    draggedRef.current = false;
    const el = ref.current;
    if (!el || event.pointerType !== 'mouse' || event.button !== 0) return;
    event.preventDefault();
    const originX = event.clientX;
    const originScroll = el.scrollLeft;
    const originIndex = Math.round(originScroll / POND_SLIDE);
    el.style.scrollSnapType = 'none';
    const drag = (move: PointerEvent) => {
      const dx = move.clientX - originX;
      if (Math.abs(dx) > 4) draggedRef.current = true;
      el.scrollLeft = originScroll - dx;
    };
    const release = (up: PointerEvent) => {
      window.removeEventListener('pointermove', drag);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      const dx = up.clientX - originX;
      const step = Math.abs(dx) > 40 ? (dx < 0 ? 1 : -1) : 0;
      const target = Math.min(view.leagues.length - 1, Math.max(0, originIndex + step));
      el.scrollTo({ left: target * POND_SLIDE, behavior: 'smooth' });
      window.setTimeout(() => {
        el.style.scrollSnapType = '';
      }, 420);
    };
    window.addEventListener('pointermove', drag);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollLeft = view.league * POND_SLIDE;
    setActive(view.league);
  }, [view.league]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / POND_SLIDE);
    const clamped = Math.min(view.leagues.length - 1, Math.max(0, next));
    if (clamped !== active) setActive(clamped);
  };

  const goTo = (index: number) => {
    const el = ref.current;
    if (!el) return;
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    if (index === active) {
      onOpen(index);
      return;
    }
    el.scrollTo({ left: index * POND_SLIDE, behavior: 'smooth' });
  };

  const competing = leapHasHabits(view) && leapCompeting(view);
  const subtitle =
    active === view.league
      ? competing
        ? `Your league · ${leapDaysLeft(view)} left`
        : leapRule(view)
      : active < view.league
        ? 'You’ve leaped past this one'
        : active <= best
          ? 'You’ve reached this before'
          : active === view.league + 1
            ? 'Next up · reach the weekly goal'
            : `Locked · league ${active + 1} of ${view.leagues.length}`;

  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[86px] h-[170px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(214,255,240,0.42),rgba(214,255,240,0.12)_55%,transparent)]"
      />
      <div
        ref={ref}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        className="no-scrollbar relative flex cursor-grab snap-x snap-mandatory overflow-x-auto overscroll-x-contain pb-7 pt-2 active:cursor-grabbing"
        style={{ paddingInline: `calc(50% - ${POND_SLIDE / 2}px)` }}
      >
        {view.leagues.map((league, index) => {
          const isActive = index === active;
          const locked = index > best;
          return (
            <button
              key={index}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`${league.label} League`}
              aria-current={index === view.league ? 'true' : undefined}
              className="relative grid h-[156px] shrink-0 snap-center place-items-end justify-center"
              style={{ width: POND_SLIDE }}
            >
              <span
                aria-hidden
                className={cn(
                  'absolute bottom-[6px] left-1/2 h-[20px] w-[140px] -translate-x-1/2 rounded-[50%] bg-[rgba(6,38,48,0.32)] blur-[6px] transition-opacity duration-300',
                  !isActive && 'opacity-0',
                )}
              />
              <span
                className={cn(
                  'relative block transition-[transform,opacity,filter] duration-300 ease-out',
                  isActive ? 'scale-100 opacity-100' : 'scale-[0.62] opacity-60',
                )}
              >
                <span className={cn('relative block', index === view.league && 'leap-pond-bob')}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={leagueArt(index)}
                    alt=""
                    draggable={false}
                    className={cn(
                      'block w-[176px] max-w-none select-none drop-shadow-[0_10px_14px_rgba(6,38,48,0.35)]',
                      locked && 'brightness-[0.55] contrast-[0.95] grayscale',
                    )}
                  />
                  {index === view.league && (
                    <span
                      className="absolute -translate-x-1/2"
                      style={{ left: index === 0 ? '50%' : '30%', top: `${frogTop(index)}px` }}
                    >
                      <BuddyFrogFace
                        indices={indices}
                        size={52}
                        className="ring-[3px] ring-white shadow-[0_6px_12px_rgba(6,38,48,0.4)]"
                      />
                    </span>
                  )}
                </span>
                {locked && (
                  <span className="absolute bottom-3 right-4 grid h-9 w-9 place-items-center rounded-full bg-[#14505f] text-white ring-[3px] ring-white/80 shadow-[0_3px_8px_rgba(6,38,48,0.35)]">
                    <Lock className="h-4 w-4" strokeWidth={3} />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="-mt-4 flex items-center justify-center gap-1.5" aria-hidden>
        {view.leagues.map((_, index) => (
          <span
            key={index}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              index === active ? 'w-5 bg-white' : 'w-1.5 bg-white/35',
            )}
          />
        ))}
      </div>

      <div className="px-4 pt-3 text-center md:px-6">
        <h2
          id="leap-league-title"
          className="text-[28px] font-black leading-tight tracking-tight text-white [text-shadow:0_2px_0_rgba(6,38,48,0.25)]"
        >
          {leagueTitle(leagueName(view, active))}
        </h2>
        <p className="mt-1 text-[13.5px] font-semibold leading-snug text-white/80">{subtitle}</p>
      </div>
    </div>
  );
}

function PondJourney({ view }: { view: LeapView }) {
  const { indices } = useWardrobeIndices(true);
  const competing = leapHasHabits(view) && leapCompeting(view);
  const target = leapTarget(view);
  if (!competing || target <= 0) return null;
  const hops = view.week.hops;
  const landed = view.week.leap.reached;
  const nextIndex = Math.min(view.league + 1, view.leagues.length - 1);
  const top = nextIndex === view.league;
  const next = nextLeagueName(view);
  const pct = Math.min(100, Math.round((100 * hops) / target));
  const left = Math.max(0, target - hops);
  const caption = landed
    ? next
      ? `Promotion locked in · moving up to ${next}`
      : 'Top prize won this week'
    : next
      ? `${habitsWord(left)} more to reach ${next}`
      : `${habitsWord(left)} more for the top prize`;
  return (
    <div className="mx-auto mt-5 w-full max-w-[24rem] px-4">
      <div className="rounded-[22px] bg-white/[0.14] px-3.5 pb-3 pt-3.5 ring-1 ring-white/15 backdrop-blur-[2px]">
        <div className="flex items-center gap-2">
          <LilyIcon index={view.league} box={46} width={50} imgClassName="drop-shadow-[0_3px_4px_rgba(6,38,48,0.3)]" />
          <div className="relative h-3.5 flex-1 rounded-full bg-[rgba(6,38,48,0.32)]">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#9be37c] to-[#c9f57a] shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] transition-[width] duration-700"
              style={{ width: `${pct}%` }}
            />
            <span
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-700"
              style={{ left: `clamp(14px, ${pct}%, calc(100% - 14px))` }}
            >
              <BuddyFrogFace indices={indices} size={30} className="ring-[3px] ring-white shadow-[0_3px_6px_rgba(6,38,48,0.35)]" />
            </span>
          </div>
          <LilyIcon
            index={top ? view.league : nextIndex}
            box={46}
            width={50}
            imgClassName={cn('drop-shadow-[0_3px_4px_rgba(6,38,48,0.3)]', !landed && !top && 'opacity-75 saturate-[0.6]')}
          />
        </div>
        <div className="mt-2.5 flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-bold text-white/85">{caption}</span>
          <span className="shrink-0 text-[13px] font-black tabular-nums text-white">
            {hops}/{target}
          </span>
        </div>
      </div>
    </div>
  );
}

function LeapLeagueSheet({
  view,
  board,
  open,
  onClose,
  seasonVars,
}: {
  view: LeapView;
  board: LeapBoardView | null | undefined;
  open: boolean;
  onClose: () => void;
  seasonVars?: React.CSSProperties;
}) {
  const reduceMotion = useReducedMotion();
  const [picked, setPicked] = useState<number | null>(null);
  useRegisterOpenSheet(open);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && picked === null) onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, picked]);

  if (typeof document === 'undefined') return null;
  const total = view.leagues.length;

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            key="leap-league"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leap-league-title"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            className="leap-stage fixed inset-0 z-[1310] flex flex-col overflow-hidden bg-background"
            style={seasonVars}
          >
            <div className="no-scrollbar min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain">
              <div className="leap-pond relative" style={{ background: 'var(--leap-water)' }}>
                <PondBackdrop className="absolute inset-0 -z-10 h-full w-full" />
                <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-[rgba(26,112,122,0.5)] via-[rgba(22,96,112,0.74)] to-[rgba(18,78,98,0.9)] dark:from-[rgba(14,58,68,0.7)] dark:to-[rgba(10,40,54,0.94)]" />
                <PondLife />
                <div className="mx-auto w-full max-w-[36rem] pb-10 pt-[calc(0.75rem+env(safe-area-inset-top))] md:pb-12 md:pt-8">
                  <div className="flex items-center justify-between gap-2 px-4 md:px-6">
                    <span className="inline-flex h-7 items-center rounded-full bg-[var(--leap-chip)] px-2.5 text-[11.5px] font-black uppercase tracking-[0.08em] text-white">
                      Weekly Leap · League {view.league + 1} of {total}
                    </span>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close Weekly Leap"
                      className="grid h-11 w-11 shrink-0 touch-manipulation place-items-center rounded-full bg-[var(--leap-card)] text-[var(--leap-ink)] shadow-[0_2px_0_var(--leap-card-shadow)] ring-1 ring-[var(--leap-card-line)] transition-transform active:scale-95"
                    >
                      <X className="h-5 w-5" strokeWidth={2.75} />
                    </button>
                  </div>

                  <PondCarousel view={view} onOpen={setPicked} />

                  <PondJourney view={view} />

                  <div className="px-4 text-center md:px-6">
                    <div className="mt-5 flex items-center justify-center gap-2">
                      {view.shields.count > 0 && (
                        <button
                          type="button"
                          onClick={() => openShieldSheet(null, 'leap')}
                          className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--leap-chip)] pl-0.5 pr-3 text-[12.5px] font-black tabular-nums text-[var(--leap-ink)] transition active:scale-95"
                        >
                          <Icon name="lilyPad" className="h-7 w-7" />
                          {view.shields.count}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPicked(view.league)}
                        className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--leap-card)] px-3 text-[12.5px] font-black text-[var(--leap-ink)] shadow-[0_2px_0_var(--leap-card-shadow)] ring-1 ring-[var(--leap-card-line)] transition active:scale-95"
                      >
                        League gifts
                        <ChevronRight className="h-3.5 w-3.5" strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative z-10 -mt-6 rounded-t-[28px] bg-background shadow-[0_-10px_24px_-16px_rgba(15,23,42,0.4)] dark:shadow-[0_-10px_24px_-14px_rgba(0,0,0,0.8)]">
                <div className="mx-auto flex w-full max-w-[36rem] flex-col gap-7 px-3 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-5 md:px-6">
                  <SheetSection title="This week’s goal">
                    <LeapGoalCard view={view} />
                  </SheetSection>
                  <LeapBoardSection view={view} board={board} />
                  <HowLeapWorks />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <LeapLeaguesSheet
        view={view}
        open={open && picked !== null}
        focus={picked ?? view.league}
        onClose={() => setPicked(null)}
        seasonal
        style={seasonVars}
      />
    </>,
    document.body,
  );
}

export function LeapLeagueCard() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { data: view } = useLeapView();
  const enabled = !!view?.enabled && !!view.leagues.length;
  const { data: boardData } = useLeapBoard(enabled);
  const board = boardData?.board;
  const [open, setOpen] = useState(false);
  const [seasonVars, setSeasonVars] = useState<React.CSSProperties | undefined>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void preloadFrogFile();
      void preloadGiftFile();
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash !== '#leap') return;
    const timer = window.setTimeout(() => {
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      history.replaceState(null, '', window.location.pathname);
    }, 250);
    return () => window.clearTimeout(timer);
  }, []);

  if (!view || !enabled) return null;
  const hasHabits = leapHasHabits(view);
  const league = leagueTitle(leagueName(view));
  const openSheet = () => {
    setSeasonVars(readSeasonVars(ref.current));
    setOpen(true);
  };

  return (
    <div ref={ref} id="leap">
      <QuestSectionHeader
        title="Weekly Leap"
        right={
          hasHabits ? (
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap pr-1 text-[12px] font-black tabular-nums text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.75} />
              {leapDaysLeft(view)}
            </span>
          ) : null
        }
      />
      <div className={cn(QUEST_CARD_CLASS, 'leap-stage')}>
        <div onClick={openSheet} className="cursor-pointer">
          <LeapChestRow view={view} />
        </div>
        <PlusChestStrip view={view} />
        <button
          type="button"
          onClick={openSheet}
          aria-label={`Open the ${league}`}
          className="flex w-full touch-manipulation items-center gap-2.5 border-t border-border/50 bg-foreground/[0.025] py-2 pl-2.5 pr-3 text-left transition-colors duration-150 active:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        >
          <LilyIcon index={view.league} box={36} width={34} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13.5px] font-black leading-tight text-foreground">{league}</span>
            <span className="truncate text-[12px] font-semibold leading-tight text-muted-foreground">
              {crowdLine(board, leagueName(view))}
            </span>
          </span>
          {board?.faces.length ? <CrowdFaces faces={board.faces} size={24} /> : null}
          {board && board.myHops > 0 ? (
            <span className="shrink-0 rounded-full bg-[var(--season-soft,rgba(79,145,73,0.12))] px-2 py-0.5 text-[12px] font-black tabular-nums text-[var(--season-soft-text,#2f6b2c)] dark:text-[var(--season-soft-text-dark,#6ee7b7)]">
              #{board.myRank.toLocaleString()}
            </span>
          ) : null}
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.75} />
        </button>
      </div>

      <LeapLeagueSheet
        view={view}
        board={board}
        open={open}
        onClose={() => setOpen(false)}
        seasonVars={seasonVars}
      />
    </div>
  );
}
