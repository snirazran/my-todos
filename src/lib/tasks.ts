export interface Task {
  id: string;
  text: string;
  order: number;
}

export const getTodaysTasks = (dayOfWeek: number): Task[] => {
  const baseTasks: Task[] = [
    { id: 'wake-8', text: 'קמת ב 8?', order: 1 },
    { id: 'meditation', text: 'עשית מדיטציה?', order: 2 },
    { id: 'read-book', text: 'קראת בספר?', order: 3 },
    { id: 'affirmations', text: 'קראת אפירמציות?', order: 4 },
    { id: 'hourly-break', text: 'לקחת הפסקה כל שעה?', order: 5 },
  ];

  let tasks = [...baseTasks];

  // Sunday = 0, Monday = 1, ..., Saturday = 6
  if (dayOfWeek === 0 || dayOfWeek === 2 || dayOfWeek === 4) {
    // Sunday, Tuesday, Thursday - add workout
    tasks.push({ id: 'workout', text: 'התאמנת?', order: 6 });
  } else if (dayOfWeek === 1 || dayOfWeek === 3) {
    // Monday, Wednesday - add stretching
    tasks.push({ id: 'stretching', text: 'עשית מתיחות?', order: 6 });
  }

  // Add common tasks for Sunday-Wednesday
  if (dayOfWeek >= 0 && dayOfWeek <= 3) {
    tasks.push(
      { id: 'outside-hour', text: 'היית שעה מחוץ לבית?', order: 7 },
      { id: 'journal', text: 'רשמת ביומן?', order: 8 },
      { id: 'screen-break', text: 'הפסקת מסך שעה לפני שינה?', order: 9 },
      { id: 'sleep-12', text: 'הלכת לישון ב 12?', order: 10 }
    );
  }

  // Thursday
  if (dayOfWeek === 4) {
    tasks.push(
      { id: 'outside-hour', text: 'היית שעה מחוץ לבית?', order: 7 },
      { id: 'journal', text: 'רשמת ביומן?', order: 8 }
    );
  }

  // Friday
  if (dayOfWeek === 5) {
    tasks = [
      { id: 'meditation', text: 'עשית מדיטציה?', order: 1 },
      { id: 'read-book', text: 'קראת בספר?', order: 2 },
      { id: 'affirmations', text: 'קראת אפירמציות?', order: 3 },
      { id: 'outside-hour', text: 'היית שעה מחוץ לבית?', order: 4 },
      { id: 'journal', text: 'רשמת ביומן?', order: 5 },
    ];
  }

  // Saturday
  if (dayOfWeek === 6) {
    tasks = [
      { id: 'meditation', text: 'עשית מדיטציה?', order: 1 },
      { id: 'read-book', text: 'קראת בספר?', order: 2 },
      { id: 'affirmations', text: 'קראת אפירמציות?', order: 3 },
      { id: 'outside-hour', text: 'היית שעה מחוץ לבית?', order: 4 },
      { id: 'journal', text: 'רשמת ביומן?', order: 5 },
      { id: 'screen-break', text: 'הפסקת מסך שעה לפני שינה?', order: 6 },
      { id: 'sleep-12', text: 'הלכת לישון ב 12?', order: 7 },
    ];
  }

  return tasks.sort((a, b) => a.order - b.order);
};
