type MetricCopy = {
  adminLabel: string;
  label: (n: number, options?: MetricLabelOptions) => string;
  remaining: (n: number, options?: MetricLabelOptions) => string;
};

type MetricLabelOptions = {
  tagScoped?: boolean;
};

function taggedTaskLabel(n: number) {
  return n === 1 ? 'quest task' : 'quest tasks';
}

export const QUEST_METRIC_COPY: Record<string, MetricCopy> = {
  trade_completed: {
    adminLabel: 'Trades completed',
    label: (n) => (n === 1 ? 'Make a trade' : `Make ${n} trades`),
    remaining: (n) => `${n} more ${n === 1 ? 'trade' : 'trades'} to go`,
  },
  skin_acquired: {
    adminLabel: 'Skins bought or received',
    label: (n) =>
      n === 1
        ? 'Get a new outfit from the shop'
        : `Get ${n} new outfits from the shop`,
    remaining: (n) => `${n} more ${n === 1 ? 'outfit' : 'outfits'} to go`,
  },
  friend_invited: {
    adminLabel: 'Friends invited',
    label: (n) => (n === 1 ? 'Invite a friend' : `Invite ${n} friends`),
    remaining: (n) => `${n} more ${n === 1 ? 'friend' : 'friends'} to go`,
  },
  buddy_task_completed: {
    adminLabel: 'Buddy tasks (both finished)',
    label: (n, options) =>
      n === 1
        ? `Finish a ${options?.tagScoped ? 'quest task' : 'task'} with your buddy`
        : `Finish ${n} ${options?.tagScoped ? 'quest tasks' : 'tasks'} with your buddy`,
    remaining: (n, options) =>
      `${n} more buddy ${options?.tagScoped ? taggedTaskLabel(n) : n === 1 ? 'task' : 'tasks'} to go`,
  },
  task_streak_3: {
    adminLabel: 'Task streak reached',
    label: (n) =>
      n === 1 ? 'Hit a 3-day streak' : `Hit 3-day streaks on ${n} tasks`,
    remaining: (n) =>
      n === 1 ? '1 more 3-day streak to go' : `${n} more 3-day streaks to go`,
  },
  task_saved_later: {
    adminLabel: 'Tasks saved for later',
    label: (n) =>
      n === 1 ? 'Save a task for later' : `Save ${n} tasks for later`,
    remaining: (n) => `${n} more ${n === 1 ? 'task' : 'tasks'} to save`,
  },
  skin_equipped: {
    adminLabel: 'Outfits or backgrounds equipped',
    label: (n) =>
      n === 1
        ? 'Give your frog a new look'
        : `Change your frog’s look ${n} times`,
    remaining: (n) =>
      n === 1 ? '1 more new look to go' : `${n} more new looks to go`,
  },
  focus_tag_linked: {
    adminLabel: 'Weekly Leaps started',
    label: (n) => (n === 1 ? "Take this week's Leap" : `Take ${n} Leaps`),
    remaining: (n) =>
      n === 1 ? 'Your Leap is waiting' : `${n} more Leaps to take`,
  },
  focus_started: {
    adminLabel: 'Focus timers started',
    label: (n) =>
      n === 1 ? 'Start a focus timer' : `Start ${n} focus timers`,
    remaining: (n) =>
      n === 1 ? '1 more timer to start' : `${n} more timers to start`,
  },
  frog_fed_full: {
    adminLabel: 'Frog fed to full',
    label: (n) =>
      n === 1
        ? 'Finish tasks until your frog is full'
        : `Fill your frog’s belly ${n} times`,
    remaining: (n) =>
      n === 1 ? '1 more full belly to go' : `${n} more full bellies to go`,
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
        ? `Hit a ${days}-day streak`
        : `Hit ${days}-day streaks on ${n} tasks`,
    remaining: (n) =>
      n === 1
        ? `1 more ${days}-day streak to go`
        : `${n} more ${days}-day streaks to go`,
  };
}

function metricCopyFor(metricKey: string | undefined): MetricCopy | undefined {
  if (!metricKey) return undefined;
  return taskStreakCopy(metricKey) ?? QUEST_METRIC_COPY[metricKey];
}

export function metricObjectiveLabel(
  metricKey: string | undefined,
  target: number,
  options?: MetricLabelOptions,
): string {
  const copy = metricCopyFor(metricKey);
  if (!copy) return `Finish ${target} ${target === 1 ? 'step' : 'steps'}`;
  return copy.label(Math.max(1, target), options);
}

