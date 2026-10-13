import { LEAP_DEFAULTS } from './defaults';
import type {
  LeapHopResult,
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
  openToday?: number;
  holdReached?: boolean;
  leapReached?: boolean;
  shields?: number;
  isPremium?: boolean;
  forgone?: number;
  firstDropPending?: boolean;
}): LeapView {
  const isPremium = !!args.isPremium;
  const leagues = LEAP_DEFAULTS.leagues;
  const multiplier = leagues[args.league]?.multiplier ?? 1;
  const plus = isPremium ? 2 : 1;
  const hold = Math.max(2, Math.ceil(args.scheduled * 0.4));
  const leap = Math.max(3, Math.ceil(args.scheduled * 0.7));
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
      daysLeft: 4,
      scheduled: args.scheduled,
      hops: args.hops,
      activeDays: args.activeDays ?? Math.min(args.hops, 3),
      scheduledDays: args.days ?? 7,
      open: Math.max(0, args.scheduled - args.hops),
      openToday: args.openToday ?? 2,
      hold: {
        id: 'hold',
        target: hold,
        minDays: 2,
        available: args.scheduled >= 2,
        reached: !!args.holdReached,
      },
      leap: {
        id: 'leap',
        target: leap,
        minDays: 3,
        available: args.scheduled >= 3,
        reached: !!args.leapReached,
      },
      leapFlies: Math.round(25 * multiplier * plus),
      holdFlies: Math.round(10 * multiplier * plus),
      habits: args.scheduled > 0 ? 3 : 0,
    },
    shields: { count: args.shields ?? 0, cap: isPremium ? 3 : 2 },
    hopFlies: Math.round(2 * multiplier * plus),
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
    id: 'day-1',
    label: 'New user, day 1',
    view: makeView({ league: 0, scheduled: 12, hops: 0, firstDropPending: true }),
  },
  {
    id: 'bronze-mid',
    label: 'Lily Leaf, mid-week',
    view: makeView({ league: 0, scheduled: 17, hops: 7, holdReached: true }),
  },
  {
    id: 'gold-risk',
    label: 'Lily Bloom, demotion zone',
    view: makeView({ league: 2, scheduled: 21, hops: 5, shields: 1 }),
  },
  {
    id: 'silver-landed',
    label: 'Lily Bud, promotion zone',
    view: makeView({
      league: 1,
      scheduled: 15,
      hops: 12,
      holdReached: true,
      leapReached: true,
      isPremium: true,
      forgone: 140,
    }),
  },
  {
    id: 'diamond',
    label: 'Lily Garden',
    view: makeView({ league: 4, scheduled: 21, hops: 16, holdReached: true, leapReached: true, shields: 2 }),
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
  kind: 'hop' | 'comeback' | 'lucky' | 'first' | 'hold' | 'leap',
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
    meter: { hops: 6, target: 12, holdTarget: 7, reached: [] },
    league: 1,
    leagueLabel: 'Lily Bud',
    nextLeagueLabel: 'Lily Bloom',
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
        meter: { hops: 1, target: 12, holdTarget: 5, reached: [] },
        lucky: { ...grant, grantedItemIds: ['gift_box_1'], first: true },
      };
    case 'hold':
      return {
        ...base,
        marks: [{ ...grant, fliesGranted: 13, id: 'hold' }],
        meter: { ...base.meter, hops: 7, reached: ['hold'] },
      };
    case 'leap':
      return {
        ...base,
        marks: [{ ...grant, fliesGranted: 31, grantedItemIds: ['gift_box_1'], id: 'leap' }],
        meter: { ...base.meter, hops: 12, reached: ['hold', 'leap'] },
      };
    default:
      return base;
  }
}
