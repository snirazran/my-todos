export const WIDGET_PAYLOAD_VERSION = 1;

export type FrogMood = 'happy' | 'neutral' | 'hungry' | 'asleep';

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
  streak: number;
  mood: FrogMood;
  doneCount: number;
  totalCount: number;
  /** One contextual line from the frog, picked web-side by frogSpeech. */
  message: string;
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

export type PendingAction = PendingAdd | PendingToggle;

export type WidgetPinState = 'unsupported' | 'available' | 'pinned';

/** How many rows the largest widget size can show. */
export const WIDGET_TASK_LIMIT = 8;
