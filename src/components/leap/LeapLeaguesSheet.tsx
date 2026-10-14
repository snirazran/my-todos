'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { Icon } from '@/components/ui/Icon';
import type { BonusRewards, LeapLeagueView, LeapView } from '@/lib/leap/types';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useUIStore } from '@/lib/uiStore';
import { cn } from '@/lib/utils';
import { leagueArt, leagueTitle } from './leapCopy';
import { LeapPrizeTile, waitingPlusLeagues } from './LeapPrizeTile';
import { LeapPlusButton } from './LeapPlusButton';

const GRID = 'grid grid-cols-[52px_minmax(0,1fr)_minmax(0,1.12fr)] gap-x-2.5';

type PrizeTab = 'unlock' | 'weekly';

const TABS: Array<{ id: PrizeTab; label: string; note: string }> = [
  { id: 'unlock', label: 'Unlock', note: 'Yours once, the first time you reach a league.' },
  { id: 'weekly', label: 'Every week', note: 'Yours every week you reach the promotion zone.' },
];

function prizesFor(league: LeapLeagueView, tab: PrizeTab): { free: BonusRewards; plus: BonusRewards } {
  if (tab === 'unlock') return { free: league.reachRewards, plus: league.plusReachRewards };
  const flies: BonusRewards = league.weekFlies > 0 ? [{ type: 'FLIES', amount: league.weekFlies }] : [];
  return {
    free: [...flies, ...league.weekRewards],
    plus: [...flies, ...league.plusWeekRewards],
  };
}

