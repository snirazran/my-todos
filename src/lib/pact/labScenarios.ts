import { shiftYMD } from '@/lib/weekStart';
import type {
  ActivePactView,
  PactSessionView,
  PactView,
  PactWeekResult,
} from './types';

export type LeapLabGroup = 'Access' | 'Week' | 'Streak' | 'Settlement';

export type LeapLabScenario = {
  id: string;
  group: LeapLabGroup;
  label: string;
  note: string;
  apply: (base: PactView) => PactView;
  result?: (base: PactView) => PactWeekResult;
};

type WeekShape = {
  target: number;
  done: number;
  /** Days gone by unticked. */
  missed: number;
  /** Of those, how many are still inside the one-day catch-up window. */
  catchable?: number;
  deleted?: number;
  claimed?: boolean;
};

export function labNearMissTarget(target: number) {
  return target <= 1 ? target : target - 1;
}

const PARTIAL_EXPONENT = 1.7;

function priceFor(base: PactView, target: number) {
  const list = base.weekPreview ?? [];
  return (
    list.find((entry) => entry.sessions === target) ??
    list[list.length - 1] ?? {
      sessions: target,
      flies: 20 * (target + 1),
      rewards: [],
    }
  );
}

function payoutFor(value: number, target: number, done: number) {
  if (target <= 0 || done <= 0) return 0;
  if (done >= target) return value;
  return Math.round(value * (done / target) ** PARTIAL_EXPONENT);
}

function buildSessions(
  base: PactView,
  shape: WeekShape,
  days: number[],
): PactSessionView[] {
  const live = Math.max(0, shape.target - (shape.deleted ?? 0));
  const sessions: PactSessionView[] = [];
  for (let index = 0; index < live; index += 1) {
    const state: PactSessionView['state'] =
      index < shape.missed
        ? 'missed'
        : index < shape.missed + shape.done
          ? 'done'
          : 'open';
    sessions.push({
      taskId: `lab-session-${index}`,
      dayOfWeek: days[index % days.length],
      dateKey: shiftYMD(base.weekKey, index),
      state,
    });
  }
  return sessions;
}

function makeActive(base: PactView, shape: WeekShape): ActivePactView {
  const template = base.active;
  const price = priceFor(base, shape.target);
  const deleted = shape.deleted ?? 0;
  const remaining = Math.max(
    0,
    shape.target - shape.done - shape.missed - deleted,
  );
  const catchable = Math.min(shape.missed, shape.catchable ?? 0);
  const reachable = shape.done + remaining + catchable;
  const nearMissTarget = labNearMissTarget(shape.target);
  const days = (template?.days?.length ? template.days : [1, 3, 5, 0, 2, 4, 6])
    .slice()
    .sort((a, b) => a - b);
  const area = base.areas[0];

  return {
    id: 'lab-pact',
    weekKey: base.weekKey,
    categoryId: template?.categoryId ?? area?.categoryId ?? 'lab',
    categoryName: template?.categoryName ?? area?.shortLabel ?? 'Movement',
    accent: template?.accent ?? area?.accent,
    coverImageUrl: template?.coverImageUrl ?? area?.coverImageUrl,
    backgroundFrom: template?.backgroundFrom ?? area?.backgroundFrom,
    backgroundTo: template?.backgroundTo ?? area?.backgroundTo,
    commitmentText: template?.commitmentText ?? 'Walk for twenty minutes',
    scheduleLabel: template?.scheduleLabel ?? 'Mon, Wed, Fri at 19:00',
    days,
    startTime: template?.startTime ?? '19:00',
    progress: shape.done,
    target: shape.target,
    status: 'active',
    claimable:
      !shape.claimed &&
      shape.done > 0 &&
      (shape.done >= shape.target || remaining + catchable === 0),
    claimed: !!shape.claimed,
    rewardFlies: price.flies,
    payoutFlies: payoutFor(price.flies, shape.target, shape.done),
    daysLeft: Math.max(1, 7 - shape.missed - shape.done),
    shieldUsed: false,
    nextTaskLabel: remaining > 0 ? 'Friday at 19:00' : null,
    openToday: remaining > 0,
    missedSessions: shape.missed,
    catchableSessions: catchable,
    canStillFinish: reachable >= shape.target,
    tagId: template?.tagId,
    sessions: buildSessions(base, shape, days),
    completionRewards: price.rewards ?? base.completionRewards ?? [],
    nearMissTarget,
    canHoldStreak: reachable >= nearMissTarget,
  };
}

