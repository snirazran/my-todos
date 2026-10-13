import UserModel from '@/lib/models/User';
import { buildRewardCatalog } from '@/lib/quests/engine';
import { getFullCatalog } from '@/lib/skins/getCatalog';
import { getRewardPool, type GiftPrize } from '@/lib/skins/gifts';
import {
  loadShieldConfig,
  readShieldState,
  shieldCapFor,
} from '@/lib/shields/engine';
import { daysBetweenYMD, shiftYMD } from '@/lib/weekStart';
import type { QuestReward } from '@/lib/quests/types';
import { creditHops } from './hop';
import { scaleFlies } from './rewards';
import { payPlusBacklog } from './settle';
import { clampLeague } from './state';
import { loadLeapContext, type LeapContext } from './sync';
import { markTargets } from './week';
import type {
  BonusRewards,
  LeapConfigView,
  LeapHopResult,
  LeapMarkId,
  LeapMarkView,
  LeapPrizePreview,
  LeapView,
} from './types';

const PREVIEW_PER_RARITY = 6;

function previewRarities(config: LeapConfigView): string[] {
  const seen: Record<string, true> = {};
  config.leagues.forEach((league) => {
    [
      ...league.reachRewards,
      ...league.plusReachRewards,
      ...league.weekRewards,
      ...league.plusWeekRewards,
    ].forEach(
      (reward) => {
        if (reward.type === 'RARITY_ITEM') seen[reward.rarity] = true;
      },
    );
  });
  return Object.keys(seen);
}

