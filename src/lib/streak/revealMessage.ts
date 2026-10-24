export type StreakRevealContext = {
  count: number;
  longestStreak: number;
  nextTierDays: number | null;
  /** 0 = Sunday … 6 = Saturday, in the user's own week. */
  dayOfWeek: number;
  shieldUsed?: boolean;
};

const MILESTONES: Record<number, string> = {
  7: 'A whole week!\nI might cry a little.',
  14: 'Two weeks straight!\nThis is a routine now.',
  21: 'Three weeks!\nThe hard part is behind us.',
  30: 'Thirty days!\nTelling the whole pond.',
  50: 'Fifty days!\nI need to sit down.',
  75: 'Seventy-five days.\nWho even are we?',
  100: 'One hundred days!\nFrame this. I’ll wait.',
  150: '150 days!\nStill going. Still proud.',
  200: '200 days.\nThat is not luck.',
  250: '250 days!\nI’ve run out of croaks.',
  300: '300 days!\nAlmost a whole year.',
  365: 'One whole year!\nEvery. Single. Day.',
};

const WEEKDAY_LINES: Record<number, string> = {
  0: 'A Sunday win!\nThe easiest day to skip.',
  1: 'A Monday win!\nThe hardest kind.',
  5: 'Friday, and still going.\n{n} days deep.',
  6: 'A Saturday win!\nThe easiest day to skip.',
};

/**
 * Praise the act, never the person: process framing holds up when a streak
 * eventually breaks, where "you're amazing" turns into a reason to quit.
 */
const GENERIC_LINES = [
  'Day {n}!\nI’m doing a little dance.',
  '{n} days in a row.\nLook at us go.',
  'You showed up again.\nI noticed. I always do.',
  'Another day kept!\nSmall steps, big frog.',
  'Day {n}, done.\nVery proud. Quietly.',
  'Still going!\nMy belly thanks you.',
  '{n} days!\nThe pond is talking.',
  'Kept it alive!\nSame time tomorrow?',
  'Another one banked.\nCroak of approval.',
  'Day {n}.\nThis looks good on us.',
  'Showed up again!\nThat’s the whole trick.',
  'Look at that streak.\nHappy tears. Mine.',
];

function fill(line: string, count: number) {
  return line.replace(/\{n\}/g, String(count));
}

/**
 * The most specific true thing the frog can say about today's streak.
 *
 * Walks real state first (a Lily Pad save, first day, a comeback, a milestone,
 * a reward one day out, a personal best) and only falls back to the pool when
 * nothing specific applies, seeding it so consecutive days never repeat.
 */
export function streakRevealMessage(context: StreakRevealContext): string {
  const count = Math.max(1, Math.floor(context.count));
  const longest = Math.max(count, Math.floor(context.longestStreak || 0));

  if (context.shieldUsed) return 'A Lily Pad saved us!\nStreak still alive.';

  if (count === 1) {
    return longest > 1
      ? `Fresh start!\nWe did ${longest} days before.`
      : 'Day one!\nI already feel stronger.';
  }

  const milestone = MILESTONES[count];
  if (milestone) return milestone;

  const toTier =
    context.nextTierDays != null ? context.nextTierDays - count : null;
  if (toTier === 1) return 'One more day and\na prize opens. I can smell it.';
  if (toTier === 2) return 'Two more days\nto your next prize!';

  if (count >= 7 && count === longest) {
    return `${count} days!\nOur longest run yet.`;
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

const PLEDGE_LINES: Record<number, string> = {
  7: 'Seven days.\nPerfect warm-up!',
  14: 'Two weeks!\nBold. I like it.',
  30: 'A whole month?\nI’m getting emotional.',
  50: 'Fifty days?!\nThat’s a legend move.',
};

export function pledgeFrogLine(days: number | null): string {
  if (days === null) return 'Make it official?\nPick how long we go.';
  return PLEDGE_LINES[days] ?? `${days} days together?\nI’m so in.`;
}
