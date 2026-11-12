'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Lock, X } from 'lucide-react';
import { BuddyFrogFace } from '@/components/ui/BuddyBadge';
import { SeasonLanePill, SeasonRewardTile, SeasonSparkles } from '@/components/ui/QuestsPanel';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import type { QuestReward } from '@/lib/quests/types';
import type { BonusReward, BonusRewards, LeapLeagueView, LeapView } from '@/lib/leap/types';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useUIStore } from '@/lib/uiStore';
import { cn } from '@/lib/utils';
import { leagueArt, leapPlusChestWaiting, leapTarget } from './leapCopy';
import { LeapPlusButton } from './LeapPlusButton';
import { PondBackdrop } from '@/components/ui/PondBackdrop';
import { PondLife } from './PondLife';
import { LILY_ART_BOTTOM, LILY_ART_TOP } from './LeapRail';

type Lane = 'free' | 'plus';
type Catalog = Parameters<typeof SeasonRewardTile>[0]['rewardCatalog'];

type RowState = 'here' | 'reached' | 'next' | 'locked';

const STATE_LABEL: Record<RowState, string> = {
  here: 'You are here',
  reached: 'Reached',
  next: 'Next league',
  locked: 'Locked',
};

function shuffled<T>(list: T[]) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

function LaneTile({
  reward,
  view,
  lane,
  paused,
  offset,
  compact = false,
  tagRight = false,
}: {
  reward: BonusReward;
  view: LeapView;
  lane: Lane;
  paused: boolean;
  offset: number;
  compact?: boolean;
  tagRight?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const catalog = view.rewardCatalog as unknown as Catalog;
  const [order] = useState(() =>
    reward.type === 'RARITY_ITEM' ? shuffled(view.rarityPreview?.[reward.rarity] ?? []) : [],
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduceMotion || order.length < 2) return;
    let interval = 0;
    const advance = () => setIndex((value) => (value + 1) % order.length);
    const start = window.setTimeout(() => {
      advance();
      interval = window.setInterval(advance, 2400);
    }, 900 + (offset % 4) * 420);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(interval);
    };
  }, [order.length, offset, reduceMotion]);

  if (!order.length) {
    const shown: QuestReward =
      reward.type === 'RARITY_ITEM' ? { type: 'BOX' } : (reward as unknown as QuestReward);
    return (
      <SeasonRewardTile
        reward={shown}
        rewardCatalog={catalog}
        lane={lane}
        paused={paused}
        compact={compact}
        oversample={compact ? 2 : 1}
        tagRight={tagRight}
        flyScale={0.82}
      />
    );
  }

  const entry = order[index % order.length];
  const shown: QuestReward =
    entry.kind === 'background'
      ? { type: 'BACKGROUND', backgroundId: entry.id }
      : { type: 'ITEM', itemId: entry.id };

  return (
    <div className="grid">
      <AnimatePresence initial={false}>
        <motion.div
          key={`${entry.kind}:${entry.id}`}
          className="[grid-area:1/1]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <SeasonRewardTile
            reward={shown}
            rewardCatalog={catalog}
            lane={lane}
            paused
            compact={compact}
            oversample={compact ? 2 : 1}
            tagRight={tagRight}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function LaneCell({
  lane,
  rewards,
  view,
  offset,
  paused,
  muted,
  done,
  locked,
  glow,
  sparkle,
  onPlus,
}: {
  lane: Lane;
  rewards: BonusRewards;
  view: LeapView;
  offset: number;
  paused: boolean;
  muted: boolean;
  done: boolean;
  locked: boolean;
  glow: boolean;
  sparkle: boolean;
  onPlus?: () => void;
}) {
  if (rewards.length === 0) return <div />;
  const flies = rewards.reduce(
    (sum, reward) => (reward.type === 'FLIES' ? sum + Math.max(0, reward.amount ?? 0) : sum),
    0,
  );
  const tiles: BonusRewards = [
    ...rewards.filter((reward) => reward.type !== 'FLIES'),
    ...(flies > 0 ? [{ type: 'FLIES' as const, amount: flies }] : []),
  ];
  const badge = done ? (
    <span className="absolute -bottom-1.5 -right-1.5 z-20 grid h-6 w-6 place-items-center rounded-full bg-[#4f9149] shadow-[0_2px_0_#356b30] ring-[3px] ring-background">
      <Check className="h-3.5 w-3.5 text-white" strokeWidth={4} />
    </span>
  ) : locked ? (
    <span className="absolute -bottom-1.5 -right-1.5 z-20 grid h-6 w-6 place-items-center rounded-full bg-gradient-to-b from-[#ffe28d] to-[#f2b83d] shadow-[0_2px_0_#b7791f] ring-[3px] ring-background">
      <Lock className="h-3 w-3 text-[#6b4a12]" strokeWidth={3} />
    </span>
  ) : null;
  const body = tiles.map((reward, index) => (
    <span key={index} className="relative block aspect-square w-[var(--tile)]">
      {index === 0 && glow && (
        <span
          aria-hidden="true"
          className="absolute -inset-1.5 rounded-[20px] bg-amber-300/45 animate-ping-ring motion-reduce:hidden dark:hidden"
        />
      )}
      {index === 0 && sparkle && <SeasonSparkles />}
      <LaneTile reward={reward} view={view} lane={lane} paused={paused} offset={offset + index} />
      {index === tiles.length - 1 && badge}
    </span>
  ));
  const shell = cn(
    'flex flex-wrap items-start justify-center gap-x-2.5 gap-y-5',
    muted && 'saturate-[0.85]',
  );
  return onPlus ? (
    <button
      type="button"
      onClick={onPlus}
      aria-label="Add the Plus gift"
      className={cn(
        shell,
        'touch-manipulation rounded-[16px] transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-4 focus-visible:ring-offset-background',
      )}
    >
      {body}
    </button>
  ) : (
    <div className={shell}>{body}</div>
  );
}

const LILY_INK_PX = 30;

function LilyArt({ index, dim }: { index: number; dim: boolean }) {
  const top = LILY_ART_TOP[Math.min(index, LILY_ART_TOP.length - 1)] ?? 0;
  const ink = LILY_ART_BOTTOM - top;
  const height = Math.min(LILY_INK_PX / ink, 46);
  const shift = (top + LILY_ART_BOTTOM) / 2 - 0.5;
  return (
    <span aria-hidden="true" className="relative block h-10 w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={leagueArt(index)}
        alt=""
        draggable={false}
        className={cn(
          'absolute left-1/2 top-1/2 w-auto max-w-none',
          dim && 'opacity-55 grayscale brightness-[0.92]',
        )}
        style={{ height, transform: `translate(-50%, ${(-0.5 - shift) * 100}%)` }}
      />
    </span>
  );
}

function TrackHalf({ side, fill }: { side: 'top' | 'bottom'; fill: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute left-1/2 w-[6px] -translate-x-1/2 overflow-hidden bg-[var(--leap-track)]',
        side === 'top' ? 'top-0 h-1/2' : '-bottom-px h-[calc(50%+1px)]',
      )}
    >
      <span
        className="absolute inset-x-0 top-0 bg-[#5fa654] transition-[height] duration-500"
        style={{ height: `${Math.max(0, Math.min(1, fill)) * 100}%` }}
      />
    </span>
  );
}