const METRIC_HINT_COPY: Record<string, string> = {
  trade_completed:
    'In the Wardrobe, swap 4 outfits of the same rarity for 1 better one.',
  skin_acquired: 'Buy an outfit in the Wardrobe shop, or open a gift box.',
  friend_invited:
    'Invite a friend from the Friends page — you both get a gift.',
  buddy_task_completed:
    'Share a task with your buddy. It counts once you both tick it off.',
  task_saved_later: "Open a task's menu and move it to Saved Tasks.",
  skin_equipped:
    'In the Wardrobe, tap an outfit or a background you own to put it on.',
  focus_tag_linked:
    'Pick this week’s area on the Quests page and commit to one thing.',
  focus_started: 'Start the focus timer on any task. Any length counts.',
  frog_fed_full:
    'Tick off tasks on Home until the belly bar is completely full.',
};

export function objectiveHintText(
  block: {
    type?: string;
    action?: string;
    tagMode?: string;
    metricKey?: string;
    helpText?: string;
    resolvedTagName?: string;
    resolvedTagNames?: string[];
    previewTagLabel?: string;
    sessionMinutes?: number;
    requiresFollowThrough?: boolean;
    beforeHour?: number;
    target?: number;
  },
): string {
  // A metric fully determines the action, so its copy outranks helpText:
  // re-pointing a block at another metric in the admin leaves the old text
  // behind, and a hint describing the wrong feature is worse than losing a
  // custom phrasing that had nothing left to add.
  const metricCopy =
    block.type === 'metric_count' && block.metricKey
      ? METRIC_HINT_COPY[block.metricKey]
      : undefined;
  if (block.helpText && !metricCopy) return block.helpText;

  const tagName = block.resolvedTagNames?.[0] ?? block.resolvedTagName;
  const tagScoped =
    !!block.resolvedTagName ||
    (block.resolvedTagNames?.length ?? 0) > 0 ||
    !!block.previewTagLabel;
  const scopeSuffix =
    tagScoped && tagName ? ` Only tasks tagged “${tagName}” count.` : '';

  if (block.type === 'focus_minutes') {
    return `Start the focus timer on any task. Every minute counts.${scopeSuffix}`;
  }
  if (block.type === 'distinct_days') {
    return `Finish a task on separate days. One busy day only counts once.${scopeSuffix}`;
  }
  if (block.type === 'deep_session') {
    const minutes = block.sessionMinutes ?? 25;
    return `Run the focus timer ${minutes} minutes without stopping. Quitting early resets it.${scopeSuffix}`;
  }
  if (block.type === 'day_parts') {
    const parts = Math.min(3, Math.max(1, block.target ?? 2));
    const label = parts >= 3 ? 'all three' : `${parts} of them`;
    return `The day splits into morning, noon–5pm and evening. Tick off a task in ${label}.${scopeSuffix}`;
  }
  if (block.type === 'metric_count') {
    const streakMatch = block.metricKey
      ? TASK_STREAK_LABEL_PATTERN.exec(block.metricKey)
      : null;
    const base = streakMatch
      ? `Tick off the same repeating task ${streakMatch[1]} days in a row.`
      : metricCopy ??
        block.helpText ??
        'Keep using the app — this one fills up on its own.';
    return `${base}${scopeSuffix}`;
  }
  if (block.action === 'add') {
    return block.requiresFollowThrough
      ? `Tap + to plan them, then tick them off. This one pays out when they are done.${scopeSuffix}`
      : `Tap + and add a task of your own. The ones already on your list do not count.${scopeSuffix}`;
  }
  if (typeof block.beforeHour === 'number') {
    const hour =
      block.beforeHour === 12
        ? 'noon'
        : block.beforeHour < 12
          ? `${block.beforeHour}am`
          : `${block.beforeHour - 12}pm`;
    return `Tick off a task before ${hour}. Later ones do not count.${scopeSuffix}`;
  }
  return `Tick off a task on Home. Your frog eats the fly.${scopeSuffix}`;
}

export function metricRemainingLabel(
  metricKey: string | undefined,
  remaining: number,
  options?: MetricLabelOptions,
): string {
  const copy = metricCopyFor(metricKey);
  if (!copy)
    return `${remaining} more ${remaining === 1 ? 'step' : 'steps'} to go`;
  return copy.remaining(Math.max(1, remaining), options);
}
