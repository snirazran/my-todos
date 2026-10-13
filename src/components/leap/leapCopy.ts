import type { BonusRewards, LeapView } from '@/lib/leap/types';
import { LILY_LADDER_ART } from './LeapRail';

export function leapHasHabits(view: LeapView) {
  return view.week.scheduled > 0 || view.week.habits > 0;
}

export function leagueName(view: LeapView, index = view.league) {
  return view.leagues[index]?.label ?? 'Lily';
}

export function nextLeagueName(view: LeapView) {
  return view.leagues[view.league + 1]?.label ?? null;
}

export function leagueArt(index: number) {
  return LILY_LADDER_ART[Math.min(Math.max(0, index), LILY_LADDER_ART.length - 1)];
}

export function leapTarget(view: LeapView) {
  const { leap, scheduled } = view.week;
  return leap.available ? leap.target : Math.max(1, scheduled);
}

export function leapLeft(view: LeapView) {
  return Math.max(0, leapTarget(view) - view.week.hops);
}

export function leapWeekRewards(view: LeapView): BonusRewards {
  const league = view.leagues[view.league];
  return [
    ...(view.week.leapFlies > 0
      ? [{ type: 'FLIES' as const, amount: view.week.leapFlies }]
      : []),
    ...(league?.weekRewards ?? []),
    ...(view.isPremium ? league?.plusWeekRewards ?? [] : []),
  ];
}

const habitsWord = (count: number) => `${count} habit${count === 1 ? '' : 's'}`;

export function leagueTitle(label: string | null | undefined) {
  return `${label ?? 'Lily'} League`;
}

export function leapDaysLeft(view: LeapView) {
  const days = view.week.daysLeft;
  return days <= 1 ? 'Last day' : `${days} days`;
}

export function leapRule(view: LeapView): string {
  if (!leapHasHabits(view)) return 'Your weekly habit league';
  if (!view.week.leap.available) return 'Repeat habits on more days to compete';
  const target = habitsWord(leapTarget(view));
  return nextLeagueName(view)
    ? `Finish ${target} to advance to the next league`
    : `Finish ${target} to win the top prize`;
}

export function leapStatus(view: LeapView): string {
  const { week } = view;
  if (!leapHasHabits(view)) return 'Make a task repeat to start';
  const next = nextLeagueName(view);
  if (week.leap.reached) {
    return next ? "You're in the promotion zone!" : 'Top prize won this week';
  }
  if (!week.leap.available) {
    return week.scheduledDays < 2
      ? 'Add a habit on another day'
      : 'Add one more habit day';
  }
  const left = leapLeft(view);
  if (left === 0) return 'Finish one on another day';
  const holdLeft = Math.max(0, week.hold.target - week.hops);
  if (view.league > 0 && week.hold.available && !week.hold.reached && holdLeft > 0) {
    return `${habitsWord(holdLeft)} to leave the demotion zone`;
  }
  const near = left <= Math.max(3, Math.ceil(leapTarget(view) * 0.3));
  if (near) {
    return next
      ? `${habitsWord(left)} more to the promotion zone`
      : `${habitsWord(left)} more for the top prize`;
  }
  return week.hops > 0
    ? `${habitsWord(week.hops)} done this week`
    : 'Finish your first habit this week';
}

export function leapHint(view: LeapView): string {
  const next = nextLeagueName(view);
  if (!leapHasHabits(view)) {
    return 'Set any task to repeat. Every time you finish it, you earn flies here.';
  }
  return next
    ? `Every repeating task you finish counts. Finish ${leapTarget(view)} this week to advance to the ${leagueTitle(next)}.`
    : `Every repeating task you finish counts. Finish ${leapTarget(view)} this week to win the top prize.`;
}
