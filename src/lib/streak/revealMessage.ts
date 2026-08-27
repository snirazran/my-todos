export type StreakRevealContext = {
  count: number;
  longestStreak: number;
  nextTierDays: number | null;
  /** 0 = Sunday … 6 = Saturday, in the user's own week. */
  dayOfWeek: number;
};

const MILESTONES: Record<number, string> = {
  7: 'Seven days. A full week without missing one.',
  14: 'Two weeks straight. This is a routine now.',
  21: 'Three weeks. The hard part is behind you.',
  30: 'Thirty days. A whole month of showing up.',
  50: 'Fifty days. Half a hundred.',
  75: 'Seventy-five days, and still going.',
  100: 'One hundred days. Sit with that one for a second.',
  150: 'One hundred and fifty days. Still here.',
  200: 'Two hundred days. That is not luck.',
  250: 'Two hundred and fifty days of turning up.',
  300: 'Three hundred days. Almost the whole year.',
  365: 'One year. Every single day.',
};

const WEEKDAY_LINES: Record<number, string> = {
  0: 'A Sunday check-in. Those are the easy ones to skip.',
  1: 'Monday, and you still showed up.',
  5: 'Friday, going into the weekend {n} days deep.',
  6: 'A Saturday check-in. Those are the easy ones to skip.',
};

/**
 * Praise the act, never the person: process framing holds up when a streak
 * eventually breaks, where "you're amazing" turns into a reason to quit.
 */
const GENERIC_LINES = [
  'You showed up today. That is how streaks are made.',
  'Day {n}, logged.',
  'You made time today. That is the whole trick.',
  'Another one on the board.',
  'Small and repeated beats big and once.',
  'Today counted. On to the next.',
  'You kept it alive — {n} days and going.',
  'Turned up again. That is the hard part done.',
  'One more day in the bank.',
  'Nothing dramatic. Just another day kept.',
];

function fill(line: string, count: number) {
  return line.replace(/\{n\}/g, String(count));
}

/**
 * The most specific true thing the streak can say today.
 *
 * Generic praise reads worse than none — the reveal used to rotate ten
 * interchangeable sentences by streak count, which is variety without
 * variation. This walks real state first (first day, a comeback, a milestone,
 * a reward one day out, a personal best) and only falls back to the pool when
 * nothing specific applies, seeding it so consecutive days never repeat.
 */
export function streakRevealMessage(context: StreakRevealContext): string {
  const count = Math.max(1, Math.floor(context.count));
  const longest = Math.max(count, Math.floor(context.longestStreak || 0));

  if (count === 1) {
    return longest > 1
      ? `Back to day one. Your best run was ${longest} — you already know you can.`
      : 'Day one. The only one that is hard to start.';
  }

  const milestone = MILESTONES[count];
  if (milestone) return milestone;

  const toTier =
    context.nextTierDays != null ? context.nextTierDays - count : null;
  if (toTier === 1) return 'One more day and your next reward opens.';
  if (toTier === 2) return 'Two days from your next reward.';

  if (count >= 7 && count === longest) {
    return `${count} days — your longest run yet.`;
  }

  const weekday = WEEKDAY_LINES[context.dayOfWeek];
  if (weekday && (count + context.dayOfWeek) % 2 === 0) {
    return fill(weekday, count);
  }

  return fill(
    GENERIC_LINES[(count * 7 + context.dayOfWeek) % GENERIC_LINES.length],
    count,
  );
}
