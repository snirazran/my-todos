import { FLY_ECONOMY_DEFAULTS } from '@/lib/economy/defaults';
import { LEAP_DEFAULTS } from '@/lib/leap/defaults';
import {
  SWEEP_DEFAULTS,
  SWEEP_DEFAULT_GOLDEN_ROLL,
  SWEEP_DEFAULT_MEGA_REWARDS,
  SWEEP_DEFAULT_STANDARD_ROLL,
} from '@/lib/models/QuestStreakConfig';
import { DEFAULT_GOAL_TIERS } from '@/lib/models/LoginStreakConfig';
import type { RescaleTargets } from './rescaleCore';

export const ECONOMY_ITEM_PRICES = {
  common: 15,
  uncommon: 35,
  rare: 70,
  epic: 160,
  legendary: 500,
};

export const ECONOMY_BACKGROUND_PRICES = {
  common: 10,
  uncommon: 20,
  rare: 35,
  epic: 60,
};

export const DAILY_SLOT_FLIES = [1, 2, 2, 2];
export const CATEGORY_SLOT_FLIES = [1, 1, 2, 2, 3, 4];

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function buildRescaleTargets(): RescaleTargets {
  const economy = FLY_ECONOMY_DEFAULTS;
  return {
    itemPrices: { ...ECONOMY_ITEM_PRICES },
    backgroundPrices: { ...ECONOMY_BACKGROUND_PRICES },
    flyEconomy: copy({
      taskIncome: {
        dailyCapFree: economy.taskIncome.dailyCapFree,
        dailyCapPlus: economy.taskIncome.dailyCapPlus,
      },
      checklist: { tiers: economy.checklist.tiers },
      taskStreak: {
        tiers: economy.taskStreak.tiers,
        milestones: economy.taskStreak.milestones,
        repeatEveryDays: economy.taskStreak.repeatEveryDays,
        repeatFlies: economy.taskStreak.repeatFlies,
        repeatGiftItemId: economy.taskStreak.repeatGiftItemId,
        repeatShields: economy.taskStreak.repeatShields,
      },
      buddy: { bonusFlies: economy.buddy.bonusFlies },
      friendsPond: {
        fliesPerGeneration: economy.friendsPond.fliesPerGeneration,
        dailyCapFree: economy.friendsPond.dailyCapFree,
        dailyCapPlus: economy.friendsPond.dailyCapPlus,
        perFriendDailyCap: economy.friendsPond.perFriendDailyCap,
      },
      rewardedAds: {
        reward: economy.rewardedAds.reward,
        dailyCap: economy.rewardedAds.dailyCap,
      },
      shopGift: {
        fullBelowBalance: economy.shopGift.fullBelowBalance,
        floorFromBalance: economy.shopGift.floorFromBalance,
        maxFlies: economy.shopGift.maxFlies,
        minFlies: economy.shopGift.minFlies,
      },
      circuitBreaker: { dailyCap: economy.circuitBreaker.dailyCap },
    }),
    leap: copy({
      hopFlies: LEAP_DEFAULTS.hopFlies,
      hopsPaidPerDay: LEAP_DEFAULTS.hopsPaidPerDay,
      comebackFlies: LEAP_DEFAULTS.comebackFlies,
      luckyDrops: LEAP_DEFAULTS.luckyDrops,
      holdFlies: LEAP_DEFAULTS.marks.hold.flies,
      leapFlies: LEAP_DEFAULTS.marks.leap.flies,
      leagues: LEAP_DEFAULTS.leagues.map((league) => ({
        weekRewards: league.weekRewards,
        plusWeekRewards: league.plusWeekRewards,
        reachRewards: league.reachRewards,
        plusReachRewards: league.plusReachRewards,
      })),
    }) as RescaleTargets['leap'],
    sweep: copy({
      cleanSweepFlies: SWEEP_DEFAULTS.cleanSweepFlies,
      standardRoll: SWEEP_DEFAULT_STANDARD_ROLL,
      goldenRoll: SWEEP_DEFAULT_GOLDEN_ROLL,
      megaRewards: SWEEP_DEFAULT_MEGA_REWARDS,
    }),
    loginGoalTiers: copy(DEFAULT_GOAL_TIERS) as RescaleTargets['loginGoalTiers'],
    dailySlotFlies: [...DAILY_SLOT_FLIES],
    categorySlotFlies: [...CATEGORY_SLOT_FLIES],
  };
}
