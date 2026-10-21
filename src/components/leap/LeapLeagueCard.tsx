'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Clock, Play } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { FlyAmount } from '@/components/ui/FlyAmount';
import {
  QUEST_CARD_CLASS,
  QuestGoButton,
  QuestSectionHeader,
} from '@/components/ui/QuestCards';
import { QuestRewardTileBadge } from '@/lib/questClaims';
import { openShieldSheet } from '@/hooks/useShields';
import { useUIStore } from '@/lib/uiStore';
import { tileRewards } from '@/lib/leap/format';
import type { LeapView } from '@/lib/leap/types';
import { LeapRail, type LeapStop } from './LeapRail';
import { LeapLeaguesSheet } from './LeapLeaguesSheet';
import { LeapPlusButton } from './LeapPlusButton';
import { LeapPrizeTile, plusBonusLeague, waitingPlusLeagues } from './LeapPrizeTile';
import {
  leagueArt,
  leagueName,
  leagueTitle,
  leapCompeting,
  leapDaysLeft,
  leapHasHabits,
  leapRepeating,
  leapRule,
  leapStatus,
  leapTarget,
  leapWeekRewards,
} from './leapCopy';
import { LeapTrack } from './LeapTrack';
import { useLeapView } from './useLeapView';

const STEP = 6;

function railFor(view: LeapView): { stops: LeapStop[]; progress: number } {
  const last = view.leagues.length - 1;
  const stops = view.leagues.map((league, index): LeapStop => ({
    label: leagueTitle(league.label),
    weeks: index * STEP,
    mystery: index === Math.min(view.league + 1, last),
    state:
      index <= view.league
        ? 'reached'
        : index === view.league + 1
          ? 'next'
          : 'locked',
    isDestination: index === last,
    art: leagueArt(index),
    isHere: index === view.league,
  }));
  const target = leapTarget(view);
  const progress = target > 0 ? Math.min(1, view.week.hops / target) : 0;
  return { stops, progress };
}

function CollectRow({ view }: { view: LeapView }) {
  const [busy, setBusy] = useState(false);
  const { mutate } = useLeapView();
  if (!view.isPremium || view.forgoneFlies <= 0) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const res = await fetch('/api/leap/retro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone }),
          });
          const payload = await res.json().catch(() => ({}));
          if (res.ok && payload.view) void mutate(payload.view, { revalidate: false });
        } finally {
          setBusy(false);
        }
      }}
      className="mx-3 mb-3 flex w-[calc(100%-1.5rem)] items-center justify-between gap-2 rounded-xl bg-amber-400/12 px-3 py-2 text-left transition active:scale-[0.99] disabled:opacity-60"
    >
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-black text-foreground">
        <FlyAmount amount={view.forgoneFlies} /> earned before Plus
      </span>
      <span className="text-[12.5px] font-black text-primary">
        {busy ? '…' : 'Collect'}
      </span>
    </button>
  );
}

function PlusRow({ view }: { view: LeapView }) {
  const setPremiumModalOpen = useUIStore((state) => state.setPremiumModalOpen);
  if (view.isPremium) return null;
  const waiting = waitingPlusLeagues(view);
  const next = plusBonusLeague(view);
  const shown = waiting[0] ?? next;
  if (!shown) return null;
  const prizes = shown.plusReachRewards.slice(0, 2).map((reward, i) => (
    <LeapPrizeTile key={i} reward={reward} view={view} size="sm" offset={i} />
  ));
  return (
    <div className="px-3 pb-3">
      <LeapPlusButton
        title={
          waiting.length
            ? `${waiting.length} Plus ${waiting.length === 1 ? 'prize' : 'prizes'} waiting`
            : `Plus bonus at ${shown.label}`
        }
        subtitle={waiting.length ? 'You already earned them' : 'Unlock it with Plus'}
        prizes={prizes}
        onClick={() => setPremiumModalOpen(true, 'leap_leagues')}
      />
    </div>
  );
}

