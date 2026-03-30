export type MacroCategoryId =
  | 'sport'
  | 'family'
  | 'mindfulness'
  | 'house_chores'
  | 'sleep';

export type QuestRewardType = 'FLIES' | 'ITEM' | 'BOX' | 'ANIMATION';

export type QuestReward = {
  type: QuestRewardType;
  amount?: number;
  itemId?: string;
  animationId?: string;
  label?: string;
};

export type TierRewards = {
  free: QuestReward[];
  premium: QuestReward[];
};

export type DailyQuestKind =
  | 'complete_tasks'
  | 'add_tasks'
  | 'complete_habits'
  | 'add_habits'
  | 'focus_minutes';

export type CampaignObjectiveKind =
  | 'complete_tag_tasks'
  | 'add_tag_tasks'
  | 'complete_tag_habits'
  | 'add_tag_habits'
  | 'focus_tag_minutes'
  | 'habit_streak';

export type FocusCategoryTagMap = {
  categoryId: MacroCategoryId;
  tagIds: string[];
};

export type FocusProfile = {
  completedAt?: Date | string | null;
  selectedCategoryIds: MacroCategoryId[];
  categoryTagMap: FocusCategoryTagMap[];
  suggestedContentCreatedAt?: Date | string | null;
  unlockedAnimationIds?: string[];
};

export type DailyQuestProgressView = {
  id: string;
  kind: DailyQuestKind;
  windowKey: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  claimable: boolean;
  claimed: boolean;
  rewards: TierRewards;
};

export type CampaignObjectiveView = {
  id: string;
  kind: CampaignObjectiveKind;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  tagIds?: string[];
  habitId?: string;
  habitName?: string;
};

export type CampaignProgressView = {
  id: string;
  categoryId: MacroCategoryId;
  categoryName: string;
  title: string;
  subtitle: string;
  durationDays: number;
  startsAt: string;
  endsAt: string;
  secondsLeft: number;
  objectives: CampaignObjectiveView[];
  completed: boolean;
  claimable: boolean;
  claimed: boolean;
  expired: boolean;
  rewards: TierRewards;
};

export type MacroCategoryDefinition = {
  id: MacroCategoryId;
  name: string;
  shortLabel: string;
  description: string;
  accent: string;
  backgroundFrom: string;
  backgroundTo: string;
  taskSuggestions: string[];
  habitSuggestions: Array<{ text: string; timesPerWeek: number }>;
  campaignHeadlines: string[];
  durationDaysOptions: number[];
  premiumAnimationId: string;
};
