export type Task = { id: string; text: string; order: number };
export const DAYS = 8;
export const hebrewDays = [
  'ראשון',
  'שני',
  'שלישי',
  'רביעי',
  'חמישי',
  'שישי',
  'שבת',
];

export const droppableId = (day: number) => `day-${day}`;
export const parseDroppable = (id: string) => ({
  day: Number(id.replace('day-', '')) || 0,
});
export const draggableIdFor = (day: number, taskId: string) =>
  `${taskId}__d${day}`;

export const todayIndex = () => new Date().getDay(); // 0..6
