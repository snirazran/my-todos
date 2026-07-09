import mongoose, { Schema, type Model } from 'mongoose';

export type TaskType = 'weekly' | 'regular' | 'backlog';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TaskDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  type: TaskType;
  id: string;
  text: string;
  order: number;
  completed?: boolean;
  completedDates?: string[]; // YYYY-MM-DD entries where the task was completed
  suppressedDates?: string[]; // YYYY-MM-DD entries hidden for that date
  orderOverrides?: Record<string, number>; // YYYY-MM-DD -> per-date order for repeating instances
  notes?: string; // free-text notes shown in the task detail card
  checklist?: { id: string; text: string; done: boolean }[]; // Trello-like sub-items
  checklistDoneByDate?: Record<string, string[]>; // YYYY-MM-DD -> checked item ids (repeating tasks only)
  repeatMode?:
    | 'none'
    | 'daily'
    | 'weekdays'
    | 'weekend'
    | 'weekly'
    | 'monthly'
    | 'custom'; // chosen repeat option
  repeatGroupId?: string; // links daily/weekdays/weekend sibling tasks together
  repeatStartDate?: string; // YYYY-MM-DD first date this repeat should appear
  repeatEndDate?: string; // YYYY-MM-DD last date this repeat should appear (inclusive); absent = never ends
  repeatDayOfMonth?: number; // 1..31 anchor day for monthly repeats
  repeatRule?: {
    // custom interval-based recurrence (RRULE-like)
    freq: 'daily' | 'weekly' | 'monthly';
    interval: number; // every N days/weeks/months
    byWeekday?: number[]; // weekly: 0..6 (Sun..Sat)
    byMonthday?: number[]; // monthly: 1..31
  };
  dayOfWeek?: Weekday;
  date?: string;
  weekStart?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
  tags?: string[];
  frogodoroSettings?: {
    focusDuration: number;
    breakDuration: number;
  };
  frogodoroSessions?: {
    date: string;
    focusTime: number;
    breakTime: number;
  }[];
  calendarEventId?: string; // Google Calendar event ID for dedup
  exportedEventId?: string; // event id this task was pushed to in the app calendar
  exportFingerprint?: string; // content hash at last export, to detect changes
  startTime?: string; // e.g. "10:30"
  endTime?: string; // e.g. "11:30"
  reminder?: string; // e.g. "at_time", "5m", "10m", "15m", "30m", "1h"
  reminderSentKeys?: string[];
  bondId?: string; // links this task to a shared "buddy" bond (TaskBond)
  buddyUserId?: string; // the friend this task is shared with
}

const TaskSchema = new Schema<TaskDoc>(
  {
    userId: { type: String, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['weekly', 'regular', 'backlog'],
      required: true,
    },
    id: { type: String, required: true, index: true },
    text: { type: String, required: true },
    order: { type: Number, required: true },
    completed: { type: Boolean, default: false },
    completedDates: { type: [String], default: [] },
    suppressedDates: { type: [String], default: [] },
    orderOverrides: { type: Schema.Types.Mixed, default: undefined },
    notes: { type: String },
    repeatMode: {
      type: String,
      enum: [
        'none',
        'daily',
        'weekdays',
        'weekend',
        'weekly',
        'monthly',
        'custom',
      ],
    },
    repeatGroupId: { type: String, index: true },
    repeatStartDate: { type: String },
    repeatEndDate: { type: String },
    repeatDayOfMonth: { type: Number, min: 1, max: 31 },
    repeatRule: {
      type: {
        freq: { type: String, enum: ['daily', 'weekly', 'monthly'] },
        interval: { type: Number, default: 1, min: 1 },
        byWeekday: { type: [Number], default: undefined },
        byMonthday: { type: [Number], default: undefined },
      },
      required: false,
      _id: false,
      default: undefined,
    },
    checklist: {
      type: [
        {
          id: { type: String, required: true },
          text: { type: String, default: '' },
          done: { type: Boolean, default: false },
        },
      ],
      default: undefined,
    },
    checklistDoneByDate: { type: Schema.Types.Mixed, default: undefined },
    dayOfWeek: { type: Number, min: 0, max: 6 },
    date: { type: String },
    weekStart: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    deletedAt: { type: Date },
    tags: { type: [String], default: [] },
    frogodoroSettings: {
      type: {
        focusDuration: { type: Number, default: 25 },
        breakDuration: { type: Number, default: 5 },
      },
      required: false,
    },
    frogodoroSessions: {
      type: [
        {
          date: { type: String, required: true },
          focusTime: { type: Number, default: 0 },
          breakTime: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    calendarEventId: { type: String },
    exportedEventId: { type: String },
    exportFingerprint: { type: String },
    startTime: { type: String },
    endTime: { type: String },
    reminder: { type: String },
    reminderSentKeys: { type: [String], default: [] },
    bondId: { type: String, index: true },
    buddyUserId: { type: String },
  },
  {
    collection: 'tasks',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

TaskSchema.index({ userId: 1, id: 1 });
TaskSchema.index({ userId: 1, type: 1, date: 1, order: 1 });
TaskSchema.index({ userId: 1, type: 1, dayOfWeek: 1, order: 1 });
TaskSchema.index({ userId: 1, type: 1, weekStart: 1, order: 1 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.Task;
}

const TaskModel: Model<TaskDoc> =
  (mongoose.models.Task as Model<TaskDoc>) ||
  mongoose.model<TaskDoc>('Task', TaskSchema);

export default TaskModel;
