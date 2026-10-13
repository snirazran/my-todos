'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { Icon } from '@/components/ui/Icon';
import type { BonusRewards, LeapLeagueView, LeapView } from '@/lib/leap/types';
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
      className="select-none sm:max-w-[460px]"
      closeAriaLabel="Close"
    >
      {() => (
        <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-5 sm:px-5 sm:pb-5 sm:pt-7">
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
                    <span className="row-span-2 flex flex-col items-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={leagueArt(index)}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        className="h-11 w-[52px] object-contain"
                      />
                    </span>
                    <p className="col-span-2 flex min-w-0 items-center gap-1.5 text-[14px] font-black leading-tight text-foreground">
                      <span className="truncate">{leagueTitle(league.label)}</span>
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
                              size="lg"
                              offset={index + i + 2}
                              done={plusDone}
                              bonus
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

          {!view.isPremium && (
            <LeapPlusButton
              className="mt-4"
              title={waiting > 0 ? `${waiting} Plus ${waiting === 1 ? 'prize' : 'prizes'} waiting` : 'Unlock Plus prizes'}
              subtitle={waiting > 0 ? 'You already earned them. Claim with Plus.' : 'Double the prizes at every league'}
              onClick={getPlus}
            />
          )}
        </div>
      )}
    </BaseSheet>
  );
}
