import type { WidgetArt } from './art';
import type { WidgetWord } from './words';

export const WIDGET_PAYLOAD_VERSION = 1;

export type WidgetTask = {
  id: string;
  text: string;
  done: boolean;
};

export type WidgetPayload = {
  v: number;
  /** Firebase uid this snapshot belongs to. Empty when signed out. */
  uid: string;
  guest: boolean;
  signedIn: boolean;
  /** YYYY-MM-DD in the user's timezone, so the widget can detect a stale day. */
  day: string;
  doneCount: number;
  totalCount: number;
  /** Which frog illustration medium and large draw today. */
  art: WidgetArt;
  /** The word of the day shown in the large widget's footer. */
  word: WidgetWord;
  tasks: WidgetTask[];
  updatedAt: number;
};

export type PendingAdd = {
  kind: 'add';
  clientId: string;
  text: string;
  uid: string;
  guest: boolean;
  at: number;
};

export type PendingToggle = {
  kind: 'toggle';
  clientId: string;
  taskId: string;
  done: boolean;
  uid: string;
  guest: boolean;
  at: number;
};

/**
 * The widget's add button. The extension can't present a composer, so it
 * records the intent and the webview raises its own quick-add sheet on launch.
 */
export type PendingQuickAdd = {
  kind: 'quickadd';
  clientId: string;
  uid: string;
  guest: boolean;
  at: number;
};

export type PendingAction = PendingAdd | PendingToggle | PendingQuickAdd;

export type WidgetPinState = 'unsupported' | 'available' | 'pinned';

/** How many rows the largest widget size can show. */
export const WIDGET_TASK_LIMIT = 8;
