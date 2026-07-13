// Values interpolated into step labels: {tags} → quoted tag names,
// {days} → streak length. Provided by the surface starting the guide.
// `tags` (with colors) renders real tag chips inside the label; `tagIds`
// scopes fly-glow steps to tasks carrying those tags.
export type HintGuideContext = {
  tagNames?: string[];
  days?: number;
  tags?: { id?: string; name: string; color: string }[];
  tagIds?: string[];
};

export function formatHintLabel(
  label: string,
  context?: HintGuideContext | null,
): string {
  let next = label;
  if (next.includes('{tags}')) {
    const names = (context?.tagNames ?? []).filter(Boolean);
    next = next.replace(
      '{tags}',
      names.length > 0 ? names.map((name) => `“${name}”`).join(' or ') : 'the quest tag',
    );
  }
  if (next.includes('{days}')) {
    next = next.replace('{days}', String(context?.days ?? 2));
  }
  return next;
}

export type HintStep = {
  // Route the step lives on; the coach navigates there if needed. Steps
  // without an href stay wherever the previous step left the user.
  href?: string;
  // Matches a [data-hint="..."] element in the DOM.
  anchor: string;
  // Optional CSS selector override when the target needs more than the
  // data-hint name (attribute filters, multiple fallback targets, ...).
  selector?: string;
  label: string;
  // Copy for touch devices, when the interaction differs (swipes).
  labelCoarse?: string;
  // Animated swipe indicator shown on touch devices.
  gesture?: 'swipe-left' | 'swipe-right';
  // Jump to an absolute step index when this window event fires.
  advanceOnEvent?: { event: string; goTo: number };
  // Skip this step immediately when an element matching this CSS selector is
  // already on screen (e.g. "add a task first" steps that only apply to
  // empty lists).
  skipWhenPresent?: string;
  // Hold the step's highlight until an element matching this CSS selector is
  // on screen — keeps "any task in this list" rings from appearing around an
  // empty list while the user is still creating the first task.
  requirePresent?: string;
  // Touching the anchor advances to the next step (default true).
  advanceOnAnchorDown?: boolean;
  // Touching the anchor ends the guide immediately — for steps where
  // grabbing the target IS the taught action (dragging the saved task) and
  // advancing would navigate mid-gesture.
  dismissOnAnchorDown?: boolean;
  // Pressing an unrelated interactive element cancels the guide (default
  // true). Steps whose own flow requires such a press (closing the saved
  // tray) opt out.
  outsideInteractionCancels?: boolean;
  // Elements outside the highlighted anchor that still count as doing the
  // step (CSS selector) — e.g. the floating + button while the task list is
  // ringed with "or add a new one".
  alsoAdvanceOn?: string;
  // Skip the top-most-element test at acquisition (default on). Needed for
  // always-visible anchors that sit under oversized transparent layers the
  // hit-test can't see through (the frog's full-width Rive canvas).
  coverCheck?: boolean;
  // Glow every task fly instead of ringing the anchor ('tagged' limits the
  // glow to tasks carrying the guide context's tagIds). Implies hideRing.
  flyGlow?: 'all' | 'tagged';
  // Keep the anchor for label placement/advance but don't draw its ring.
  hideRing?: boolean;
  // How long to wait for the anchor before giving up quietly.
  timeoutMs?: number;
};

export type HintGuide = {
  id: string;
  steps: HintStep[];
};

export const TASK_SAVED_EVENT = 'frogress:task-saved';
export const BACKLOG_CLOSED_EVENT = 'frogress:backlog-closed';

