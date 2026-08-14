export type MacroCategoryId = string;

export type QuestRewardType = 'FLIES' | 'ITEM' | 'BOX' | 'BACKGROUND';

export type QuestReward = {
  type: QuestRewardType;
  amountMode?: QuestAmountMode;
  amount?: number;
  minAmount?: number;
  maxAmount?: number;
  itemId?: string;
  backgroundId?: string;
  // Streak prize pool only: relative draw weight (default 1).
  weight?: number;
};

export type QuestRewards = QuestReward[];

/** Max rewards an admin can stack on one lane (free/premium) of a season day. */
export const SEASON_REWARDS_PER_LANE = 2;

export type QuestPlacement = 'daily' | 'onboarding';
export type QuestSubject = 'task' | 'any';
export type QuestCountAction = 'complete' | 'add';
export type QuestAmountMode = 'fixed' | 'random';
export type QuestLogicType =
  | 'count'
  | 'focus_minutes'
  | 'metric_count'
  | 'distinct_days'
  | 'deep_session';
export type QuestVisibilityMetric =
  | 'daily_tasks_count'
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
  tagMode?: 'ignore' | 'random_user_tag';
  // For type 'metric_count': which QuestCounter metric this block tracks.
  metricKey?: string;
  // For type 'deep_session': minutes one unbroken session must reach.
  sessionMinutes?: number;
  // For action 'add': the added tasks must also be completed to credit.
  requiresFollowThrough?: boolean;
  // For action 'complete': the completion must land before this local hour.
  beforeHour?: number;
  // Shown behind a small "?" on the objective row (onboarding quests).
  helpText?: string;
  // Granted complete the moment the quest rolls: the head start a ladder
  // carries over from a previous roll that got far enough to earn one.
  preCredited?: boolean;
  rewards?: QuestRewards;
  // The authored reward, before scaling. `rewards` holds the resolved payout.
  baseRewards?: QuestRewards;
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
  effortToActNow?: number;
  effortToComplete?: number;
  effortAtRiskDays?: number;
};

export type QuestTemplateView = {
  id: string;
  name: string;
  description: string;
  coverImageUrl?: string;
  placement: QuestPlacement;
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
};

export type QuestProgressView = {
  id: string;
  templateId: string;
  placement: QuestPlacement;
  windowKey: string;
  title: string;
  description: string;
  coverImageUrl?: string;
  expiresAt?: string;
  // Last time synced progress increased (quest creation date if never).
  lastProgressAt?: string;
  target: number;
  progress: number;
  completed: boolean;
  claimable: boolean;
  claimed: boolean;
  logic: ResolvedQuestLogicBlock[];
  claimedObjectiveIds: string[];
};

export type DailyQuestProgressView = QuestProgressView & {
  placement: 'daily';
};

export type MacroCategoryDefinition = {
  id: MacroCategoryId;
  name: string;
  shortLabel: string;
  description: string;
  onboardingSentence?: string;
  coverImageUrl?: string;
  accent: string;
  backgroundFrom: string;
  backgroundTo: string;
};
