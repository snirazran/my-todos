import type { QuestRewards } from './types';

export type MilestoneMetric =
  | 'tasks_done'
  | 'outfits_owned'
  | 'trades_made'
  | 'focus_minutes';

export type MilestoneStep = {
  target: number;
  rewards: QuestRewards;
};

export type MilestoneTrack = {
  id: string;
  name: string;
  emoji: string;
  metric: MilestoneMetric;
  steps: MilestoneStep[];
  repeatEvery: number;
  isActive: boolean;
};

export type MilestoneConfig = {
  isActive: boolean;
  tracks: MilestoneTrack[];
};

export type MilestoneRowView = {
  trackId: string;
  name: string;
  emoji: string;
  metric: MilestoneMetric;
  level: number;
  totalLevels: number | null;
  label: string;
  progress: number;
  target: number;
  previousTarget: number;
  rewards: QuestRewards;
  claimable: boolean;
  complete: boolean;
  readyLevels: number;
};

export type MilestoneBoardView = {
  rows: MilestoneRowView[];
  claimableCount: number;
};

export const MILESTONE_LIMITS = {
  maxTracks: 24,
  maxSteps: 20,
  maxTarget: 1_000_000,
  maxRewardsPerStep: 3,
};

type MetricCopy = {
  adminLabel: string;
  adminHint: string;
  unit: string;
  label: (n: number) => string;
};

