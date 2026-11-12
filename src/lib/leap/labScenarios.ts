import { LEAP_DEFAULTS } from './defaults';
import { markTargets, marksMet } from './targets';
import type {
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
  chest?: 'ready' | 'opened' | 'plusOpened';
  join?: LeapJoin | null;
}): LeapView {
  const isPremium = !!args.isPremium;
  const leagues = LEAP_DEFAULTS.leagues;
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
      weekRewards: entry.weekRewards,
      plusWeekRewards: entry.plusWeekRewards,
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
      chest: {
        league: args.league,
        rewards: leagues[args.league]?.weekRewards ?? [],
        plusRewards: leagues[args.league]?.plusWeekRewards ?? [],
        landed: met.includes('leap'),
        claimed: args.chest === 'opened' || args.chest === 'plusOpened',
        plusClaimed: args.chest === 'plusOpened',
      },
      habits: args.scheduled > 0 ? 3 : 0,
    },
    repeating: args.repeating ?? (args.scheduled > 0 ? 3 : 0),
    join: args.join ?? null,
    shields: { count: args.shields ?? 0, cap: isPremium ? 3 : 2 },
    weekResult: null,
    rewardCatalog: {},
    rarityPreview: {},
  };
}

export const LEAP_LAB_SCENARIOS: LeapLabScenario[] = [
  {
    id: 'no-habits',
    label: 'No habits yet',
    view: makeView({ league: 0, scheduled: 0, hops: 0, openToday: 0 }),
  },
  {
    id: 'none-this-week',
    label: 'Has habits, none this week',
    view: makeView({ league: 2, scheduled: 0, hops: 0, openToday: 0, repeating: 2 }),
  },
  {
    id: 'last-day-join',
    label: 'Joined on the last day',
    view: makeView({ league: 0, scheduled: 5, hops: 0, days: 1, daysLeft: 1, openToday: 5 }),
  },
  {
    id: 'weekly-once',
    label: 'Only a once-a-week habit',
    view: makeView({ league: 0, scheduled: 1, hops: 0, days: 1, openToday: 0, repeating: 1 }),
  },
  {
    id: 'day-1',
    label: 'New user, day 1',
    view: makeView({ league: 0, scheduled: 12, hops: 0, daysLeft: 7 }),
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
    id: 'chest-ready',
    label: 'Goal hit, gift ready',
    view: makeView({ league: 1, scheduled: 15, hops: 9 }),
  },
  {
    id: 'chest-opened-free',
    label: 'Gift opened, Plus gift waiting',
    view: makeView({ league: 1, scheduled: 15, hops: 11, chest: 'opened' }),
  },
  {
    id: 'chest-plus-ready',
    label: 'Plus member, gifts ready',
    view: makeView({ league: 2, scheduled: 15, hops: 12, isPremium: true }),
  },
  {
    id: 'diamond',
    label: 'Lily Garden, both gifts opened',
    view: makeView({ league: 4, scheduled: 21, hops: 18, shields: 2, isPremium: true, chest: 'plusOpened' }),
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
  fliesGranted: 25,
  grantedItemIds: ['gift_box_rare'],
  shieldsLeft: 1,
  weeksSettled: 1,
};

export const LEAP_LAB_RESULTS: Array<{ label: string; result: LeapWeekResult }> = (
  [
    ['Advanced', 'up', 1, 2, { newBest: true, moveUpAt: 12, stayAt: 7 }],
    ['First week, advanced', 'up', 0, 1, { newBest: true, firstWeek: true, hops: 9, scheduled: 12, moveUpAt: 6, newItemIds: ['gift_box_1'], newFlies: 20 }],
    ['First week, stayed', 'stay', 0, 0, { firstWeek: true, hops: 4, scheduled: 12, moveUpAt: 6, fliesGranted: 0, grantedItemIds: [] }],
    ['Stayed on top', 'top', 4, 4, { moveUpAt: 14, stayAt: 7 }],
    ['Stayed', 'stay', 2, 2, { hops: 8, moveUpAt: 12, stayAt: 7, fliesGranted: 0, grantedItemIds: [] }],
    ['Lily Pad saved it', 'covered', 3, 3, { hops: 2, shieldsLeft: 0, moveUpAt: 13, stayAt: 7, fliesGranted: 0, grantedItemIds: [] }],
    ['Demoted', 'down', 3, 2, { hops: 1, fliesGranted: 0, grantedItemIds: [], moveUpAt: 13, stayAt: 7 }],
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
