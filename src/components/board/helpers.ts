// components/board/helpers.ts

export type Task = {
  id: string;
  text: string;
  order: number;
  /** provided by /api/tasks?view=board */
  type?: 'weekly' | 'regular' | 'backlog';
  completed?: boolean;
  tags?: string[];
};

// Display has 7 weekday columns + 1 “Later” column at index 7
export type DisplayDay = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
// API uses Sunday..Saturday (0..6) and -1 for “Later”
export type ApiDay = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAYS = 8 as const;

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
] as const;

// UI order (display index -> api day 0..6)
const SUNDAY_FIRST: ReadonlyArray<Exclude<ApiDay, -1>> = [0, 1, 2, 3, 4, 5, 6];
const MONDAY_FIRST: ReadonlyArray<Exclude<ApiDay, -1>> = [1, 2, 3, 4, 5, 6, 0];
export const WEEK_ORDER = WEEK_START === 'monday' ? MONDAY_FIRST : SUNDAY_FIRST;

// Rolling order: returns 7 days starting from today (0..6)
export const getRollingWeekOrder = (): ReadonlyArray<Exclude<ApiDay, -1>> => {
  const today = new Date().getDay() as Exclude<ApiDay, -1>; // 0..6
  const order: Exclude<ApiDay, -1>[] = [];
  for (let i = 0; i < 7; i++) {
    order.push(((today + i) % 7) as Exclude<ApiDay, -1>);
  }
  return order;
};

// --- Mapping helpers ---

/** UI/display day index (0..6, 7=Later) -> API day (-1 for Later, else 0..6) */
export const apiDayFromDisplay = (
  displayDay: DisplayDay,
  order: ReadonlyArray<Exclude<ApiDay, -1>> = WEEK_ORDER
): ApiDay => (displayDay === 7 ? -1 : order[displayDay]);

/** API day (0..6, -1=Later) -> UI/display index (0..6, 7=Later) */
export const displayDayFromApi = (
  apiDay: ApiDay,
  order: ReadonlyArray<Exclude<ApiDay, -1>> = WEEK_ORDER
): DisplayDay =>
  apiDay === -1 ? 7 : (order.indexOf(apiDay) as DisplayDay);

/** Label for a weekday display index (0..6). For index 7, use your own EXTRA label. */
export const labelForDisplayDay = (
  displayDay: Exclude<DisplayDay, 7>,
  order: ReadonlyArray<Exclude<ApiDay, -1>> = WEEK_ORDER
): string => englishDays[order[displayDay]];

/** Today as UI/display index (0..6) using provided order */
export const todayDisplayIndex = (
  order: ReadonlyArray<Exclude<ApiDay, -1>> = WEEK_ORDER
): Exclude<DisplayDay, 7> => {
  const apiToday = new Date().getDay() as Exclude<ApiDay, -1>; // 0..6 Sun..Sat
  return order.indexOf(apiToday) as Exclude<DisplayDay, 7>;
};

// DnD ids (use display day index)
export const droppableId = (displayDay: DisplayDay) => `day-${displayDay}`;
export const parseDroppable = (id: string): { day: DisplayDay } => {
  const n = Number(id.replace('day-', ''));
  // clamp to 0..7 just in case
  const safe = Number.isFinite(n) ? Math.max(0, Math.min(7, Math.trunc(n))) : 0;
  return { day: safe as DisplayDay };
};
export const draggableIdFor = (displayDay: DisplayDay, taskId: string) =>
  `${taskId}__d${displayDay}`;