export function LeapLeaguesSheet({
  view,
  open,
  focus,
  onClose,
  seasonal = false,
  style,
}: {
  view: LeapView;
  open: boolean;
  focus: number;
  onClose: () => void;
  seasonal?: boolean;
  style?: React.CSSProperties;
}) {
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const setPremiumModalOpen = useUIStore((state) => state.setPremiumModalOpen);
  const { indices } = useWardrobeIndices(open);
  const plusWaiting = leapPlusChestWaiting(view);
  const order = view.leagues.map((league, index) => ({ league, index }));
  const target = leapTarget(view);
  const weekProgress = target > 0 ? Math.min(1, view.week.hops / target) : 0;
  const reduceMotion = useReducedMotion();
  useRegisterOpenSheet(open);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      rowRefs.current[focus]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [open, focus]);

  const getPlus = () => {
    setPremiumModalOpen(true, 'leap_leagues');
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="leap-prizes"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leap-prizes-title"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 28 }}
          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          className="leap-stage fixed inset-0 z-[1320] flex select-none flex-col overflow-hidden bg-background"
          style={style}
        >
          <div className={cn('relative shrink-0', seasonal && 'leap-pond')} style={{ background: 'var(--leap-water)' }}>
            {seasonal && (
              <>
                <PondBackdrop className="absolute inset-0 -z-10 h-full w-full" />
                <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-[rgba(10,52,64,0.72)] via-[rgba(14,70,84,0.5)] to-[rgba(14,70,84,0.3)] dark:from-black/70 dark:to-black/40" />
                <PondLife scene className="-z-10" />
              </>
            )}
            <div className="mx-auto w-full max-w-[36rem] px-4 pb-10 pt-[calc(1rem+env(safe-area-inset-top))] md:px-6 md:pb-12 md:pt-10">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close league gifts"
                className="absolute right-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-20 grid h-11 w-11 touch-manipulation place-items-center rounded-full bg-[var(--leap-card)] text-[var(--leap-ink)] shadow-[0_2px_0_var(--leap-card-shadow)] ring-1 ring-[var(--leap-card-line)] transition-transform active:scale-95 md:right-6 md:top-6"
              >
                <X className="h-5 w-5" strokeWidth={2.75} />
              </button>
              <h2
                id="leap-prizes-title"
                className="pr-12 text-[28px] font-black leading-tight tracking-tight text-[var(--leap-ink)] [text-shadow:0_1px_0_rgba(10,52,64,0.6),0_2px_12px_rgba(0,0,0,0.35)]"
              >
                League gifts
              </h2>
              <p className="mt-1 max-w-[26ch] text-[14.5px] font-bold leading-snug text-white [text-shadow:0_1px_0_rgba(10,52,64,0.6),0_2px_10px_rgba(0,0,0,0.35)]">
                Hit your weekly goal to win your league’s gift.
              </p>
            </div>
          </div>

          <div className="relative z-10 -mt-6 flex min-h-0 flex-1 flex-col rounded-t-[28px] bg-background shadow-[0_-10px_24px_-16px_rgba(15,23,42,0.4)] dark:shadow-[0_-10px_24px_-14px_rgba(0,0,0,0.8)]">
            <div className="no-scrollbar min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain">
              <div className="w-full [--tile:clamp(3.75rem,17vw,4.75rem)] md:[--tile:5.75rem]">
                <div className="sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-center gap-x-3 rounded-t-[28px] border-b border-border/50 bg-background px-[max(1.25rem,calc((100%_-_32rem)/2_+_1.25rem))] pb-3 pt-5 [@media(max-width:379px)]:px-3">
                  <div className="flex justify-center">
                    <SeasonLanePill lane="free" />
                  </div>
                  <div />
                  <div className="flex justify-center">
                    <SeasonLanePill
                      lane="plus"
                      isPremium={view.isPremium}
                      onUpgrade={view.isPremium ? undefined : getPlus}
                    />
                  </div>
                </div>

                {order.map(({ league, index }, position) => {
                  const reachedRow = index <= view.league || league.reached;
                  const state: RowState =
                    index === view.league
                      ? 'here'
                      : reachedRow
                        ? 'reached'
                        : index === view.league + 1
                          ? 'next'
                          : 'locked';
                  const mine = index === view.week.chest.league && view.week.chest.landed;
                  const freeDone = mine && view.week.chest.claimed;
                  const plusDone = mine && view.isPremium && view.week.chest.plusClaimed;
                  const plusGlow = mine && plusWaiting;
                  const free = league.weekRewards;
                  const plus = league.plusWeekRewards;
                  const above = order[position - 1];
                  const below = order[position + 1];
                  const segment = (row: { league: LeapLeagueView; index: number }) =>
                    row.index <= view.league || row.league.reached
                      ? 1
                      : row.index === view.league + 1
                        ? weekProgress
                        : 0;
                  const topFill = above ? segment({ league, index }) * 2 - 1 : 0;
                  const bottomFill = below ? Math.min(1, segment(below) * 2) : 0;
                  const empty = free.length + plus.length === 0;
                  const short = league.label.replace(/^Lily\s+/, '');
                  return (
                    <div
                      key={league.label}
                      ref={(el) => {
                        rowRefs.current[index] = el;
                      }}
                      className={cn(
                        'relative grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-center gap-x-3 border-b border-border/50 px-[max(1.25rem,calc((100%_-_32rem)/2_+_1.25rem))] last:border-b-0 [@media(max-width:379px)]:px-3',
                        empty ? 'py-5' : 'pb-5 pt-7',
                        state === 'here' && 'bg-[#4f9149]/[0.07] dark:bg-emerald-400/[0.06]',
                      )}
                    >
                      {above && <TrackHalf side="top" fill={topFill} />}
                      {below && <TrackHalf side="bottom" fill={bottomFill} />}

                      <div className="flex w-full justify-center">
                        <LaneCell
                          lane="free"
                          rewards={free}
                          view={view}
                          offset={index}
                          paused={state !== 'here'}
                          muted={state === 'locked'}
                          done={freeDone}
                          locked={false}
                          glow={false}
                          sparkle={false}
                        />
                      </div>

                      <div className="relative z-20 flex justify-center">
                        <div
                          className={cn(
                            'relative flex w-[4.5rem] flex-col items-center rounded-[14px] px-1 pb-1.5 pt-1 leading-none',
                            state === 'here'
                              ? 'bg-[#4f9149] text-white shadow-[0_3px_0_#356b30]'
                              : state === 'next'
                                ? 'bg-card text-amber-800 shadow-[0_2px_0_rgba(15,23,42,0.07)] ring-2 ring-amber-400 dark:text-amber-200'
                                : state === 'reached'
                                  ? 'bg-card text-[#2f6b2c] shadow-[0_2px_0_rgba(15,23,42,0.07)] ring-1 ring-border/60 dark:text-emerald-300'
                                  : 'bg-card text-muted-foreground ring-1 ring-border/60',
                          )}
                        >
                          {state === 'here' ? (
                            <span className="grid h-10 w-10 place-items-center">
                              <BuddyFrogFace indices={indices} size={34} className="ring-2 ring-white/80" />
                            </span>
                          ) : (
                            <LilyArt index={index} dim={state === 'locked'} />
                          )}
                          <span className="mt-0.5 max-w-full truncate text-[12.5px] font-black">{short}</span>
                          <span className="sr-only">{STATE_LABEL[state]}</span>
                        </div>
                      </div>

                      <div className="flex w-full justify-center">
                        <LaneCell
                          lane="plus"
                          rewards={plus}
                          view={view}
                          offset={index + 2}
                          paused={state !== 'here' && !plusGlow}
                          muted={state === 'locked'}
                          done={plusDone}
                          locked={!view.isPremium}
                          glow={plusGlow}
                          sparkle={!view.isPremium || plusGlow}
                          onPlus={view.isPremium ? undefined : getPlus}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {!view.isPremium && (
              <div className="shrink-0 border-t border-border/60 bg-background">
                <div className="mx-auto w-full max-w-[36rem] px-4 pb-[calc(env(safe-area-inset-bottom)+0.875rem)] pt-1 md:px-6 md:pb-6">
                  <LeapPlusButton
                    title={plusWaiting ? 'Your Plus gift is waiting' : 'Open two gifts every week'}
                    subtitle={plusWaiting ? 'You already earned it this week' : 'One for your goal, one more with Plus'}
                    onClick={getPlus}
                  />
                </div>
              </div>
            )}
            {view.isPremium && <div className="h-[env(safe-area-inset-bottom)] shrink-0" />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