function formatMinutes(n: number) {
  if (n >= 60 && n % 60 === 0) {
    const hours = n / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return n === 1 ? '1 minute' : `${n} minutes`;
}

export const MILESTONE_METRICS: Record<MilestoneMetric, MetricCopy> = {
  tasks_done: {
    adminLabel: 'Tasks finished',
    adminHint: 'Every tick counts, including each day of a repeating task.',
    unit: 'tasks',
    label: (n) => (n === 1 ? 'Finish your first task' : `Finish ${n} tasks`),
  },
  outfits_owned: {
    adminLabel: 'Outfits owned',
    adminHint: 'Different hats, outfits, held items and colors in the closet.',
    unit: 'outfits',
    label: (n) => (n === 1 ? 'Collect an outfit' : `Collect ${n} outfits`),
  },
  trades_made: {
    adminLabel: 'Trade-ups made',
    adminHint: 'Counted from the day the app started tracking trades.',
    unit: 'trades',
    label: (n) => (n === 1 ? 'Make a trade-up' : `Make ${n} trade-ups`),
  },
  focus_minutes: {
    adminLabel: 'Focus timer minutes',
    adminHint: 'Total minutes focused with the timer, across all sessions.',
    unit: 'min',
    label: (n) => `Focus for ${formatMinutes(n)}`,
  },
};

export const MILESTONE_METRIC_KEYS = Object.keys(
  MILESTONE_METRICS,
) as MilestoneMetric[];

export function isMilestoneMetric(value: unknown): value is MilestoneMetric {
  return (
    typeof value === 'string' &&
    (MILESTONE_METRIC_KEYS as string[]).indexOf(value) >= 0
  );
}

const flies = (amount: number) => [
  { type: 'FLIES' as const, amountMode: 'fixed' as const, amount },
];

function ladder(targets: number[], maxFlies = 30): MilestoneStep[] {
  return targets.map((target, index) => ({
    target,
    rewards: flies(Math.min(maxFlies, 5 + 5 * Math.floor(index / 2))),
  }));
}

export const DEFAULT_MILESTONE_CONFIG: MilestoneConfig = {
  isActive: true,
  tracks: [
    {
      id: 'task-master',
      name: 'Task Master',
      emoji: '✅',
      metric: 'tasks_done',
      steps: ladder([3, 5, 10, 15, 20, 25, 35, 45, 60, 75, 100]),
      repeatEvery: 25,
      isActive: true,
    },
    {
      id: 'collector',
      name: 'Collector',
      emoji: '👒',
      metric: 'outfits_owned',
      steps: ladder([1, 3, 5, 8, 12, 16, 20, 25, 30, 40, 50]),
      repeatEvery: 10,
      isActive: true,
    },
    {
      id: 'trader',
      name: 'Trader',
      emoji: '🔄',
      metric: 'trades_made',
      steps: ladder([1, 2, 3, 5, 8, 12, 16, 20, 25, 30]),
      repeatEvery: 5,
      isActive: true,
    },
    {
      id: 'deep-focus',
      name: 'Deep Focus',
      emoji: '⏱️',
      metric: 'focus_minutes',
      steps: ladder([15, 30, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200]),
      repeatEvery: 300,
      isActive: true,
    },
  ],
};

export function milestoneStepAt(
  track: Pick<MilestoneTrack, 'steps' | 'repeatEvery'>,
  index: number,
): MilestoneStep | null {
  if (index < 0) return null;
  if (index < track.steps.length) return track.steps[index];
  const last = track.steps[track.steps.length - 1];
  if (!last || track.repeatEvery <= 0) return null;
  const extra = index - track.steps.length + 1;
  return {
    target: last.target + extra * track.repeatEvery,
    rewards: last.rewards,
  };
}

export const MILESTONE_MAX_LEVELS_PER_CLAIM = 200;

export function reachedMilestoneSteps(
  track: Pick<MilestoneTrack, 'steps' | 'repeatEvery'>,
  value: number,
  claimed: number,
): MilestoneStep[] {
  const reached: MilestoneStep[] = [];
  let index = Math.max(0, Math.floor(claimed));
  while (reached.length < MILESTONE_MAX_LEVELS_PER_CLAIM) {
    const step = milestoneStepAt(track, index);
    if (!step || value < step.target) break;
    reached.push(step);
    index += 1;
  }
  return reached;
}

export function mergeMilestoneRewards(steps: MilestoneStep[]): QuestRewards {
  let flies = 0;
  let shields = 0;
  const boxes: Record<string, number> = {};
  const rest: QuestRewards = [];
  steps.forEach((step) => {
    step.rewards.forEach((reward) => {
      if (reward.type === 'FLIES') flies += Math.max(0, Math.floor(reward.amount ?? 0));
      else if (reward.type === 'SHIELD') shields += Math.max(1, Math.floor(reward.amount ?? 1));
      else if (reward.type === 'BOX' && reward.itemId) {
        boxes[reward.itemId] = (boxes[reward.itemId] ?? 0) + Math.max(1, reward.amount ?? 1);
      } else rest.push(reward);
    });
  });
  const merged: QuestRewards = [];
  if (flies > 0) merged.push({ type: 'FLIES', amount: flies });
  Object.keys(boxes).forEach((itemId) => {
    merged.push({ type: 'BOX', itemId, amount: boxes[itemId] });
  });
  if (shields > 0) merged.push({ type: 'SHIELD', amount: shields });
  return merged.concat(rest);
}

export function buildMilestoneRow(
  track: MilestoneTrack,
  value: number,
  claimed: number,
): MilestoneRowView {
  const safeClaimed = Math.max(0, Math.floor(claimed));
  const step = milestoneStepAt(track, safeClaimed);
  const previous = milestoneStepAt(track, safeClaimed - 1);
  const copy = MILESTONE_METRICS[track.metric];
  const progress = Math.max(0, Math.floor(value));
  const totalLevels = track.repeatEvery > 0 ? null : track.steps.length;
  if (!step) {
    const last = track.steps[track.steps.length - 1];
    const target = last?.target ?? 0;
    return {
      trackId: track.id,
      name: track.name,
      emoji: track.emoji,
      metric: track.metric,
      level: track.steps.length,
      totalLevels,
      label: copy.label(target),
      progress,
      target,
      previousTarget: target,
      rewards: [],
      claimable: false,
      complete: true,
      readyLevels: 0,
    };
  }
  const reached = reachedMilestoneSteps(track, progress, safeClaimed);
  if (reached.length > 1) {
    const top = reached[reached.length - 1];
    return {
      trackId: track.id,
      name: track.name,
      emoji: track.emoji,
      metric: track.metric,
      level: safeClaimed + reached.length,
      totalLevels,
      label: copy.label(top.target),
      progress,
      target: top.target,
      previousTarget: previous?.target ?? 0,
      rewards: mergeMilestoneRewards(reached),
      claimable: true,
      complete: false,
      readyLevels: reached.length,
    };
  }
  return {
    trackId: track.id,
    name: track.name,
    emoji: track.emoji,
    metric: track.metric,
    level: safeClaimed + 1,
    totalLevels,
    label: copy.label(step.target),
    progress,
    target: step.target,
    previousTarget: previous?.target ?? 0,
    rewards: step.rewards,
    claimable: progress >= step.target,
    complete: false,
    readyLevels: progress >= step.target ? 1 : 0,
  };
}

export function sortMilestoneRows(rows: MilestoneRowView[]) {
  const rank = (row: MilestoneRowView) =>
    row.claimable ? 0 : row.complete ? 2 : 1;
  const ratio = (row: MilestoneRowView) => {
    const span = Math.max(1, row.target - row.previousTarget);
    return Math.min(1, Math.max(0, row.progress - row.previousTarget) / span);
  };
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const byRank = rank(a.row) - rank(b.row);
      if (byRank !== 0) return byRank;
      if (rank(a.row) === 1) {
        const byRatio = ratio(b.row) - ratio(a.row);
        if (Math.abs(byRatio) > 0.001) return byRatio;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}