function week(shape: WeekShape) {
  return (base: PactView): PactView => ({
    ...base,
    enabled: true,
    needsAreas: false,
    active: makeActive(base, shape),
    weekResult: null,
  });
}

function withStreak(
  apply: (base: PactView) => PactView,
  streak:
    | Partial<PactView['streak']>
    | ((base: PactView) => Partial<PactView['streak']>),
) {
  return (base: PactView): PactView => {
    const next = apply(base);
    const patch = typeof streak === 'function' ? streak(base) : streak;
    return { ...next, streak: { ...next.streak, ...patch } };
  };
}

/** The nth milestone rung of the live ladder, lowest first. */
function rungAt(base: PactView, index: number) {
  return (
    [...base.ladder.rungs]
      .filter((rung) => rung.weeks > 0)
      .sort((a, b) => a.weeks - b.weeks)[index] ?? null
  );
}

/** What a rung actually hands over, read off the config rather than invented. */
function rungPayout(rung: ReturnType<typeof rungAt>) {
  let flies = 0;
  const itemIds: string[] = [];
  for (const reward of rung?.rewards ?? []) {
    if (reward.type === 'FLIES') flies += reward.amount ?? 0;
    else if ('itemId' in reward && reward.itemId) itemIds.push(reward.itemId);
  }
  return { flies, itemIds };
}

/** A kept week that lands the nth rung, priced by that rung's own rewards. */
function rungLanding(base: PactView, index: number, fallbackWeeks: number) {
  const rung = rungAt(base, index);
  const weeks = rung?.weeks ?? fallbackWeeks;
  const { flies, itemIds } = rungPayout(rung);
  return makeResult(base, 'kept', {
    streakBefore: Math.max(0, weeks - 1),
    streakAfter: weeks,
    milestoneWeeks: weeks,
    bonusFlies: flies,
    grantedItemIds: itemIds,
  });
}

function makeResult(
  base: PactView,
  outcome: PactWeekResult['outcome'],
  extra: Partial<PactWeekResult> & { bonusFlies?: number } = {},
): PactWeekResult {
  const { bonusFlies = 0, ...rest } = extra;
  const target = base.active?.target ?? 3;
  const progress = rest.progress ?? (outcome === 'kept' ? target : target - 1);
  const streakBefore = base.streak.weeks || 3;
  return {
    weekKey: `preview-lab-${outcome}`,
    categoryName: base.active?.categoryName ?? base.areas[0]?.name ?? 'Movement',
    outcome,
    progress: Math.max(0, progress),
    target,
    streakBefore,
    streakAfter:
      outcome === 'kept'
        ? streakBefore + 1
        : outcome === 'missed'
          ? 0
          : streakBefore,
    fliesGranted:
      payoutFor(priceFor(base, target).flies, target, progress) + bonusFlies,
    shieldsLeft: base.streak.shields,
    ...rest,
  };
}

