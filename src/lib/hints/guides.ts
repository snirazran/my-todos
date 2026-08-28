export type HintGuideContext = {
  tagNames?: string[];
  tagIds?: string[];
  tags?: { id?: string; name: string; color: string }[];
  days?: number;
  minutes?: number;
  hour?: number;
  parts?: number;
};

function hourLabel(hour: number): string {
  if (hour === 12) return 'noon';
  if (hour === 0 || hour === 24) return 'midnight';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export function formatHintLabel(
  label: string,
  context?: HintGuideContext | null,
): string {
  let next = label;
  if (next.includes('{tags}')) {
    const names = (context?.tagNames ?? []).filter(Boolean);
    next = next.replace(
      /\{tags\}/g,
      names.length > 0
        ? names.map((name) => `“${name}”`).join(' or ')
        : 'the quest tag',
    );
  }
  next = next.replace(/\{days\}/g, String(context?.days ?? 2));
  next = next.replace(/\{minutes\}/g, String(context?.minutes ?? 5));
  next = next.replace(/\{parts\}/g, String(context?.parts ?? 2));
  next = next.replace(
    /\{hour\}/g,
    hourLabel(typeof context?.hour === 'number' ? context.hour : 12),
  );
  return next;
}

export type HintTagMatch = 'hit' | 'miss';

export type HintBeat = {
  /** Route the beat lives on; the coach navigates there once if needed. */
  href?: string;
  /** Matches a [data-hint="..."] element. */
  anchor: string;
  /** CSS selector override when the anchor name is not enough. */
  selector?: string;
  say: string;
  /** Copy for mobile-width viewports, where the gesture differs. */
  sayTouch?: string;
  /** How the target is marked. */
  show?: 'ring' | 'row-peek';
  /** Limit the row-peek nudge to rows carrying the context tag ids. */
  scope?: 'tagged';
  gesture?: 'swipe-left' | 'swipe-right';
  /** Only acquire an anchor whose data-tag-id(s) overlap the context tag ids. */
  matchTagIds?: boolean;
  /** Beat is already satisfied when a visible element matches this selector. */
  satisfiedWhen?: string;
  satisfiedWhenTagMatch?: HintTagMatch;
  /** Beat advances when a visible element matches this selector. */
  advanceWhenPresent?: string;
  advanceWhenPresentTagMatch?: HintTagMatch;
  /** Beat advances on this window event. */
  advanceOnEvent?: string;
  /**
   * Tapping the anchor advances the beat (default true). Off for container
   * anchors, where a tap means "I am scrolling this", not "I did the thing".
   * `alsoAdvanceOn` targets always advance regardless.
   */
  advanceOnTap?: boolean;
  /** Controls outside the ring that still count as doing the beat. */
  alsoAdvanceOn?: string;
  /** Skip the top-most-element test at acquisition. */
  coverCheck?: boolean;
  /** Nothing to press here — the card carries a Got it button instead. */
  informational?: boolean;
  /** How long to wait for the anchor before bowing out. */
  timeoutMs?: number;
};

export type HintGuide = {
  id: string;
  /**
   * What the user is working towards, in their words. Shown in the docked
   * pill for as long as the guide waits on real progress.
   */
  goal: string;
  beats: HintBeat[];
  /** App state that means the work is already under way; the guide bows out. */
  endWhen?: 'focus-running';
  /** Window event that means the work is done, however the user got there. */
  endOnEvent?: string;
};

export const TASK_SAVED_EVENT = 'frogress:task-saved';
export const BACKLOG_CLOSED_EVENT = 'frogress:backlog-closed';

const ADD_TASK_BEAT: HintBeat = {
  href: '/',
  anchor: 'add-task',
  say: 'Tap + to add a task of your own',
};

const TAG_IT_BEAT: HintBeat = {
  anchor: 'quickadd-tag',
  matchTagIds: true,
  say: 'Give it this tag',
  timeoutMs: 60_000,
};

const NEEDS_A_TASK: Pick<HintBeat, 'satisfiedWhen'> = {
  satisfiedWhen: '[data-hint="task-row"]',
};

const GUIDES: Record<string, HintGuide> = {
  'add-task': {
    id: 'add-task',
    goal: 'Add a task of your own',
    beats: [ADD_TASK_BEAT],
  },
  'add-task-tagged': {
    id: 'add-task-tagged',
    goal: 'Add a task tagged {tags}',
    beats: [{ ...ADD_TASK_BEAT, say: 'Tap + to add a task' }, TAG_IT_BEAT],
  },
  'add-task-follow-through': {
    id: 'add-task-follow-through',
    goal: 'Add the tasks, then tick them off',
    beats: [
      { ...ADD_TASK_BEAT, say: 'Tap + to plan it' },
      {
        anchor: 'task-fly',
        say: 'Then tap its fly to finish it',
      },
    ],
  },
  'complete-task': {
    id: 'complete-task',
    goal: 'Finish a task',
    beats: [
      { ...ADD_TASK_BEAT, ...NEEDS_A_TASK, say: 'Add a task to finish first' },
      {
        anchor: 'task-fly',
        say: 'Tap the fly to finish this task',
      },
    ],
  },
  'complete-task-tagged': {
    id: 'complete-task-tagged',
    goal: 'Finish a task tagged {tags}',
    beats: [
      {
        ...ADD_TASK_BEAT,
        say: 'No task is tagged {tags} yet — add one',
        satisfiedWhen: '[data-hint="task-fly"]',
        satisfiedWhenTagMatch: 'hit',
      },
      { ...TAG_IT_BEAT, satisfiedWhen: '[data-hint="task-fly"]', satisfiedWhenTagMatch: 'hit' },
      {
        anchor: 'task-fly',
        matchTagIds: true,
        say: 'Tap the fly on this {tags} task',
      },
    ],
  },
  'complete-task-before-hour': {
    id: 'complete-task-before-hour',
    goal: 'Finish a task before {hour}',
    beats: [
      { ...ADD_TASK_BEAT, ...NEEDS_A_TASK, say: 'Add a task to finish first' },
      {
        anchor: 'task-fly',
        say: 'Tap the fly before {hour} — later ones do not count',
      },
    ],
  },
  'distinct-days': {
    id: 'distinct-days',
    goal: 'Finish a task on {days} separate days',
    beats: [
      { ...ADD_TASK_BEAT, ...NEEDS_A_TASK, say: 'Add a task to finish first' },
      {
        anchor: 'task-fly',
        say: 'Finish one today, then come back tomorrow',
      },
    ],
  },
  'day-parts': {
    id: 'day-parts',
    goal: 'Finish a task in {parts} parts of the day',
    beats: [
      { ...ADD_TASK_BEAT, ...NEEDS_A_TASK, say: 'Add a task to finish first' },
      {
        anchor: 'task-fly',
        say: 'One now — then again after noon and in the evening',
      },
    ],
  },
  focus: {
    id: 'focus',
    goal: 'Run the focus timer for {minutes} minutes',
    endWhen: 'focus-running',
    beats: [
      { ...ADD_TASK_BEAT, ...NEEDS_A_TASK, say: 'Add a task to focus on first' },
      {
        anchor: 'task-row',
        say: 'Open this task',
        sayTouch: 'Swipe it right to focus — or tap to open it',
        show: 'row-peek',
        advanceOnTap: false,
        advanceWhenPresent: '[data-hint="focus-button"]',
      },
      { anchor: 'focus-button', say: 'Start the focus timer' },
    ],
  },
  'focus-tagged': {
    id: 'focus-tagged',
    goal: 'Focus on a task tagged {tags} for {minutes} minutes',
    endWhen: 'focus-running',
    beats: [
      {
        ...ADD_TASK_BEAT,
        say: 'No task is tagged {tags} yet — add one',
        satisfiedWhen: '[data-hint="task-row"]',
        satisfiedWhenTagMatch: 'hit',
      },
      {
        anchor: 'task-row',
        matchTagIds: true,
        say: 'Open this {tags} task',
        sayTouch: 'Swipe it right to focus — or tap to open it',
        show: 'row-peek',
        scope: 'tagged',
        advanceOnTap: false,
        advanceWhenPresent: '[data-hint="focus-button"]',
      },
      { anchor: 'focus-button', say: 'Start the focus timer' },
    ],
  },
  'deep-session': {
    id: 'deep-session',
    goal: '{minutes} unbroken minutes — stopping early resets it',
    endWhen: 'focus-running',
    beats: [
      { ...ADD_TASK_BEAT, ...NEEDS_A_TASK, say: 'Add a task to focus on first' },
      {
        anchor: 'task-row',
        say: 'Open the task you can give {minutes} clear minutes',
        sayTouch: 'Swipe it right to focus — or tap to open it',
        show: 'row-peek',
        advanceOnTap: false,
        advanceWhenPresent: '[data-hint="focus-button"]',
      },
      {
        anchor: 'focus-button',
        say: 'Start it — and let it run the whole {minutes} minutes',
      },
    ],
  },
  streak: {
    id: 'streak',
    goal: 'Finish the same repeating task {days} days in a row',
    beats: [
      {
        href: '/',
        anchor: 'task-row',
        selector: '[data-hint="task-row"], [data-hint="add-task"]',
        say: 'Open a task you can do every day — or add one',
        alsoAdvanceOn: '[data-hint="add-task"]',
        advanceOnTap: false,
        advanceWhenPresent: '[data-hint="repeat-button"]',
      },
      { anchor: 'repeat-button', say: 'Turn on Repeat' },
      {
        anchor: 'task-fly',
        say: 'Now finish it {days} days in a row, starting today',
      },
    ],
  },
  'save-later': {
    id: 'save-later',
    goal: 'Move a task to Saved Tasks',
    endOnEvent: TASK_SAVED_EVENT,
    beats: [
      {
        ...ADD_TASK_BEAT,
        satisfiedWhen: '[data-hint="task-row"][data-savable="true"]',
        say: 'Add a task you will not need today',
      },
      {
        anchor: 'task-row',
        selector: '[data-hint="task-row"][data-savable="true"]',
        say: 'Open a task you will not need today',
        sayTouch: 'Swipe it left — or tap to open it',
        gesture: 'swipe-left',
        advanceOnTap: false,
        advanceWhenPresent: '[data-hint="save-later-button"]',
      },
      {
        anchor: 'save-later-button',
        say: 'Save it for later',
        advanceOnTap: false,
        advanceOnEvent: TASK_SAVED_EVENT,
      },
    ],
  },
  'take-leap': {
    id: 'take-leap',
    goal: 'Pick this week’s area and commit to one thing',
    beats: [
      {
        anchor: 'pact-pick-area',
        say: 'Take your Leap — pick the one area you want this week',
      },
    ],
  },
  'pact-session': {
    id: 'pact-session',
    goal: 'Finish this week’s session',
    beats: [
      {
        href: '/',
        anchor: 'task-fly',
        matchTagIds: true,
        say: 'Tap the fly to finish this week’s session',
      },
    ],
  },
  'feed-frog': {
    id: 'feed-frog',
    goal: 'Fill the belly bar to the top',
    beats: [
      {
        href: '/',
        anchor: 'hunger-bar',
        say: 'Every task you finish feeds your frog — fill it to the top',
        coverCheck: false,
        informational: true,
      },
    ],
  },
  'buy-skin': {
    id: 'buy-skin',
    goal: 'Buy an outfit in the Shop',
    beats: [
      {
        href: '/wardrobe',
        anchor: 'wardrobe-shop-tab',
        say: 'Open the Shop — buy any outfit you can afford',
      },
    ],
  },
  'equip-skin': {
    id: 'equip-skin',
    goal: 'Put an outfit on your frog',
    beats: [
      {
        href: '/wardrobe',
        anchor: 'wardrobe-inventory-tab',
        say: 'Tap an outfit you own to wear it',
      },
    ],
  },
  'trade-skins': {
    id: 'trade-skins',
    goal: 'Trade up to a rarer outfit',
    beats: [
      {
        href: '/wardrobe',
        anchor: 'wardrobe-trade-tab',
        say: 'Trade same-rarity outfits for a rarer one',
      },
    ],
  },
  'invite-friend': {
    id: 'invite-friend',
    goal: 'Invite a friend',
    beats: [
      {
        href: '/friends',
        anchor: 'invite-friend',
        say: 'Invite a friend — you both get a gift when they join',
      },
    ],
  },
  buddy: {
    id: 'buddy',
    goal: 'Share a task with a buddy and both tick it off',
    beats: [
      {
        href: '/friends',
        anchor: 'friends-list',
        say: 'Pick a friend and team up on a task',
      },
    ],
  },
  'keep-going': {
    id: 'keep-going',
    goal: 'Keep playing — this one fills up as you go',
    beats: [
      {
        href: '/',
        anchor: 'task-list',
        selector: '[data-hint="task-list"], [data-hint="add-task"]',
        say: 'This one fills up as you use the app',
      },
    ],
  },
};

const METRIC_GUIDE_IDS: Record<string, string> = {
  skin_acquired: 'buy-skin',
  skin_equipped: 'equip-skin',
  trade_completed: 'trade-skins',
  focus_tag_linked: 'take-leap',
  focus_started: 'focus',
  friend_invited: 'invite-friend',
  task_saved_later: 'save-later',
  frog_fed_full: 'feed-frog',
  buddy_task_completed: 'buddy',
};

const TASK_STREAK_GUIDE_PATTERN = /^task_streak_(\d+)$/;

export const FALLBACK_GUIDE_ID = 'keep-going';

export function guideById(guideId: string | undefined): HintGuide | null {
  if (!guideId) return null;
  return GUIDES[guideId] ?? null;
}

export type HintBlockShape = {
  type?: string;
  action?: string;
  metricKey?: string;
  tagMode?: string;
  sessionMinutes?: number;
  beforeHour?: number;
  requiresFollowThrough?: boolean;
  resolvedTagIds?: string[];
  resolvedTagId?: string;
};

/**
 * Every objective a quest can hold resolves to a guide — an objective row must
 * never be the only one on the list without a "Show me".
 */
export function guideIdForBlock(block: HintBlockShape): string {
  const tagScoped =
    block.tagMode === 'random_user_tag' ||
    (block.resolvedTagIds?.length ?? 0) > 0 ||
    !!block.resolvedTagId;

  switch (block.type) {
    case 'deep_session':
      return 'deep-session';
    case 'focus_minutes':
      return tagScoped ? 'focus-tagged' : 'focus';
    case 'distinct_days':
      return tagScoped ? 'complete-task-tagged' : 'distinct-days';
    case 'day_parts':
      return 'day-parts';
    case 'metric_count': {
      if (TASK_STREAK_GUIDE_PATTERN.test(block.metricKey ?? '')) return 'streak';
      return METRIC_GUIDE_IDS[block.metricKey ?? ''] ?? FALLBACK_GUIDE_ID;
    }
    case 'count':
    default: {
      if (block.action === 'add') {
        if (block.requiresFollowThrough) return 'add-task-follow-through';
        return tagScoped ? 'add-task-tagged' : 'add-task';
      }
      if (tagScoped) return 'complete-task-tagged';
      if (typeof block.beforeHour === 'number') {
        return 'complete-task-before-hour';
      }
      return 'complete-task';
    }
  }
}

export function guideContextForBlock(block: {
  metricKey?: string;
  type?: string;
  target?: number;
  amount?: number;
  sessionMinutes?: number;
  beforeHour?: number;
  resolvedTagNames?: string[];
  resolvedTagName?: string;
  resolvedTagIds?: string[];
  resolvedTagId?: string;
}): HintGuideContext | undefined {
  const tagNames = block.resolvedTagNames?.length
    ? block.resolvedTagNames
    : block.resolvedTagName
      ? [block.resolvedTagName]
      : undefined;
  const tagIds = block.resolvedTagIds?.length
    ? block.resolvedTagIds
    : block.resolvedTagId
      ? [block.resolvedTagId]
      : undefined;
  const streakMatch = TASK_STREAK_GUIDE_PATTERN.exec(block.metricKey ?? '');
  const days = streakMatch
    ? Number(streakMatch[1])
    : block.type === 'distinct_days'
      ? Math.max(2, block.target ?? block.amount ?? 2)
      : undefined;
  const minutes =
    block.type === 'deep_session'
      ? (block.sessionMinutes ?? 25)
      : block.type === 'focus_minutes'
        ? (block.target ?? block.amount ?? 5)
        : undefined;
  const parts =
    block.type === 'day_parts'
      ? Math.min(3, Math.max(1, block.target ?? block.amount ?? 2))
      : undefined;
  const hour = typeof block.beforeHour === 'number' ? block.beforeHour : undefined;

  const context: HintGuideContext = {
    tagNames,
    tagIds,
    days,
    minutes,
    parts,
    hour,
  };
  return Object.values(context).some((value) => value !== undefined)
    ? context
    : undefined;
}
