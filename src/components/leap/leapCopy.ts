import type { BonusRewards, LeapView } from '@/lib/leap/types';
import { lineGoal } from '@/lib/leap/targets';
import { LILY_LADDER_ART } from './LeapRail';

export function leapRepeating(view: LeapView) {
  return (view.repeating ?? 0) > 0 || view.week.scheduled > 0;
}

export function leapHasHabits(view: LeapView) {
  return view.week.scheduled > 0 || view.week.habits > 0;
}

export function leapCompeting(view: LeapView) {
  return view.week.leap.available;
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

export function weekdayOf(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return 'Monday';
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

export function weekEndDay(weekKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) return 'Sunday';
  const end = new Date(`${weekKey}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return weekdayOf(end.toISOString().slice(0, 10));
}

export function leapTarget(view: LeapView) {
  const { leap, hops, activeDays } = view.week;
  if (!leap.available) return 0;
  return leap.reached ? leap.target : lineGoal(leap, hops, activeDays);
}

export function leapLeft(view: LeapView) {
  return Math.max(0, leapTarget(view) - view.week.hops);
}

export function leapHoldGoal(view: LeapView) {
  const { hold, hops, activeDays } = view.week;
  if (!hold.available) return 0;
  return hold.reached ? hold.target : lineGoal(hold, hops, activeDays);
}

export function leapHoldLeft(view: LeapView) {
  if (view.week.hold.reached) return 0;
  return Math.max(0, leapHoldGoal(view) - view.week.hops);
}

export function leapStayMark(view: LeapView) {
  if (view.league <= 0 || !view.week.hold.available) return undefined;
  const goal = leapHoldGoal(view);
  return goal > 0 && goal < leapTarget(view) ? goal : undefined;
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

export const habitsWord = (count: number) => `${count} habit${count === 1 ? '' : 's'}`;

export function leagueTitle(label: string | null | undefined) {
  return `${label ?? 'Lily'} League`;
}

export function leapDaysLeft(view: LeapView) {
  const days = view.week.daysLeft;
  return days <= 1 ? 'Last day' : `${days} days`;
}

function startsNextWeek(view: LeapView) {
  return view.week.daysLeft <= 1 && view.week.scheduledDays < 2;
}

export function leapRule(view: LeapView): string {
  if (!leapHasHabits(view) || !leapCompeting(view)) return 'Your weekly habit league';
  const next = nextLeagueName(view);
  if (view.week.leap.reached) {
    return next
      ? `You move up to the ${leagueTitle(next)} when the week ends`
      : 'You won the top prize this week';
  }
  const target = habitsWord(leapTarget(view));
  return next
    ? `Finish ${target} to advance to the next league`
    : `Finish ${target} to win the top prize`;
}

export function leapStatus(view: LeapView): string {
  const { week } = view;
  if (!leapRepeating(view)) return 'Make a task repeat to join';
  if (!leapHasHabits(view)) {
    return view.league > 0
      ? 'No habits this week. Your league is safe.'
      : 'No habits this week';
  }
  const next = nextLeagueName(view);
  if (week.leap.reached) {
    return next ? 'Promotion locked in!' : 'Top prize won this week';
  }
  if (!leapCompeting(view)) {
    if (startsNextWeek(view)) return `Your league week starts ${weekdayOf(week.weekKey)}`;
    return week.scheduledDays < 2 ? 'Add a habit on another day' : 'Add one more habit';
  }
  if (week.hops >= week.leap.target && week.activeDays < week.leap.minDays) {
    return 'Finish a habit on another day';
  }
  const holdLeft = leapHoldLeft(view);
  if (view.league > 0 && week.hold.available && holdLeft > 0) {
    return week.daysLeft > 3
      ? `${habitsWord(holdLeft)} to stay in ${leagueName(view)}`
      : `${habitsWord(holdLeft)} to leave the demotion zone`;
  }
  const left = leapLeft(view);
  const near = left <= Math.max(3, Math.ceil(leapTarget(view) * 0.3));
  if (near) {
    const more = `${left} more habit${left === 1 ? '' : 's'}`;
    return next ? `${more} to the promotion zone` : `${more} for the top prize`;
  }
  return week.hops > 0
    ? `${habitsWord(week.hops)} done this week`
    : 'Finish your first habit this week';
}

export function leapHint(view: LeapView): string {
  if (!leapRepeating(view)) {
    return 'Make any task repeat. Every time you finish it, you earn flies and climb the leagues.';
  }
  if (!leapHasHabits(view) || !leapCompeting(view)) {
    return 'Every repeating task you finish earns flies and counts toward your weekly league.';
  }
  const next = nextLeagueName(view);
  const target = habitsWord(leapTarget(view));
  const goal = next
    ? `Finish ${target} this week to advance to the ${leagueTitle(next)}.`
    : `Finish ${target} this week to win the top prize.`;
  const stay = leapStayMark(view);
  const keep = stay
    ? ` Finish ${habitsWord(stay)} to stay in the ${leagueTitle(leagueName(view))}.`
    : '';
  return `Every repeating task you finish counts. ${goal}${keep}`;
}
