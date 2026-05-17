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
  startTime?: string; // e.g. "10:30"
  endTime?: string; // e.g. "11:30"
  reminder?: string; // e.g. "at_time", "5m", "10m", "15m", "30m", "1h"
  reminderSentKeys?: string[];
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
    startTime: { type: String },
    endTime: { type: String },
    reminder: { type: String },
    reminderSentKeys: { type: [String], default: [] },
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