function seededRank(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildRarityPreview(args: {
  pool: GiftPrize[];
  rarities: string[];
  seed: string;
  owns: (prize: GiftPrize) => boolean;
}): Record<string, LeapPrizePreview[]> {
  const preview: Record<string, LeapPrizePreview[]> = {};
  args.rarities.forEach((rarity) => {
    preview[rarity] = args.pool
      .filter((prize) => prize.rarity === rarity)
      .map((prize) => ({
        prize,
        owned: args.owns(prize) ? 1 : 0,
        rank: seededRank(`${args.seed}:${rarity}:${prize.kind}:${prize.id}`),
      }))
      .sort((a, b) => a.owned - b.owned || a.rank - b.rank)
      .slice(0, PREVIEW_PER_RARITY)
      .map(({ prize }) => ({ kind: prize.kind, id: prize.id }));
  });
  return preview;
}

function catalogRewardSets(config: LeapConfigView): QuestReward[][] {
  const sets: BonusRewards[] = [
    config.firstHopRewards,
    ...config.luckyDrops.map((drop) => drop.rewards),
    ...config.leagues.flatMap((league) => [
      league.weekRewards,
      league.reachRewards,
      league.plusReachRewards,
      league.plusWeekRewards,
    ]),
  ];
  return sets.map(
    (set) => set.filter((reward) => reward.type !== 'RARITY_ITEM') as QuestReward[],
  );
}

const EMPTY_MARK = (id: LeapMarkId): LeapMarkView => ({
  id,
  target: 0,
  minDays: 0,
  available: false,
  reached: false,
});

export function disabledLeapView(): LeapView {
  return {
    enabled: false,
    isPremium: false,
    league: 0,
    bestLeague: 0,
    leagues: [],
    week: {
      weekKey: '',
      todayKey: '',
      daysLeft: 0,
      scheduled: 0,
      hops: 0,
      activeDays: 0,
      scheduledDays: 0,
      open: 0,
      openToday: 0,
      hold: EMPTY_MARK('hold'),
      leap: EMPTY_MARK('leap'),
      leapFlies: 0,
      holdFlies: 0,
      habits: 0,
    },
    shields: { count: 0, cap: 0 },
    hopFlies: 0,
    firstDropPending: false,
    forgoneFlies: 0,
    weekResult: null,
    rewardCatalog: {},
    rarityPreview: {},
  };
}

export async function buildLeapView(ctx: LeapContext): Promise<LeapView> {
  const { config, state, ledger, weekDoc, isPremium, todayKey, currentWeek } =
    ctx;
  const multiplier = Math.max(1, weekDoc.multiplier ?? 1);
  const reached = new Set<LeapMarkId>(weekDoc.marks ?? []);
  const targets = markTargets(config, ledger.scheduled, ledger.scheduledDays);
  const markView = (id: LeapMarkId): LeapMarkView => {
    const mark = targets.find((entry) => entry.id === id);
    if (!mark) return EMPTY_MARK(id);
    return {
      id,
      target: mark.target,
      minDays: mark.minDays,
      available: mark.available || reached.has(id),
      reached: reached.has(id),
    };
  };

  const league = clampLeague(config, state.league);
  const rarities = previewRarities(config);
  const [shieldConfig, shieldUser, fullCatalog, pool] = await Promise.all([
    loadShieldConfig(),
    UserModel.findById(ctx.userId)
      .select('quests wardrobe.inventory wardrobe.backgrounds.inventory')
      .lean(),
    getFullCatalog(),
    rarities.length ? getRewardPool() : Promise.resolve([] as GiftPrize[]),
  ]);
  const shieldState = readShieldState(shieldUser);
  const wardrobe = (shieldUser as { wardrobe?: any } | null)?.wardrobe;
  const rarityPreview = buildRarityPreview({
    pool,
    rarities,
    seed: `${ctx.userId}:${currentWeek}`,
    owns: (prize) =>
      ((prize.kind === 'background'
        ? wardrobe?.backgrounds?.inventory?.[prize.id]
        : wardrobe?.inventory?.[prize.id]) ?? 0) > 0,
  });
  const previewIds: Record<string, true> = {};
  Object.keys(rarityPreview).forEach((rarity) => {
    rarityPreview[rarity].forEach((entry) => {
      previewIds[entry.id] = true;
    });
  });
  const previewRewards: QuestReward[] = Object.keys(rarityPreview).reduce(
    (list, rarity) =>
      list.concat(
        rarityPreview[rarity].map((entry): QuestReward =>
          entry.kind === 'background'
            ? { type: 'BACKGROUND', backgroundId: entry.id }
            : { type: 'ITEM', itemId: entry.id },
        ),
      ),
    [] as QuestReward[],
  );
  const previewBackgrounds = pool
    .filter((prize) => prize.kind === 'background' && previewIds[prize.id])
    .map((prize) => ({
      id: prize.id,
      name: prize.name,
      rarity: prize.rarity,
      imageUrl: prize.imageUrl,
    }));
  const weekEnd = shiftYMD(currentWeek, 6);

  return {
    enabled: true,
    isPremium,
    league,
    bestLeague: state.bestLeague,
    leagues: config.leagues.map((entry, index) => ({
      index,
      label: entry.label,
      multiplier: entry.multiplier,
      weekRewards: entry.weekRewards,
      reachRewards: entry.reachRewards,
      plusReachRewards: entry.plusReachRewards,
      plusWeekRewards: entry.plusWeekRewards,
      weekFlies: scaleFlies(config.marks.leap.flies, entry.multiplier, false),
      reached: index <= state.bestLeague,
    })),
    week: {
      weekKey: currentWeek,
      todayKey,
      daysLeft: Math.max(0, daysBetweenYMD(todayKey, weekEnd) + 1),
      scheduled: ledger.scheduled,
      hops: ledger.hops,
      activeDays: ledger.activeDays,
      scheduledDays: ledger.scheduledDays,
      open: ledger.open,
      openToday: ledger.openToday,
      hold: markView('hold'),
      leap: markView('leap'),
      leapFlies: scaleFlies(config.marks.leap.flies, multiplier, isPremium),
      holdFlies: scaleFlies(config.marks.hold.flies, multiplier, isPremium),
      habits: ledger.habits.length,
    },
    shields: {
      count: shieldState.count,
      cap: shieldCapFor(shieldConfig, isPremium),
    },
    hopFlies: scaleFlies(config.hopFlies, multiplier, isPremium),
    firstDropPending: !state.luck.firstDone && config.firstHopRewards.length > 0,
    forgoneFlies: state.forgoneFlies,
    weekResult: state.pendingResult,
    rewardCatalog: buildRewardCatalog(
      fullCatalog,
      [...catalogRewardSets(config), previewRewards],
      previewBackgrounds,
    ),
    rarityPreview,
  };
}

export async function getLeapView(args: {
  userId: string;
  timezone: string;
}): Promise<{ view: LeapView; hop: LeapHopResult | null }> {
  const ctx = await loadLeapContext(args);
  if (!ctx) return { view: disabledLeapView(), hop: null };
  const hop = await creditHops(ctx);
  if (ctx.isPremium) {
    await payPlusBacklog({
      userId: ctx.userId,
      config: ctx.config,
      state: ctx.state,
      dayKey: ctx.todayKey,
    });
  }
  return { view: await buildLeapView(ctx), hop };
}

export async function creditLeapHops(args: {
  userId: string;
  timezone: string;
}): Promise<LeapHopResult | null> {
  const ctx = await loadLeapContext(args);
  if (!ctx) return null;
  return creditHops(ctx);
}
