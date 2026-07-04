type MetricCopy = {
  adminLabel: string;
  label: (n: number) => string;
  remaining: (n: number) => string;
};

export const QUEST_METRIC_COPY: Record<string, MetricCopy> = {
  trade_completed: {
    adminLabel: 'Trades completed',
    label: (n) => (n === 1 ? 'Complete a trade' : `Complete ${n} trades`),
    remaining: (n) => `Complete ${n} more ${n === 1 ? 'trade' : 'trades'}`,
  },
  skin_sold: {
    adminLabel: 'Skins sold',
    label: (n) => (n === 1 ? 'Sell a skin' : `Sell ${n} skins`),
    remaining: (n) => `Sell ${n} more ${n === 1 ? 'skin' : 'skins'}`,
  },
  skin_acquired: {
    adminLabel: 'Skins bought or received',
    label: (n) => (n === 1 ? 'Get a new skin' : `Get ${n} new skins`),
    remaining: (n) => `Get ${n} more new ${n === 1 ? 'skin' : 'skins'}`,
  },
  friend_invited: {
    adminLabel: 'Friends invited',
    label: (n) => (n === 1 ? 'Invite a friend' : `Invite ${n} friends`),
    remaining: (n) => `Invite ${n} more ${n === 1 ? 'friend' : 'friends'}`,
  },
  buddy_task_completed: {
    adminLabel: 'Buddy tasks (both finished)',
    label: (n) =>
      n === 1
        ? 'Finish a task with your buddy'
        : `Finish ${n} tasks with your buddy`,
    remaining: (n) =>
      `Finish ${n} more ${n === 1 ? 'task' : 'tasks'} with your buddy`,
  },
  task_streak_3: {
    adminLabel: 'Task streak reached',
    label: (n) =>
      n === 1
        ? 'Reach a 3-day streak on a repeating task'
        : `Reach a 3-day streak on ${n} repeating tasks`,
    remaining: (n) =>
      n === 1
        ? 'Reach 1 more 3-day streak'
        : `Reach ${n} more 3-day streaks`,
  },
  task_saved_later: {
    adminLabel: 'Tasks saved for later',
    label: (n) =>
      n === 1 ? 'Save a task for later' : `Save ${n} tasks for later`,
    remaining: (n) =>
      `Save ${n} more ${n === 1 ? 'task' : 'tasks'} for later`,
  },
  skin_equipped: {
    adminLabel: 'Skins equipped',
    label: (n) => (n === 1 ? 'Equip a skin' : `Equip ${n} skins`),
    remaining: (n) => `Equip ${n} more ${n === 1 ? 'skin' : 'skins'}`,
  },
  focus_tag_linked: {
    adminLabel: 'Focus tag linked',
    label: (n) =>
      n === 1 ? 'Link a tag to a focus quest' : `Link tags to ${n} focus quests`,
    remaining: (n) =>
      n === 1
        ? 'Link a tag to a focus quest'
        : `Link tags to ${n} more focus quests`,
  },
  frog_fed_full: {
    adminLabel: 'Frog fed to full',
    label: (n) =>
      n === 1 ? 'Fill your frog’s belly' : `Fill your frog’s belly ${n} times`,
    remaining: (n) =>
      n === 1
        ? 'Fill your frog’s belly 1 more time'
        : `Fill your frog’s belly ${n} more times`,
  },
};

const TASK_STREAK_LABEL_PATTERN = /^task_streak_(\d+)$/;

function taskStreakCopy(metricKey: string): MetricCopy | undefined {
  const match = TASK_STREAK_LABEL_PATTERN.exec(metricKey);
  if (!match) return undefined;
  const days = Number(match[1]);
  return {
    adminLabel: `${days}-day streaks reached`,
    label: (n) =>
      n === 1
        ? `Reach a ${days}-day streak on a repeating task`
        : `Reach a ${days}-day streak on ${n} repeating tasks`,
    remaining: (n) =>
      n === 1
        ? `Reach 1 more ${days}-day streak`
        : `Reach ${n} more ${days}-day streaks`,
  };
}

function metricCopyFor(metricKey: string | undefined): MetricCopy | undefined {
  if (!metricKey) return undefined;
  return taskStreakCopy(metricKey) ?? QUEST_METRIC_COPY[metricKey];
}

export function metricObjectiveLabel(
  metricKey: string | undefined,
  target: number,
): string {
  const copy = metricCopyFor(metricKey);
  if (!copy) return `Complete ${target} ${target === 1 ? 'objective' : 'objectives'}`;
  return copy.label(Math.max(1, target));
}

export function metricRemainingLabel(
  metricKey: string | undefined,
  remaining: number,
): string {
  const copy = metricCopyFor(metricKey);
  if (!copy)
    return `Complete ${remaining} more ${remaining === 1 ? 'objective' : 'objectives'}`;
  return copy.remaining(Math.max(1, remaining));
}