const GUIDES: Record<string, HintGuide> = {
  'add-task': {
    id: 'add-task',
    steps: [{ href: '/', anchor: 'add-task', label: 'Add your own task here' }],
  },
  'complete-task': {
    id: 'complete-task',
    steps: [
      {
        href: '/',
        anchor: 'add-task',
        label: 'Add a task to finish first',
        skipWhenPresent: '[data-hint="task-fly"]',
      },
      {
        anchor: 'task-list',
        label: 'Tap the fly on any task to finish it',
        requirePresent: '[data-hint="task-fly"]',
        flyGlow: 'all',
        hideRing: true,
        timeoutMs: 90_000,
      },
    ],
  },
  focus: {
    id: 'focus',
    steps: [
      {
        href: '/',
        anchor: 'add-task',
        label: 'Add a task to focus on first',
        skipWhenPresent: '[data-hint="task-row"]',
      },
      {
        anchor: 'task-list',
        label: 'Open any task and hit Focus',
        labelCoarse: 'Swipe any task right to focus — or tap to open it',
        gesture: 'swipe-right',
        requirePresent: '[data-hint="task-row"]',
        timeoutMs: 90_000,
      },
      {
        anchor: 'focus-button',
        label: 'Start the focus timer',
        timeoutMs: 60_000,
      },
    ],
  },
  'feed-frog': {
    id: 'feed-frog',
    steps: [
      {
        href: '/',
        anchor: 'hunger-bar',
        label:
          'Your frog’s belly — every task you finish feeds it. Fill it to the top!',
        coverCheck: false,
      },
    ],
  },
  // Ends at the save itself — the first-ever save then pops the one-time
  // "where saved tasks live" intro sheet (SavedTaskIntroSheet).
  'save-later': {
    id: 'save-later',
    steps: [
      {
        href: '/',
        anchor: 'add-task',
        label: 'Add a task you won’t need today',
        skipWhenPresent: '[data-hint="task-row"][data-savable="true"]',
      },
      {
        anchor: 'task-list',
        label: 'Open any task you won’t need today — or add a new one',
        labelCoarse:
          'Swipe left on any task you won’t need today — or add a new one',
        gesture: 'swipe-left',
        requirePresent: '[data-hint="task-row"][data-savable="true"]',
        timeoutMs: 90_000,
        alsoAdvanceOn: '[data-hint="add-task"]',
        advanceOnEvent: { event: TASK_SAVED_EVENT, goTo: 3 },
      },
      {
        anchor: 'save-later-button',
        label: 'Save it for later',
        timeoutMs: 60_000,
        // Advance only on the actual save event: advancing on pointerdown
        // closes the sheet before the button's click handler runs, killing
        // the save it was supposed to trigger.
        advanceOnAnchorDown: false,
        advanceOnEvent: { event: TASK_SAVED_EVENT, goTo: 3 },
      },
    ],
  },
  'buy-skin': {
    id: 'buy-skin',
    steps: [
      {
        href: '/wardrobe',
        anchor: 'wardrobe-shop-tab',
        label: 'Open the Shop — buy any skin you can afford',
      },
    ],
  },
  'equip-skin': {
    id: 'equip-skin',
    steps: [
      {
        href: '/wardrobe',
        anchor: 'wardrobe-inventory-tab',
        label: 'Tap a skin you own to wear it',
      },
    ],
  },
  'sell-skin': {
    id: 'sell-skin',
    steps: [
      {
        href: '/wardrobe',
        anchor: 'wardrobe-inventory-tab',
        label: 'Tap a skin you own to sell it for flies',
      },
    ],
  },
  'trade-skins': {
    id: 'trade-skins',
    steps: [
      {
        href: '/wardrobe',
        anchor: 'wardrobe-trade-tab',
        label: 'Trade five same-rarity skins for a rarer one',
      },
    ],
  },
  'start-focus-quest': {
    id: 'start-focus-quest',
    steps: [
      {
        href: '/quests',
        anchor: 'start-focus-quest',
        label: 'Start an area quest — pick your life area',
      },
    ],
  },
  'invite-friend': {
    id: 'invite-friend',
    steps: [
      {
        href: '/friends',
        anchor: 'invite-friend',
        label: 'Invite a friend — you both get a gift when they join',
      },
    ],
  },
  // Tag-scoped variants for area-quest objectives: same flow as their plain
  // twins, with the quest's tags woven into the copy and a final step on the
  // tag picker.
  'add-tagged-task': {
    id: 'add-tagged-task',
    steps: [
      {
        href: '/',
        anchor: 'add-task',
        label: 'Add a task and tag it {tags}',
      },
      {
        anchor: 'tag-picker',
        selector: '[data-hint="tag-picker"], [data-hint="task-tags-button"]',
        label: 'Pick the {tags} tag',
        timeoutMs: 90_000,
      },
    ],
  },
  'complete-tagged-task': {
    id: 'complete-tagged-task',
    steps: [
      {
        href: '/',
        anchor: 'task-list',
        label:
          'Finish any task tagged {tags} — or add one and tag it',
        requirePresent: '[data-hint="task-fly"]',
        flyGlow: 'tagged',
        hideRing: true,
        alsoAdvanceOn: '[data-hint="add-task"]',
        timeoutMs: 90_000,
      },
    ],
  },
  'focus-tagged': {
    id: 'focus-tagged',
    steps: [
      {
        href: '/',
        anchor: 'add-task',
        label: 'Add a task tagged {tags} to focus on',
        skipWhenPresent: '[data-hint="task-row"]',
      },
      {
        anchor: 'task-list',
        label: 'Open a task tagged {tags} and hit Focus',
        labelCoarse: 'Swipe a task tagged {tags} right — or tap to open it',
        gesture: 'swipe-right',
        requirePresent: '[data-hint="task-row"]',
        timeoutMs: 90_000,
      },
      {
        anchor: 'focus-button',
        label: 'Start the focus timer',
        timeoutMs: 60_000,
      },
    ],
  },
  streak: {
    id: 'streak',
    steps: [
      {
        href: '/',
        anchor: 'task-list',
        selector: '[data-hint="task-list"], [data-hint="add-task"]',
        label:
          'Streaks need a repeating task — open one (or add it), then turn on Repeat',
        timeoutMs: 90_000,
        alsoAdvanceOn: '[data-hint="add-task"]',
      },
      {
        anchor: 'repeat-button',
        label: 'Turn on Repeat',
        timeoutMs: 90_000,
      },
      {
        anchor: 'task-list',
        label: 'Now finish it {days} times in a row — starting today',
        timeoutMs: 30_000,
      },
    ],
  },
  buddy: {
    id: 'buddy',
    steps: [
      {
        href: '/friends',
        anchor: 'friends-list',
        label:
          'Pick a friend and team up on a task — it counts when you both finish it',
        timeoutMs: 30_000,
      },
    ],
  },
};

