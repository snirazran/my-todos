import { LEAP_DEFAULTS } from './defaults';
import { markTargets, marksMet } from './targets';
import type {
  LeapHopResult,
  LeapJoin,
  LeapView,
  LeapWeekOutcome,
  LeapWeekResult,
} from './types';

export type LeapLabScenario = { id: string; label: string; view: LeapView };

function makeView(args: {
  league: number;
  scheduled: number;
  hops: number;
  days?: number;
  activeDays?: number;
  daysLeft?: number;
  openToday?: number;
  repeating?: number;
  shields?: number;
  isPremium?: boolean;
  forgone?: number;
  firstDropPending?: boolean;
  join?: LeapJoin | null;
}): LeapView {
  const isPremium = !!args.isPremium;
  const leagues = LEAP_DEFAULTS.leagues;
  const multiplier = leagues[args.league]?.multiplier ?? 1;
  const plus = isPremium ? 2 : 1;
  const scheduledDays = args.days ?? (args.scheduled > 0 ? 7 : 0);
  const activeDays = args.activeDays ?? Math.min(args.hops, 3);
  const targets = markTargets(LEAP_DEFAULTS, args.scheduled, scheduledDays, args.league);
  const met = marksMet(targets, args.hops, activeDays);
  const mark = (id: 'hold' | 'leap') => {
    const entry = targets.find((target) => target.id === id)!;
    return {
      id,
      target: entry.target,
      minDays: entry.minDays,
      available: entry.available,
      reached: met.includes(id),
    };
  };
  return {
    enabled: true,
    isPremium,
    league: args.league,
    bestLeague: args.league,
    leagues: leagues.map((entry, index) => ({
      index,
      label: entry.label,
      multiplier: entry.multiplier,
      weekRewards: entry.weekRewards,
      reachRewards: entry.reachRewards,
      plusReachRewards: entry.plusReachRewards,
      plusWeekRewards: entry.plusWeekRewards,
      weekFlies: Math.round(LEAP_DEFAULTS.marks.leap.flies * entry.multiplier),
      reached: index <= args.league,
    })),
    week: {
      weekKey: '2026-10-12',
      todayKey: '2026-10-15',
      daysLeft: args.daysLeft ?? 4,
      scheduled: args.scheduled,
      hops: args.hops,
      activeDays,
      scheduledDays,
      open: Math.max(0, args.scheduled - args.hops),
      openToday: args.openToday ?? 2,
      hold: mark('hold'),
      leap: mark('leap'),
      leapFlies: Math.round(LEAP_DEFAULTS.marks.leap.flies * multiplier * plus),
      holdFlies: Math.round(LEAP_DEFAULTS.marks.hold.flies * multiplier * plus),
      habits: args.scheduled > 0 ? 3 : 0,
    },
    repeating: args.repeating ?? (args.scheduled > 0 ? 3 : 0),
    join: args.join ?? null,
    shields: { count: args.shields ?? 0, cap: isPremium ? 3 : 2 },
    hopFlies: Math.round(LEAP_DEFAULTS.hopFlies * multiplier * plus),
    firstDropPending: !!args.firstDropPending,
    forgoneFlies: args.forgone ?? 0,
    weekResult: null,
    rewardCatalog: {},
    rarityPreview: {},
  };
}

export const LEAP_LAB_SCENARIOS: LeapLabScenario[] = [
  {
    id: 'no-habits',
    label: 'No habits yet',
    view: makeView({ league: 0, scheduled: 0, hops: 0, openToday: 0, firstDropPending: true }),
  },
  {
    id: 'none-this-week',
    label: 'Has habits, none this week',
    view: makeView({ league: 2, scheduled: 0, hops: 0, openToday: 0, repeating: 2 }),
  },
  {
    id: 'last-day-join',
    label: 'Joined on the last day',
    view: makeView({ league: 0, scheduled: 5, hops: 0, days: 1, daysLeft: 1, openToday: 5, firstDropPending: true }),
  },
  {
    id: 'weekly-once',
    label: 'Only a once-a-week habit',
    view: makeView({ league: 0, scheduled: 1, hops: 0, days: 1, openToday: 0, repeating: 1 }),
  },
  {
    id: 'day-1',
    label: 'New user, day 1',
    view: makeView({ league: 0, scheduled: 12, hops: 0, daysLeft: 7, firstDropPending: true }),
  },
  {
    id: 'bronze-mid',
    label: 'Lily Leaf, mid-week',
    view: makeView({ league: 0, scheduled: 17, hops: 6 }),
  },
  {
    id: 'crammed',
    label: 'Enough habits, too few days',
    view: makeView({ league: 0, scheduled: 7, hops: 5, days: 3, activeDays: 2 }),
  },
  {
    id: 'bud-early',
    label: 'Lily Bud, start of the week',
    view: makeView({ league: 1, scheduled: 14, hops: 1, daysLeft: 6 }),
  },
  {
    id: 'gold-risk',
    label: 'Lily Bloom, demotion zone',
    view: makeView({ league: 2, scheduled: 21, hops: 5, daysLeft: 2, shields: 1 }),
  },
  {
    id: 'silver-landed',
    label: 'Lily Bud, promotion zone',
    view: makeView({
      league: 1,
      scheduled: 15,
      hops: 12,
      isPremium: true,
      forgone: 140,
    }),
  },
  {
    id: 'diamond',
    label: 'Lily Garden',
    view: makeView({ league: 4, scheduled: 21, hops: 18, shields: 2 }),
  },
];

