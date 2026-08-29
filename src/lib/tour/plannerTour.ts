export const TOUR_EVENT = {
  movedDay: 'frogress:tour-moved-day',
  parked: 'frogress:tour-parked',
  unparked: 'frogress:tour-unparked',
  selection: 'frogress:tour-selection',
  bulkDropped: 'frogress:tour-bulk-dropped',
  calendarJumped: 'frogress:tour-calendar-jumped',
} as const;

/** Fired only when the tour is played through, never when it is skipped. */
export const TOUR_COMPLETED_EVENT = 'frogress:planner-tour-completed';

export const TUTORIAL_CARD_HINT = 'tutorial-card';

export const TOUR_BLOCKED_TAP = 'frogress:tour-blocked-tap';

export const TOUR_SAVED_DROP_EVENT = 'frogress:tour-saved-drop';

export function isSavedDropHidden() {
  if (typeof document === 'undefined') return false;
  return document.body.dataset.tourNoSavedDrop === '1';
}

export function isPlannerTourLocked() {
  if (typeof document === 'undefined') return false;
  return document.body.dataset.plannerTour === '1';
}

/** Paid once, on genuine completion — skipping the tour earns nothing. */
export const PLANNER_TOUR_GIFT_ID = 'gift_box_1';
export const PLANNER_TOUR_GIFT_NAME = 'Common Gift';
/** riveIndex of gift_box_1 in the catalog, for the box's colour variant. */
export const PLANNER_TOUR_GIFT_RIVE = 0;

export function emitTourEvent(
  name: string,
  detail?: Record<string, unknown>,
) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export type TourBeat = {
  id: string;
  anchor: string;
  selector?: string;
  label: string;
  labelDesktop?: string;
  /** Anchor the ghost fingertip drags toward. Omit for tap beats. */
  dragTo?: string;
  /** Window event that completes the beat. */
  event?: string;
  /** Pressing the anchor completes the beat. */
  onPress?: boolean;
  /** Completes once an element matching this selector is on screen. */
  appears?: string;
  /** Minimum `detail.count` on the beat's event before it completes. */
  minCount?: number;
  /** Highlight every element matching the anchor, not just the first. */
  multi?: boolean;
  /** Bobbing chevron beside the anchor, for targets far from the coach bar. */
  pointAt?: 'up' | 'down';
  /** Keep the save-for-later drop strip out of this beat's drag entirely. */
  hideSavedDrop?: boolean;
  coverCheck?: boolean;
  /** Shown for a beat after this one completes. */
  payoff?: string;
};

export type TourChapter = {
  id: string;
  title: string;
  /** Practice cards seeded on the day in view when the chapter opens. */
  cards?: string[];
  beats: TourBeat[];
};

export const TOUR_CHAPTERS: TourChapter[] = [
  {
    id: 'move',
    title: 'Move a task',
    cards: ['Grab me — drag me to another day'],
    beats: [
      {
        id: 'move.drag',
        anchor: TUTORIAL_CARD_HINT,
        label: 'Hold me, then drag me to another day',
        labelDesktop: 'Hold me, then drag me to the next column',
        dragTo: 'tour-next-day',
        event: TOUR_EVENT.movedDay,
        hideSavedDrop: true,
        payoff: 'That’s it. Anything moves, any day.',
      },
    ],
  },
  {
    id: 'saved',
    title: 'Save for later',
    cards: ['Save me for later'],
    beats: [
      {
        id: 'saved.park',
        anchor: TUTORIAL_CARD_HINT,
        label: 'Hold me again, then drag me down to Saved',
        dragTo: 'saved-drop-target',
        event: TOUR_EVENT.parked,
        payoff: 'Saved. No date needed.',
      },
      {
        id: 'saved.open',
        anchor: 'saved-tasks',
        label: 'Your saved tasks live in here — take a look',
        onPress: true,
        pointAt: 'down',
      },
      {
        id: 'saved.unpark',
        anchor: 'saved-task-card',
        label: 'Hold it, then drag it back onto any day',
        dragTo: 'tour-day-column',
        event: TOUR_EVENT.unparked,
        payoff: 'And back onto a day whenever you want.',
      },
    ],
  },
  {
    id: 'bulk',
    title: 'Grab a few',
    cards: ['Tap me', 'Tap me too'],
    beats: [
      {
        id: 'bulk.enter',
        anchor: 'planner-select',
        label: 'Tap this at the top of the day to start picking',
        onPress: true,
        pointAt: 'up',
      },
      {
        id: 'bulk.pick',
        anchor: TUTORIAL_CARD_HINT,
        label: 'Now tap both of us',
        event: TOUR_EVENT.selection,
        minCount: 2,
        multi: true,
      },
      {
        id: 'bulk.drag',
        anchor: TUTORIAL_CARD_HINT,
        label: 'Now hold one of us and drag — we both come along',
        dragTo: 'tour-next-day',
        event: TOUR_EVENT.bulkDropped,
        payoff: 'Two taps instead of ten.',
      },
    ],
  },
  {
    id: 'calendar',
    title: 'Jump anywhere',
    beats: [
      {
        id: 'calendar.open',
        anchor: 'planner-date',
        label: 'Tap the date up top to jump to any day',
        onPress: true,
        pointAt: 'up',
      },
      {
        id: 'calendar.pick',
        anchor: 'month-calendar',
        label: 'Past or future — pick one',
        event: TOUR_EVENT.calendarJumped,
        payoff: 'Now you know the whole board.',
      },
    ],
  },
];

export const TOUR_BEAT_COUNT = TOUR_CHAPTERS.reduce(
  (sum, chapter) => sum + chapter.beats.length,
  0,
);

export function beatAt(chapterIndex: number, beatIndex: number) {
  return TOUR_CHAPTERS[chapterIndex]?.beats[beatIndex] ?? null;
}