const METRIC_GUIDE_IDS: Record<string, string> = {
  skin_acquired: 'buy-skin',
  skin_equipped: 'equip-skin',
  skin_sold: 'sell-skin',
  trade_completed: 'trade-skins',
  focus_tag_linked: 'start-focus-quest',
  focus_started: 'focus',
  friend_invited: 'invite-friend',
  task_saved_later: 'save-later',
  frog_fed_full: 'feed-frog',
  buddy_task_completed: 'buddy',
};

const TASK_STREAK_GUIDE_PATTERN = /^task_streak_(\d+)$/;

export function guideById(guideId: string | undefined): HintGuide | null {
  if (!guideId) return null;
  return GUIDES[guideId] ?? null;
}

export function guideIdForBlock(block: {
  type?: string;
  action?: string;
  metricKey?: string;
  tagMode?: string;
}): string | null {
  const tagScoped =
    block.tagMode === 'focus_category_tags' ||
    block.tagMode === 'random_user_tag';
  if (block.type === 'focus_minutes') {
    return tagScoped ? 'focus-tagged' : 'focus';
  }
  if (block.type === 'metric_count') {
    if (TASK_STREAK_GUIDE_PATTERN.test(block.metricKey ?? '')) return 'streak';
    return METRIC_GUIDE_IDS[block.metricKey ?? ''] ?? null;
  }
  if (block.type === 'count') {
    if (block.action === 'add') {
      return tagScoped ? 'add-tagged-task' : 'add-task';
    }
    return tagScoped ? 'complete-tagged-task' : 'complete-task';
  }
  return null;
}

export function guideContextForBlock(block: {
  metricKey?: string;
  resolvedTagNames?: string[];
  resolvedTagName?: string;
  resolvedTagIds?: string[];
  resolvedTagId?: string;
}): HintGuideContext | undefined {
  const tagNames =
    block.resolvedTagNames?.length
      ? block.resolvedTagNames
      : block.resolvedTagName
        ? [block.resolvedTagName]
        : undefined;
  const tagIds =
    block.resolvedTagIds?.length
      ? block.resolvedTagIds
      : block.resolvedTagId
        ? [block.resolvedTagId]
        : undefined;
  const streakMatch = TASK_STREAK_GUIDE_PATTERN.exec(block.metricKey ?? '');
  const days = streakMatch ? Number(streakMatch[1]) : undefined;
  if (!tagNames && !tagIds && days === undefined) return undefined;
  return { tagNames, tagIds, days };
}