export const LEAP_LAB_JOINS: Array<{ label: string; view: LeapView; join: LeapJoin }> = [
  {
    label: 'First habit, with the gift',
    join: { weekKey: '2026-10-12', giftIds: ['gift_box_1'] },
    view: makeView({ league: 0, scheduled: 12, hops: 1, activeDays: 1, daysLeft: 5 }),
  },
  {
    label: 'First habit, last day of the week',
    join: { weekKey: '2026-10-12', giftIds: [] },
    view: makeView({ league: 0, scheduled: 5, hops: 1, days: 1, activeDays: 1, daysLeft: 1 }),
  },
];

const RESULT_BASE: Omit<LeapWeekResult, 'outcome' | 'leagueBefore' | 'leagueAfter'> = {
  weekKey: '2026-10-05',
  hops: 14,
  scheduled: 17,
  newBest: false,
  fliesGranted: 96,
  grantedItemIds: ['gift_box_rare'],
  shieldsLeft: 1,
  weeksSettled: 1,
};

export const LEAP_LAB_RESULTS: Array<{ label: string; result: LeapWeekResult }> = (
  [
    ['Advanced', 'up', 1, 2, { newBest: true }],
    ['First week, advanced', 'up', 0, 1, { newBest: true, firstWeek: true, hops: 9, scheduled: 12 }],
    ['First week, stayed', 'stay', 0, 0, { firstWeek: true, hops: 4, scheduled: 12, fliesGranted: 18, grantedItemIds: ['gift_box_1'] }],
    ['Stayed on top', 'top', 4, 4, {}],
    ['Stayed', 'stay', 2, 2, { hops: 8 }],
    ['Lily Pad saved it', 'covered', 3, 3, { hops: 2, shieldsLeft: 0 }],
    ['Demoted', 'down', 3, 2, { hops: 1, fliesGranted: 2, grantedItemIds: [] }],
  ] as Array<[string, LeapWeekOutcome, number, number, Partial<LeapWeekResult>]>
).map(([label, outcome, leagueBefore, leagueAfter, extra]) => ({
  label,
  result: {
    ...RESULT_BASE,
    ...extra,
    outcome,
    leagueBefore,
    leagueAfter,
    weekKey: `lab-${label}`,
  },
}));

export function labHop(
  kind: 'hop' | 'comeback' | 'lucky' | 'first' | 'hold' | 'leap' | 'top',
): LeapHopResult {
  const grant = { fliesGranted: 0, grantedItemIds: [], grantedBackgroundIds: [], shieldsGranted: 0 };
  const base: LeapHopResult = {
    hops: 1,
    hopFlies: 3,
    comebackFlies: 0,
    lucky: null,
    marks: [],
    fliesGranted: 3,
    grantedItemIds: [],
    grantedBackgroundIds: [],
    shieldsGranted: 0,
    meter: { hops: 4, target: 9, holdTarget: 6, reached: [] },
    league: 1,
    leagueLabel: 'Lily Bud',
    nextLeagueLabel: 'Lily Bloom',
    weekKey: '2026-10-12',
    joined: false,
    isPremium: false,
    catalog: {},
  };
  switch (kind) {
    case 'comeback':
      return { ...base, comebackFlies: 6 };
    case 'lucky':
      return { ...base, lucky: { ...grant, fliesGranted: 13, first: false } };
    case 'first':
      return {
        ...base,
        league: 0,
        leagueLabel: 'Lily Leaf',
        nextLeagueLabel: 'Lily Bud',
        joined: true,
        meter: { hops: 1, target: 6, holdTarget: 5, reached: [] },
        grantedItemIds: ['gift_box_1'],
        lucky: { ...grant, grantedItemIds: ['gift_box_1'], first: true },
      };
    case 'hold':
      return {
        ...base,
        marks: [{ ...grant, fliesGranted: 13, id: 'hold' }],
        meter: { ...base.meter, hops: 6, reached: ['hold'] },
      };
    case 'leap':
      return {
        ...base,
        marks: [{ ...grant, fliesGranted: 31, grantedItemIds: ['gift_box_1'], id: 'leap' }],
        meter: { ...base.meter, hops: 9, reached: ['hold', 'leap'] },
      };
    case 'top':
      return {
        ...base,
        league: 4,
        leagueLabel: 'Lily Garden',
        nextLeagueLabel: null,
        marks: [{ ...grant, fliesGranted: 80, id: 'leap' }],
        meter: { hops: 17, target: 17, holdTarget: 9, reached: ['hold', 'leap'] },
      };
    default:
      return base;
  }
}
