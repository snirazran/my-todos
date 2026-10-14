import type { LeapConfigView, LeapMarkId } from './types';

export type MarkTarget = {
  id: LeapMarkId;
  target: number;
  minDays: number;
  available: boolean;
};

export function leapPercentFor(config: LeapConfigView, league: number) {
  const index = Math.min(Math.max(0, league), Math.max(0, config.leagues.length - 1));
  return config.leagues[index]?.leapPercent ?? config.marks.leap.percent;
}

export function targetBasis(scheduled: number, cap: number | null | undefined) {
  return typeof cap === 'number' && cap > 0 ? Math.min(cap, scheduled) : scheduled;
}

function line(args: {
  scheduled: number;
  scheduledDays: number;
  percent: number;
  minDays: number;
  ceiling: number;
}) {
  const days = Math.max(2, Math.min(args.minDays, args.scheduledDays));
  const wanted = Math.max(1, Math.ceil((args.scheduled * args.percent) / 100), days);
  const target = Math.min(wanted, args.ceiling);
  return { target, minDays: Math.max(1, Math.min(days, target)) };
}

export function markTargets(
  config: LeapConfigView,
  scheduled: number,
  scheduledDays: number,
  league = 0,
): MarkTarget[] {
  const spread = scheduledDays >= 2;
  const leapMark = config.marks.leap;
  const holdMark = config.marks.hold;

  const leap = line({
    scheduled,
    scheduledDays,
    percent: leapPercentFor(config, league),
    minDays: leapMark.minDays,
    ceiling: scheduled - 1,
  });
  const leapAvailable =
    spread && scheduled >= leapMark.minScheduled && leap.target >= 2;

  const hold = line({
    scheduled,
    scheduledDays,
    percent: holdMark.percent,
    minDays: holdMark.minDays,
    ceiling: leapAvailable ? leap.target - 1 : scheduled - 1,
  });
  const holdAvailable =
    spread && scheduled >= holdMark.minScheduled && hold.target >= 1;

  return [
    { id: 'hold', target: hold.target, minDays: hold.minDays, available: holdAvailable },
    { id: 'leap', target: leap.target, minDays: leap.minDays, available: leapAvailable },
  ];
}

export function marksMet(
  targets: MarkTarget[],
  hops: number,
  activeDays: number,
): LeapMarkId[] {
  return targets
    .filter(
      (mark) =>
        mark.available && hops >= mark.target && activeDays >= mark.minDays,
    )
    .map((mark) => mark.id);
}

export function lineGoal(
  mark: { target: number; minDays: number },
  hops: number,
  activeDays: number,
) {
  return Math.max(mark.target, hops + Math.max(0, mark.minDays - activeDays));
}
