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

function repeatingTaskLabel(n: number, tagScoped?: boolean) {
  if (tagScoped) {
    return n === 1 ? 'repeating quest task' : 'repeating quest tasks';
  }
  return n === 1 ? 'repeating task' : 'repeating tasks';
}

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
    label: (n, options) =>
      n === 1
        ? `Finish a ${options?.tagScoped ? 'quest task' : 'task'} with your buddy`
        : `Finish ${n} ${options?.tagScoped ? 'quest tasks' : 'tasks'} with your buddy`,
    remaining: (n, options) =>
      `Finish ${n} more ${options?.tagScoped ? taggedTaskLabel(n) : n === 1 ? 'task' : 'tasks'} with your buddy`,
  },
  task_streak_3: {
    adminLabel: 'Task streak reached',
    label: (n, options) =>
      n === 1
        ? `Reach a 3-day streak on a ${repeatingTaskLabel(n, options?.tagScoped)}`
        : `Reach a 3-day streak on ${n} ${repeatingTaskLabel(n, options?.tagScoped)}`,
    remaining: (n, options) =>
      n === 1
        ? `Reach 1 more 3-day streak on a ${repeatingTaskLabel(n, options?.tagScoped)}`
        : `Reach ${n} more 3-day streaks on ${repeatingTaskLabel(n, options?.tagScoped)}`,
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
    adminLabel: 'Area quest started',
    label: (n) =>
      n === 1 ? 'Start an area quest' : `Start ${n} area quests`,
    remaining: (n) =>
      n === 1 ? 'Start an area quest' : `Start ${n} more area quests`,
  },
  focus_started: {
    adminLabel: 'Focus timers started',
    label: (n) =>
      n === 1 ? 'Start a focus timer' : `Start ${n} focus timers`,
    remaining: (n) =>
      n === 1
        ? 'Start a focus timer'
        : `Start ${n} more focus timers`,
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
    label: (n, options) =>
      n === 1
        ? `Reach a ${days}-day streak on a ${repeatingTaskLabel(n, options?.tagScoped)}`
        : `Reach a ${days}-day streak on ${n} ${repeatingTaskLabel(n, options?.tagScoped)}`,
    remaining: (n, options) =>
      n === 1
        ? `Reach 1 more ${days}-day streak on a ${repeatingTaskLabel(n, options?.tagScoped)}`
        : `Reach ${n} more ${days}-day streaks on ${repeatingTaskLabel(n, options?.tagScoped)}`,
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
  if (!copy) return `Complete ${target} ${target === 1 ? 'objective' : 'objectives'}`;
  return copy.label(Math.max(1, target), options);
}

const METRIC_HINT_COPY: Record<string, string> = {
  trade_completed:
    'In the Wardrobe, trade five same-rarity skins for one of a higher rarity.',
  skin_sold: 'Sell a skin you no longer want from the Wardrobe.',
  skin_acquired: 'Buy a skin in the Wardrobe shop, or win one from a gift box.',
  friend_invited:
    'Invite a friend from the Friends page — you both get a gift when they join.',
  buddy_task_completed:
    'Finish a shared task with your buddy — it counts once you both check it off.',
  task_saved_later: "Use a task's menu to move it to Saved Tasks.",
  skin_equipped: 'Equip a skin on your frog in the Wardrobe.',
  focus_tag_linked:
    'On the Quests page, start an area quest and pick your focus.',
  focus_started:
    'Start the focus timer on any task — any length counts.',
  frog_fed_full:
    'Feed your frog flies on the home screen until its belly is full.',
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
  },
  focusTagName?: string,
  options?: { omitTagScope?: boolean },
): string {
  if (block.helpText) return block.helpText;

  const usesFocusTags = block.tagMode === 'focus_category_tags';
  const tagName = usesFocusTags
    ? focusTagName
    : block.resolvedTagNames?.[0] ?? block.resolvedTagName;
  const tagScoped =
    usesFocusTags ||
    !!block.resolvedTagName ||
    (block.resolvedTagNames?.length ?? 0) > 0 ||
    !!block.previewTagLabel;
  const scopeSuffix = !tagScoped
    ? ''
    : tagName
      ? options?.omitTagScope
        ? ''
        : ` Only tasks tagged “${tagName}” count.`
      : ' Tap Start quest on the area card first.';

  if (block.type === 'focus_minutes') {
    return `Start a focus timer on a task — every focused minute counts.${scopeSuffix}`;
  }
  if (block.type === 'metric_count') {
    const streakMatch = block.metricKey
      ? TASK_STREAK_LABEL_PATTERN.exec(block.metricKey)
      : null;
    const base = streakMatch
      ? `Complete the same repeating task ${streakMatch[1]} days in a row.`
      : METRIC_HINT_COPY[block.metricKey ?? ''] ??
        'Keep using the app — this one fills up on its own.';
    return `${base}${scopeSuffix}`;
  }
  if (block.action === 'add') {
    return `Tap the + button to add a new task.${scopeSuffix}`;
  }
  return `Check off a task on your list — your frog snacks on the fly.${scopeSuffix}`;
}

export function metricRemainingLabel(
  metricKey: string | undefined,
  remaining: number,
  options?: MetricLabelOptions,
): string {
  const copy = metricCopyFor(metricKey);
  if (!copy)
    return `Complete ${remaining} more ${remaining === 1 ? 'objective' : 'objectives'}`;
  return copy.remaining(Math.max(1, remaining), options);
}