export const LEAP_LAB_SCENARIOS: LeapLabScenario[] = [
  {
    id: 'no-areas',
    group: 'Access',
    label: 'Areas not picked',
    note: 'Leap is gated behind onboarding. The card renders nothing at all.',
    apply: (base) => ({ ...base, needsAreas: true, active: null }),
  },
  {
    id: 'disabled',
    group: 'Access',
    label: 'Leap switched off',
    note: 'Admin kill switch. The card renders nothing at all.',
    apply: (base) => ({ ...base, enabled: false }),
  },
  {
    id: 'no-leap',
    group: 'Access',
    label: 'No Leap this week',
    note: 'Nothing committed yet. This is the pick nudge and its rotating price.',
    apply: (base) => ({
      ...base,
      enabled: true,
      needsAreas: false,
      active: null,
      pickOpen: true,
      weekResult: null,
    }),
  },
  {
    id: 'fresh',
    group: 'Week',
    label: 'Fresh week, nothing done',
    note: 'Full prize on the tile, no miss line yet.',
    apply: week({ target: 3, done: 0, missed: 0 }),
  },
  {
    id: 'on-track',
    group: 'Week',
    label: 'On track, 1 of 3',
    note: 'One session banked, none missed. The miss line stays hidden.',
    apply: week({ target: 3, done: 1, missed: 0 }),
  },
  {
    id: 'missed-catchable',
    group: 'Week',
    label: 'Missed yesterday, still catchable',
    note: 'Yesterday slipped and the one-day window is still open, so ticking it today still finishes the week. Full prize on the tile.',
    apply: week({ target: 3, done: 1, missed: 1, catchable: 1 }),
  },
  {
    id: 'missed-window-closed',
    group: 'Week',
    label: 'Missed a day, window closed',
    note: 'The day went by more than a day ago, so it can never be logged — which puts a 4-session week permanently out of reach. Two sessions are still open and near-miss is one of them away.',
    apply: week({ target: 4, done: 1, missed: 1, catchable: 0 }),
  },
  {
    id: 'partial-claimable',
    group: 'Week',
    label: 'Short week, ready to claim',
    note: 'Two of three landed and a deleted session means no more can be. Progress can no longer rise, so the convex payout is collectable by hand: reduced flies on the tile, no gift, Claim in the hint slot.',
    apply: week({ target: 3, done: 2, missed: 0, deleted: 1 }),
  },
  {
    id: 'bonus-gone-streak-reachable',
    group: 'Week',
    label: 'Bonus gone, streak still reachable',
    note: 'A deleted session put the week out of reach with nothing actually missed, but near-miss is still in range. The one line that should pull a session tonight.',
    apply: week({ target: 4, done: 1, missed: 0, deleted: 1 }),
  },
  {
    id: 'week-dead',
    group: 'Week',
    label: 'Week dead, streak unholdable',
    note: 'Nothing left to reach. This is the dead tail a recovery mechanic would target.',
    apply: week({ target: 4, done: 0, missed: 1, deleted: 3 }),
  },
  {
    id: 'claimable',
    group: 'Week',
    label: 'Complete, ready to claim',
    note: 'Every session done. Claim button live, bonus flies stated.',
    apply: week({ target: 3, done: 3, missed: 0 }),
  },
  {
    id: 'claimed',
    group: 'Week',
    label: 'Claimed, waiting on next week',
    note: 'Done chip in the hint slot, commitment struck through.',
    apply: week({ target: 3, done: 3, missed: 0, claimed: true }),
  },
  {
    id: 'at-risk-no-pads',
    group: 'Streak',
    label: 'At risk, no Lily Pads',
    note: 'The Lily Pad button goes urgent. Tapping it opens the offer sheet.',
    apply: withStreak(week({ target: 3, done: 0, missed: 1 }), {
      weeks: 6,
      shields: 0,
      atRisk: true,
    }),
  },
  {
    id: 'pads-held',
    group: 'Streak',
    label: 'Two Lily Pads held',
    note: 'Badge count on the HUD, calm tone.',
    apply: withStreak(week({ target: 3, done: 1, missed: 1 }), {
      weeks: 6,
      shields: 2,
      atRisk: true,
    }),
  },
  {
    id: 'rescue-cooldown',
    group: 'Streak',
    label: 'Rescue on cooldown',
    note: 'A pad was spent last week, so this one cannot be rescued even though one is held.',
    apply: withStreak(week({ target: 3, done: 0, missed: 2 }), {
      weeks: 5,
      shields: 1,
      rescueOnCooldown: true,
      atRisk: true,
    }),
  },
  {
    id: 'long-streak',
    group: 'Streak',
    label: 'Eleven weeks, prestige next',
    note: 'One kept week from a full cycle. Multiplier at its highest before the lap.',
    apply: withStreak(week({ target: 3, done: 2, missed: 0 }), {
      weeks: 11,
      best: 11,
      shields: 2,
      atRisk: false,
    }),
  },
  {
    id: 'result-kept',
    group: 'Settlement',
    label: 'Week kept',
    note: 'The settlement sheet for a finished week.',
    apply: week({ target: 3, done: 3, missed: 0, claimed: true }),
    result: (base) => makeResult(base, 'kept'),
  },
  {
    id: 'result-first-rung',
    group: 'Settlement',
    label: 'First milestone landed',
    note: 'The earliest pad-to-pad hop there is, and the one most users meet first: the bare pad blooms, the marker drops onto it, and every week from here pays more. Rung, bonus and gift are all read off the live config.',
    apply: withStreak(
      week({ target: 3, done: 3, missed: 0, claimed: true }),
      (base) => ({ weeks: Math.max(0, (rungAt(base, 0)?.weeks ?? 2) - 1) }),
    ),
    result: (base) => rungLanding(base, 0, 2),
  },
  {
    id: 'result-milestone',
    group: 'Settlement',
    label: 'Later milestone landed',
    note: 'The second rung, further up the ladder. The sheet totals the week plus the rung bonus, so it reads higher than the card, which only prices the week.',
    apply: withStreak(
      week({ target: 3, done: 3, missed: 0, claimed: true }),
      (base) => ({ weeks: Math.max(0, (rungAt(base, 1)?.weeks ?? 5) - 1) }),
    ),
    result: (base) => rungLanding(base, 1, 5),
  },
  {
    id: 'result-prestige',
    group: 'Settlement',
    label: 'Cycle completed',
    note: 'Twelve weeks landed: the ladder resets and the permanent floor rises. The sheet totals the week plus the lap bonus, so it reads higher than the card, which only prices the week.',
    apply: withStreak(week({ target: 3, done: 3, missed: 0, claimed: true }), {
      weeks: 11,
    }),
    result: (base) =>
      makeResult(base, 'kept', {
        streakBefore: 11,
        streakAfter: 12,
        lapCompleted: true,
        prestigeLabel: base.ladder.prestigeLabel ?? 'Bronze Lily',
        prestigeBase: base.ladder.nextBaseMultiplier,
        bonusFlies: 80,
      }),
  },
  {
    id: 'result-rescued',
    group: 'Settlement',
    label: 'Rescued by a Lily Pad',
    note: 'A pad spent itself. The streak holds, the reward does not.',
    apply: week({ target: 3, done: 1, missed: 2 }),
    result: (base) => makeResult(base, 'rescued', { shieldsLeft: 0 }),
  },
  {
    id: 'result-near-miss',
    group: 'Settlement',
    label: 'Survived on near-miss',
    note: 'Short of the target but on or above the near-miss line. Streak holds, no pad spent.',
    apply: week({ target: 4, done: 3, missed: 1 }),
    result: (base) => makeResult(base, 'near_miss'),
  },
  {
    id: 'result-missed',
    group: 'Settlement',
    label: 'Missed, streak broken',
    note: 'Nothing held it. Settlement still pays the convex share for the sessions that landed, but the streak goes to zero and the milestones reset.',
    apply: week({ target: 3, done: 1, missed: 2 }),
    result: (base) => makeResult(base, 'missed', { progress: 1 }),
  },
  {
    id: 'result-zero',
    group: 'Settlement',
    label: 'Missed everything',
    note: 'Not one session landed, so nothing is paid and no Lily Pad can rescue it. The harshest sheet the system can show.',
    apply: week({ target: 3, done: 0, missed: 3 }),
    result: (base) => makeResult(base, 'missed', { progress: 0 }),
  },
];

export function leapLabScenario(id: string) {
  return LEAP_LAB_SCENARIOS.find((entry) => entry.id === id) ?? null;
}
