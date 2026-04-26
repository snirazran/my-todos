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

const TEST_FROG_REWARD_IDS = ['skin_pink', 'skin_blue', 'skin_rainbow'];

// 30-day schedule
export const REWARD_SCHEDULE: DailyRewardDef[] = Array.from(
  { length: 31 },
  (_, i) => {
    const day = i + 1;
    const freeItemId = TEST_FROG_REWARD_IDS[i % TEST_FROG_REWARD_IDS.length];
    const premiumItemId =
      TEST_FROG_REWARD_IDS[(i + 1) % TEST_FROG_REWARD_IDS.length];

    return {
      day,
      free: { type: 'ITEM', itemId: freeItemId },
      premium: { type: 'ITEM', itemId: premiumItemId },
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
