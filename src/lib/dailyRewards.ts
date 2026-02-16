import type { ItemDef } from './skins/catalog';

export type RewardType = 'FLIES' | 'ITEM' | 'BOX';

export type DailyRewardDef = {
  day: number;
  free: {
    type: RewardType;
    amount?: number; // For flies
    itemId?: string; // For specific items or boxes
  };
  premium: {
    type: RewardType;
    amount?: number;
    itemId?: string;
  };
};

// 30-day schedule
export const REWARD_SCHEDULE: DailyRewardDef[] = Array.from(
  { length: 31 },
  (_, i) => {
    const day = i + 1;
    const isMilestone = day % 5 === 0;
    const isBigMilestone = day % 30 === 0;

    // Base rewards
    let freeReward: DailyRewardDef['free'] = { type: 'FLIES', amount: 100 };
    let premiumReward: DailyRewardDef['premium'] = {
      type: 'FLIES',
      amount: 300,
    };

    if (isBigMilestone) {
      // day 30
      freeReward = { type: 'BOX', itemId: 'box_gold' };
      premiumReward = { type: 'BOX', itemId: 'box_diamond' };
    } else if (isMilestone) {
      // day 5, 10, 15, 20, 25
      freeReward = { type: 'BOX', itemId: 'box_silver' };
      premiumReward = { type: 'BOX', itemId: 'box_gold' };
    } else {
      // Regular days
      // Small variance for fun could be added here
      freeReward = { type: 'FLIES', amount: 50 + day * 5 };
      premiumReward = { type: 'FLIES', amount: 150 + day * 10 };

      // Inject specific items
      if (day === 3) {
        freeReward = { type: 'ITEM', itemId: 'scarf_red' };
      }
      if (day === 7) {
        premiumReward = { type: 'ITEM', itemId: 'glasses_patch' };
      }
      if (day === 14) {
        premiumReward = { type: 'ITEM', itemId: 'hat_pirate' };
      }
      if (day === 21) {
        premiumReward = { type: 'ITEM', itemId: 'skin_blue' };
      }
    }

    return {
      day,
      free: freeReward,
      premium: premiumReward,
    };
  },
);

export function getRewardForDay(day: number): DailyRewardDef | undefined {
  return REWARD_SCHEDULE.find((r) => r.day === day);
}

export function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