export function LeapLeagueCard() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { data: view } = useLeapView();
  const startHintGuide = useUIStore((state) => state.startHintGuide);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash !== '#leap') return;
    const timer = window.setTimeout(() => {
      ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      history.replaceState(null, '', window.location.pathname);
    }, 250);
    return () => window.clearTimeout(timer);
  }, []);

  if (!view || !view.enabled || !view.leagues.length) return null;
  const hasHabits = leapHasHabits(view);
  const repeating = leapRepeating(view);
  const competing = hasHabits && leapCompeting(view);
  const landed = view.week.leap.reached;
  const { stops, progress } = railFor(view);

  return (
    <div ref={ref} id="leap">
      <QuestSectionHeader
        title="Weekly Leap"
        right={
          <>
            {view.shields.count > 0 && (
              <button
                type="button"
                onClick={() => openShieldSheet(null, 'leap')}
                aria-label={`${view.shields.count} Lily Pad${view.shields.count === 1 ? '' : 's'}`}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-muted/70 pl-1 pr-2.5 text-[13px] font-black tabular-nums text-foreground transition active:scale-95"
              >
                <Icon name="lilyPad" className="h-6 w-6" />
                {view.shields.count}
              </button>
            )}
            {hasHabits && (
              <span className="inline-flex items-center gap-1 pr-2 text-[12px] font-black tabular-nums text-muted-foreground">
                <Clock className="h-3.5 w-3.5" strokeWidth={2.75} />
                {leapDaysLeft(view)}
              </span>
            )}
          </>
        }
      />
      <div className={QUEST_CARD_CLASS}>
        <LeapRail
          stops={stops}
          progress={progress}
          focusIndex={view.league}
          onSelect={setPicked}
          className="mt-6 px-3"
        />

        <div className="px-4 pb-4 pt-2.5 text-center">
          <p className="text-[18px] font-black leading-tight tracking-tight text-foreground">
            {leagueTitle(leagueName(view))}
          </p>
          <p className="mt-1 text-[12.5px] font-semibold leading-snug text-muted-foreground">
            {leapRule(view)}
          </p>
        </div>

        <div className="flex items-center gap-3 border-t border-border/50 py-3 pl-3.5 pr-3">
          <span className="min-h-11 min-w-11 shrink-0 rounded-xl">
            {competing ? (
              <QuestRewardTileBadge
                rewards={tileRewards(leapWeekRewards(view))}
                catalog={view.rewardCatalog as never}
                isPremium={view.isPremium}
                small
              />
            ) : (
              <span className="grid h-11 w-11 place-items-center rounded-xl border-2 border-border/40 bg-muted">
                <Icon name="repeat" className="h-6 w-6" />
              </span>
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex min-w-0 items-center gap-1.5 text-[14px] font-bold leading-tight text-foreground">
              {landed && (
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#4f9149] text-white">
                  <Check className="h-2.5 w-2.5" strokeWidth={4} />
                </span>
              )}
              <span className="min-w-0">{leapStatus(view)}</span>
            </span>
            {competing && <LeapTrack view={view} />}
            {!repeating && (
              <button
                type="button"
                onClick={() => startHintGuide('take-leap')}
                className="inline-flex h-8 w-fit items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-[12.5px] font-black text-white shadow-[0_3px_0_0_#b45309] transition-all hover:-translate-y-px hover:shadow-[0_4px_0_0_#b45309] active:translate-y-[2px] active:shadow-none"
              >
                <Play className="h-3 w-3 fill-current" />
                Show me
              </button>
            )}
          </div>
          {repeating && !landed && (
            <QuestGoButton onPress={() => startHintGuide('take-leap')} />
          )}
        </div>
        <PlusRow view={view} />
        <CollectRow view={view} />
      </div>

      <LeapLeaguesSheet
        view={view}
        open={picked !== null}
        focus={picked ?? view.league}
        onClose={() => setPicked(null)}
      />
    </div>
  );
}
