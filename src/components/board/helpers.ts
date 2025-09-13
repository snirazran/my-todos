// components/board/helpers.ts
export type Task = { id: string; text: string; order: number };

// 7 day columns + 1 "extra" column at index 7
export const DAYS = 8;

// --- CONFIG: change this to 'monday' if you want Monday first ---
export const WEEK_START: 'sunday' | 'monday' =
  (process.env.NEXT_PUBLIC_WEEK_START as 'sunday' | 'monday') || 'sunday';

// Labels for real days (0..6) in API order (Sun..Sat)
export const englishDays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// UI order (display index -> api day 0..6)
const SUNDAY_FIRST: number[] = [0, 1, 2, 3, 4, 5, 6];
const MONDAY_FIRST: number[] = [1, 2, 3, 4, 5, 6, 0];
export const WEEK_ORDER = WEEK_START === 'monday' ? MONDAY_FIRST : SUNDAY_FIRST;

// --- Mapping helpers ---

/** UI/display day index (0..6, 7=extra) -> API day number (0..6, -1=extra) */
export const apiDayFromDisplay = (displayDay: number): number =>
  displayDay === 7 ? -1 : WEEK_ORDER[displayDay];

/** API day number (0..6, -1=extra) -> UI/display day index (0..6, 7=extra) */
export const displayDayFromApi = (apiDay: number): number =>
  apiDay === -1 ? 7 : WEEK_ORDER.indexOf(apiDay);

/** Label for a display day index (0..6) */
export const labelForDisplayDay = (displayDay: number): string =>
  englishDays[WEEK_ORDER[displayDay]];

/** Today as UI/display index (0..6) using WEEK_ORDER */
export const todayDisplayIndex = (): number => {
  const apiToday = new Date().getDay(); // 0..6 Sun..Sat
  return displayDayFromApi(apiToday);
};

export const droppableId = (day: number) => `day-${day}`;
export const parseDroppable = (id: string) => ({
  day: Number(id.replace('day-', '')) || 0,
});
export const draggableIdFor = (day: number, taskId: string) =>
  `${taskId}__d${day}`;
