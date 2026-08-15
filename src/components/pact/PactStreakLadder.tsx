'use client';

import { Check, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePactView } from './PactCard';
import { PactFlameToken, pactFlameStage } from './pactStreakBits';

function Rung({
  label,
  multiplier,
  state,
  showCheck = true,
}: {
  label: string;
  multiplier: number;
  state: 'reached' | 'next' | 'locked';
  showCheck?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          'relative grid h-12 w-full max-w-[68px] place-items-center rounded-[16px] border-2 text-[17px] font-black tabular-nums',
          state === 'reached' &&
            'border-orange-400/60 bg-orange-400/12 text-orange-500',
          state === 'next' &&
            'border-amber-400 bg-amber-400/15 text-amber-600 shadow-[0_0_18px_-6px_rgba(251,191,36,0.9)] dark:text-amber-400',
          state === 'locked' &&
            'border-border/60 bg-muted/40 text-muted-foreground/70',
        )}
      >
        ×{multiplier}
        {state === 'reached' && showCheck && (
          <span className="absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-lime-500 ring-2 ring-card">
            <Check className="h-3 w-3 text-white" strokeWidth={4} />
          </span>
        )}
      </div>
      <span
        className={cn(
          'text-[10px] font-black uppercase tracking-wider tabular-nums',
          state === 'locked' ? 'text-muted-foreground/60' : 'text-foreground',
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function PactStreakLadder() {
  const { data } = usePactView();
  if (!data || !data.enabled || data.needsAreas) return null;

  const { ladder, streak, active } = data;
  const rungs = ladder.rungs;
  if (rungs.length === 0) return null;

  const weeks = streak.weeks;
  const stage = pactFlameStage(weeks);
  const nextIndex = rungs.findIndex((rung) => !rung.reached);
  const nextRung = nextIndex === -1 ? null : rungs[nextIndex];
  const toGo = nextRung ? Math.max(1, nextRung.weeks - weeks) : 0;

  // Base pay is what the card's own number would be without the streak, so the
  // multiplier can be shown doing its work on a number the user already knows.
  const weekPay = active?.rewardFlies ?? 0;
  const basePay = ladder.multiplier > 0 ? weekPay / ladder.multiplier : weekPay;

  const cols = rungs.length + 1;
  const nodeCenter = (index: number) => ((index + 0.5) / cols) * 100;
  const markerPct = (() => {
    if (nextIndex === -1) return nodeCenter(cols - 1);
    const fromWeeks = nextIndex === 0 ? 0 : rungs[nextIndex - 1].weeks;
    const fromPct = nodeCenter(nextIndex);
    const span = rungs[nextIndex].weeks - fromWeeks;
    const fraction =
      span > 0 ? Math.min(1, Math.max(0, (weeks - fromWeeks) / span)) : 0;
    return fromPct + (nodeCenter(nextIndex + 1) - fromPct) * fraction;
  })();

  return (
    <div className="rounded-[24px] border border-border/50 bg-card px-3.5 py-3.5 shadow-sm">
      <div className="flex items-center gap-3">
        <PactFlameToken weeks={weeks} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            {weeks > 0
              ? `${weeks} week${weeks === 1 ? '' : 's'} in a row`
              : 'No streak yet'}
          </p>
          <p className="mt-0.5 text-[15px] font-black leading-tight text-foreground">
            Your weeks pay ×{ladder.multiplier}
          </p>
          <p className="mt-0.5 text-[12px] font-bold leading-tight text-muted-foreground">
            {nextRung
              ? `Keep ${toGo} more week${toGo === 1 ? '' : 's'} to reach ×${nextRung.multiplier}`
              : 'Top rate — as high as a week pays.'}
          </p>
        </div>
        {streak.best > weeks && (
          <span className="shrink-0 self-start rounded-lg bg-muted/60 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            Best {streak.best}
          </span>
        )}
      </div>

      <div className="mt-3.5">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          <Rung label="Start" multiplier={1} state="reached" showCheck={false} />
          {rungs.map((rung, index) => (
            <Rung
              key={rung.weeks}
              label={`${rung.weeks}w`}
              multiplier={rung.multiplier}
              state={
                rung.reached
                  ? 'reached'
                  : index === nextIndex
                    ? 'next'
                    : 'locked'
              }
            />
          ))}
        </div>

        <div className="relative mt-2.5 h-2 rounded-full bg-muted">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
            style={{ width: `${markerPct}%` }}
          />
          <span
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${markerPct}%` }}
          >
            <span
              className={cn(
                'grid h-6 w-6 place-items-center rounded-full bg-card ring-2',
                weeks > 0 ? 'ring-orange-500' : 'ring-border',
              )}
            >
              <Flame
                className={cn('h-3.5 w-3.5 fill-current', stage.icon)}
                strokeWidth={2}
              />
            </span>
          </span>
        </div>
      </div>

      {weekPay > 0 && (
        <p className="mt-3.5 border-t border-border/50 pt-2.5 text-[12px] font-bold leading-snug text-muted-foreground">
          This week is worth{' '}
          <span className="text-foreground">{Math.round(basePay)}</span>
          {ladder.multiplier > 1 && (
            <>
              {' '}
              × {ladder.multiplier} ={' '}
              <span className="font-black text-foreground">{weekPay}</span>
            </>
          )}{' '}
          flies and a gift. Miss the week and the streak restarts at ×1.
        </p>
      )}
    </div>
  );
}
