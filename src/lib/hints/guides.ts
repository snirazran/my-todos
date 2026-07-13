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
  // Touching the anchor advances to the next step (default true).
  advanceOnAnchorDown?: boolean;
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
      { href: '/', anchor: 'task-fly', label: 'Tap the fly to finish this task' },
    ],
  },
  focus: {
    id: 'focus',
    steps: [
      {
        href: '/',
        anchor: 'task-row',
        label: 'Open this task and hit Focus',
        labelCoarse: 'Swipe this task right to focus — or tap to open it',
        gesture: 'swipe-right',
      },
      { anchor: 'focus-button', label: 'Start the focus timer' },
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
      },
    ],
  },
  'save-later': {
    id: 'save-later',
    steps: [
      {
        href: '/',
        anchor: 'task-row',
        selector:
          '[data-hint="task-row"][data-savable="true"], [data-hint="add-task"]',
        label: 'Pick a task you won’t need today — or add a new one',
        labelCoarse:
          'Swipe left on a task you won’t need today — or add a new one',
        gesture: 'swipe-left',
        advanceOnEvent: { event: TASK_SAVED_EVENT, goTo: 2 },
      },
      {
        anchor: 'save-later-button',
        label: 'Save it for later',
        timeoutMs: 60_000,
        advanceOnEvent: { event: TASK_SAVED_EVENT, goTo: 2 },
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
        advanceOnEvent: { event: BACKLOG_CLOSED_EVENT, goTo: 4 },
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
