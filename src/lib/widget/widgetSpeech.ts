'use client';

/**
 * What the frog says on the home screen.
 *
 * Deliberately separate from frogSpeech's in-app rules. Those are written for
 * the moment you open the app and run to two lines of 30-40 characters; the
 * widget header fits about forty in total, and it is glanced at rather than
 * read. Everything here is one short line.
 *
 * The ladder follows the pattern Duolingo's copy uses: urgency is *earned*, not
 * constant. Routine stays quiet, and the loud lines are held back for the
 * moments something is genuinely about to be lost — a streak at midnight, a
 * frog that has not eaten. Escalating all day trains people to ignore it.
 *
 * Lines stay specific — "2 left before bed" rather than "you have tasks" —
 * because a number is what makes a glance turn into an action.
 */

export type WidgetUrgency = 'calm' | 'nudge' | 'urgent';

export type WidgetSpeechFacts = {
  done: number;
  total: number;
  streak: number;
  /** Login streak already banked today. False after 6pm is the risk signal. */
  checkedInToday: boolean;
  hungerPercent: number | null;
  hour: number;
};

type Tier = {
  urgency: WidgetUrgency;
  when: (f: WidgetSpeechFacts) => boolean;
  lines: (f: WidgetSpeechFacts) => string[];
};

const left = (f: WidgetSpeechFacts) => Math.max(0, f.total - f.done);
const isLate = (f: WidgetSpeechFacts) => f.hour >= 18;
const isMorning = (f: WidgetSpeechFacts) => f.hour >= 5 && f.hour < 12;
const isNight = (f: WidgetSpeechFacts) => f.hour >= 22 || f.hour < 5;

/** Highest matching tier wins, so the most urgent true thing is what he says. */
const TIERS: Tier[] = [
  // --- urgent: something is about to be lost ---------------------------
  {
    urgency: 'urgent',
    when: (f) => f.streak > 0 && !f.checkedInToday && f.hour >= 21,
    lines: (f) => [
      `Day ${f.streak} ends at midnight.`,
      `${f.streak} days. Don't do this to me.`,
      `Streak ${f.streak} is on the line.`,
    ],
  },
  {
    urgency: 'urgent',
    when: (f) => f.hungerPercent !== null && f.hungerPercent <= 20,
    lines: () => [
      'I AM starving. One fly?',
      '*stomach growls loudly*',
      'Running on empty here.',
      'Feed me. I am begging.',
    ],
  },
  {
    urgency: 'urgent',
    when: (f) => f.streak > 0 && !f.checkedInToday && isLate(f),
    lines: (f) => [
      `Day ${f.streak} still unclaimed.`,
      `Don't lose ${f.streak} days tonight.`,
    ],
  },

  // --- nudge: close enough that a push finishes it ----------------------
  {
    urgency: 'nudge',
    when: (f) => f.total > 0 && f.done > 0 && left(f) > 0 && left(f) <= 2,
    lines: (f) => [
      `${left(f)} left. Finish the plate?`,
      `Only ${left(f)} between us and dinner.`,
      'So close I can taste it.',
    ],
  },
  {
    urgency: 'nudge',
    when: (f) => f.total > 0 && f.done === 0 && isLate(f),
    lines: (f) => [
      `${f.total} still waiting. Any of them.`,
      'Pick one. Literally any one.',
    ],
  },
  {
    urgency: 'nudge',
    when: (f) => f.total > 0 && f.done === 0,
    lines: (f) => [
      `${f.total} today. Start anywhere.`,
      'Nothing ticked yet. I noticed.',
      'One task and I stop staring.',
    ],
  },

  // --- calm: nothing at stake -------------------------------------------
  {
    urgency: 'calm',
    when: (f) => f.total > 0 && f.done === f.total,
    lines: () => [
      'Clean plate. Full frog.',
      'All done. Nap with me?',
      "Nothing left. I'm just lounging.",
    ],
  },
  {
    urgency: 'calm',
    when: (f) => f.total === 0 && isMorning(f),
    lines: () => [
      'Empty pond. What are we doing?',
      'Fresh day. Give me something.',
    ],
  },
  {
    urgency: 'calm',
    when: (f) => f.total === 0,
    lines: () => ['Empty list. Suspicious.', 'Nothing here. Add one?'],
  },
  {
    urgency: 'calm',
    when: (f) => isNight(f),
    lines: (f) => [`${left(f)} left, but it's late.`, 'Still up? Same.'],
  },
  {
    urgency: 'calm',
    when: (f) => f.streak >= 3 && f.checkedInToday,
    lines: (f) => [`Day ${f.streak}. That's MY human.`, `${f.streak} days strong.`],
  },
  {
    urgency: 'calm',
    when: () => true,
    lines: (f) => [`${left(f)} to go.`, 'Ribbit. Carry on.'],
  },
];

/**
 * Picks deterministically from the matching tier rather than at random: the
 * caller memoises on the facts, and a line that reshuffles on every sync would
 * spend a widget reload to reword the same sentence.
 */
function stableIndex(seed: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.trunc(hash * 31 + (seed.codePointAt(i) ?? 0)) % 2147483647;
  }
  return Math.abs(hash) % length;
}

export function pickWidgetLine(
  facts: WidgetSpeechFacts,
  seed: string,
): { line: string; urgency: WidgetUrgency } {
  const tier = TIERS.find((t) => t.when(facts)) ?? TIERS.at(-1)!;
  const lines = tier.lines(facts);
  return {
    line: lines[stableIndex(seed, lines.length)],
    urgency: tier.urgency,
  };
}
