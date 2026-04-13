export type MacroCategoryId = string;

export type QuestRewardType = 'FLIES' | 'ITEM' | 'BOX';

export type QuestReward = {
  type: QuestRewardType;
  amountMode?: QuestAmountMode;
  amount?: number;
  minAmount?: number;
  maxAmount?: number;
  itemId?: string;
};

export type QuestRewards = QuestReward[];

export type QuestPlacement = 'daily' | 'category';
export type QuestSubject = 'task' | 'habit' | 'any';
export type QuestCountAction = 'complete' | 'add';
export type QuestAmountMode = 'fixed' | 'random';
export type QuestLogicType = 'count' | 'focus_minutes';
export type QuestVisibilityMetric =
  | 'daily_tasks_count'
  | 'total_habits_count'
  | 'tags_count';
export type QuestVisibilityOperator = 'gt' | 'lt';

export type QuestLogicBlock = {
  id: string;
  type: QuestLogicType;
  subject: QuestSubject;
  amountMode: QuestAmountMode;
  amount?: number;
  minAmount?: number;
  maxAmount?: number;
  action?: QuestCountAction;
  tagMode?: 'ignore' | 'random_user_tag' | 'focus_category_tags';
  rewards?: QuestRewards;
};

export type QuestVisibilityCondition = {
  id: string;
  metric: QuestVisibilityMetric;
  operator: QuestVisibilityOperator;
  value: number;
};

export type ResolvedQuestLogicBlock = QuestLogicBlock & {
  target: number;
  progress: number;
  resolvedTagId?: string;
  resolvedTagIds?: string[];
  resolvedTagName?: string;
  resolvedTagNames?: string[];
};

export type QuestTemplateView = {
  id: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  placement: QuestPlacement;
  categoryId?: MacroCategoryId;
  durationMinutes?: number;
  rewards: QuestRewards;
  logic: QuestLogicBlock[];
  visibilityConditions: QuestVisibilityCondition[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

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

export type QuestProgressView = {
  id: string;
  templateId: string;
  placement: QuestPlacement;
  categoryId?: MacroCategoryId;
  windowKey: string;
  title: string;
  description: string;
  coverImageUrl?: string;
  durationMinutes?: number;
  startedAt?: string;
  expiresAt?: string;
  target: number;
  progress: number;
  completed: boolean;
  claimable: boolean;
  claimed: boolean;
  rewards: QuestRewards;
  logic: ResolvedQuestLogicBlock[];
  claimedObjectiveIds: string[];
};

export type DailyQuestProgressView = QuestProgressView & {
  placement: 'daily';
};

export type CategoryQuestProgressView = QuestProgressView & {
  placement: 'category';
  categoryId: MacroCategoryId;
};

export type MacroCategoryDefinition = {
  id: MacroCategoryId;
  name: string;
  shortLabel: string;
  description: string;
  coverImageUrl?: string;
  accent: string;
  backgroundFrom: string;
  backgroundTo: string;
  taskSuggestions: string[];
  habitSuggestions: Array<{ text: string; timesPerWeek: number }>;
  campaignHeadlines: string[];
  durationDaysOptions: number[];
  premiumAnimationId: string;
};
