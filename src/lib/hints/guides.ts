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
        // navigates to the planner before the button's click handler runs,
        // killing the save it was supposed to trigger.
        advanceOnAnchorDown: false,
        advanceOnEvent: { event: TASK_SAVED_EVENT, goTo: 3 },
      },
      {
        href: '/planner',
        anchor: 'saved-tasks',
        label:
          'Your task waits in Saved Tasks — tap to see it. You can grab it back onto any day, whenever you want.',
        timeoutMs: 20_000,
      },
      {
        anchor: 'saved-task-card',
        label:
          'There it is — drag it onto a day when you’re ready. Close the tray when you’re done.',
        advanceOnAnchorDown: false,
        dismissOnAnchorDown: true,
        outsideInteractionCancels: false,
        advanceOnEvent: { event: BACKLOG_CLOSED_EVENT, goTo: 5 },
        timeoutMs: 20_000,
      },
      {
        href: '/quests',
        anchor: 'claim-objective',
        label: 'Nice — claim your reward!',
        timeoutMs: 20_000,
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
        label: 'Start a focus quest and pick your focus',
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
};

const METRIC_GUIDE_IDS: Record<string, string> = {
  skin_acquired: 'buy-skin',
  skin_equipped: 'equip-skin',
  skin_sold: 'sell-skin',
  trade_completed: 'trade-skins',
  focus_tag_linked: 'start-focus-quest',
  friend_invited: 'invite-friend',
  task_saved_later: 'save-later',
  frog_fed_full: 'feed-frog',
};

export function guideById(guideId: string | undefined): HintGuide | null {
  if (!guideId) return null;
  return GUIDES[guideId] ?? null;
}

export function guideIdForBlock(block: {
  type?: string;
  action?: string;
  metricKey?: string;
}): string | null {
  if (block.type === 'focus_minutes') return 'focus';
  if (block.type === 'metric_count') {
    return METRIC_GUIDE_IDS[block.metricKey ?? ''] ?? null;
  }
  if (block.type === 'count') {
    return block.action === 'add' ? 'add-task' : 'complete-task';
  }
  return null;
}