export function LeapLeaguesSheet({
  view,
  open,
  focus,
  onClose,
}: {
  view: LeapView;
  open: boolean;
  focus: number;
  onClose: () => void;
}) {
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const setPremiumModalOpen = useUIStore((state) => state.setPremiumModalOpen);
  const [tab, setTab] = useState<PrizeTab>('unlock');
  const waiting = waitingPlusLeagues(view).length;
  const last = view.leagues.length - 1;
  const active = TABS.find((entry) => entry.id === tab) ?? TABS[0];
  const narrow = useMediaQuery('(max-width: 380px)');

  useEffect(() => {
    if (!open) return;
    setTab('unlock');
    const timer = window.setTimeout(() => {
      rowRefs.current[focus]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 320);
    return () => window.clearTimeout(timer);
  }, [open, focus]);

  const getPlus = () => {
    onClose();
    window.setTimeout(() => setPremiumModalOpen(true, 'leap_leagues'), 260);
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      zIndex={1320}
      className="select-none max-h-[calc(100dvh-2.5rem)] sm:max-h-[min(46rem,calc(100dvh-3rem))] sm:max-w-[460px]"
      closeAriaLabel="Close"
    >
      {({ bindScroll }) => (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-4 pt-3 sm:px-5 sm:pt-7">
            <h2 className="px-1 text-[20px] font-black tracking-tight text-foreground">
              League prizes
            </h2>

            <div
              role="tablist"
              aria-label="Prize type"
              className="mt-3 grid grid-cols-2 gap-1 rounded-[14px] bg-muted/70 p-1"
            >
              {TABS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === entry.id}
                  onClick={() => setTab(entry.id)}
                  className={cn(
                    'relative h-9 rounded-[10px] text-[13.5px] font-black transition-colors',
                    tab === entry.id ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {tab === entry.id && (
                    <motion.span
                      layoutId="leap-prize-tab"
                      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                      className="absolute inset-0 rounded-[10px] bg-card shadow-sm"
                    />
                  )}
                  <span className="relative">{entry.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 px-1 text-[12.5px] font-semibold text-muted-foreground">
              {active.note}
            </p>
          </div>

          <div
            ref={bindScroll}
            className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 pb-3 sm:px-5"
          >
            <div className="relative mt-3">
              <div
                aria-hidden="true"
                className={cn(GRID, 'pointer-events-none absolute inset-0 px-1')}
              >
                <span className="col-start-3 rounded-[20px] bg-gradient-to-b from-[#fff6d6] to-[#ffeaa8] ring-1 ring-amber-300/70 dark:from-amber-400/15 dark:to-amber-500/10 dark:ring-amber-400/30" />
              </div>

              <div className={cn(GRID, 'relative items-center px-1 pb-1 pt-2.5')}>
                <span />
                <span className="text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">
                  Free
                </span>
                <span className="flex items-center justify-center gap-1 text-[11px] font-black uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300">
                  <Icon name="frogPlus" label="Plus" className="h-6 w-6" />
                  Plus bonus
                </span>
              </div>

              {view.leagues.map((league, index) => {
                const current = index === view.league;
                const locked = !league.reached && !current;
                const next = locked && index === view.league + 1;
                const unlocked = tab === 'unlock' && league.reached && index > 0;
                const plusDone = unlocked && view.isPremium;
                const { free, plus } = prizesFor(league, tab);
                return (
                  <div
                    key={league.label}
                    ref={(el) => {
                      rowRefs.current[index] = el;
                    }}
                    className={cn('relative px-1 py-3', index === last && 'pb-4')}
                  >
                    <div className={cn(GRID, 'items-center')}>
                      <span className="relative row-span-2 flex flex-col items-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={leagueArt(index)}
                          alt=""
                          aria-hidden="true"
                          draggable={false}
                          className={cn(
                            'h-11 w-[52px] object-contain',
                            locked &&
                              'opacity-50 grayscale contrast-75 brightness-110 dark:opacity-40 dark:brightness-90',
                            next &&
                              'drop-shadow-[0_0_5px_rgba(202,138,4,0.9)] dark:drop-shadow-[0_0_4px_rgba(245,179,1,0.5)]',
                          )}
                        />
                        {locked && (
                          <span
                            aria-hidden="true"
                            className="absolute left-1/2 top-[22px] grid h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-muted-foreground text-card shadow-[0_1px_3px_rgba(0,0,0,0.18)] ring-[1.5px] ring-card"
                          >
                            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5">
                              <path
                                d="M8 11V8a4 4 0 0 1 8 0v3"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={3}
                                strokeLinecap="round"
                              />
                              <rect x="4.5" y="10" width="15" height="11.5" rx="3" fill="currentColor" />
                            </svg>
                          </span>
                        )}
                      </span>
                      <p
                        className={cn(
                          'col-span-2 flex min-w-0 items-center gap-1.5 text-[14px] font-black leading-tight',
                          locked ? 'text-muted-foreground' : 'text-foreground',
                        )}
                      >
                        <span className="truncate">{leagueTitle(league.label)}</span>
                        {locked && <span className="sr-only">, locked</span>}
                        {current && (
                          <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-wide text-primary-foreground">
                            You
                          </span>
                        )}
                      </p>
                      {free.length + plus.length > 0 ? (
                        <>
                          <span className="mt-2 flex items-center gap-1.5 pb-1.5">
                            {free.map((reward, i) => (
                              <LeapPrizeTile
                                key={`${tab}-f${i}`}
                                reward={reward}
                                view={view}
                                size={narrow ? 'sm' : 'md'}
                                offset={index + i}
                                done={unlocked}
                              />
                            ))}
                          </span>
                          <span className="relative mt-2 flex items-center justify-center gap-1.5 pb-1.5">
                            {plus.length > 0 && (
                              <span
                                aria-hidden="true"
                                className="absolute -left-[17px] top-[calc(50%-3px)] z-20 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-amber-400 text-amber-950 shadow-sm ring-2 ring-card"
                              >
                                <Plus className="h-3.5 w-3.5" strokeWidth={3.5} />
                              </span>
                            )}
                            {plus.map((reward, i) => (
                              <LeapPrizeTile
                                key={`${tab}-p${i}`}
                                reward={reward}
                                view={view}
                                size={narrow ? 'md' : 'lg'}
                                offset={index + i + 2}
                                done={plusDone}
                              />
                            ))}
                          </span>
                        </>
                      ) : (
                        <span className="col-span-2 mt-1 text-[12px] font-bold text-muted-foreground">
                          Everyone starts here
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {!view.isPremium && (
            <div className="shrink-0 border-t border-border/60 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:px-5 sm:pb-5">
              <LeapPlusButton
                title={waiting > 0 ? `${waiting} Plus ${waiting === 1 ? 'prize' : 'prizes'} waiting` : 'Unlock Plus prizes'}
                subtitle={waiting > 0 ? 'You already earned them. Claim with Plus.' : 'Double the prizes at every league'}
                onClick={getPlus}
              />
            </div>
          )}
          {view.isPremium && <div className="h-[calc(env(safe-area-inset-bottom)+0.5rem)] shrink-0" />}
        </div>
      )}
    </BaseSheet>
  );
}
