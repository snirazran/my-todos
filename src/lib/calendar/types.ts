export type CalendarProvider = 'google' | 'apple';

export type NeutralRecurrence = {
  freq: 'daily' | 'weekly' | 'monthly';
  interval: number;
  byWeekday?: number[];
  byMonthday?: number[];
  until?: string;
};

export type NeutralEvent = {
  title: string;
  notes?: string;
  allDay: boolean;
  startDate: string;
  startTime?: string;
  endTime?: string;
  timezone: string;
  recurrence?: NeutralRecurrence;
  exdates?: string[];
  reminderMinutes?: number;
  appTaskId?: string;
  appGroupId?: string;
};

export type ConnectionSettings = {
  importTagId?: string;
  exportEnabled: boolean;
  importEnabled: boolean;
};
