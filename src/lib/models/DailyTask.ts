import mongoose, { Schema, type Model } from 'mongoose';
import type { TaskType } from './Task';

export type TaskOrigin = TaskType | 'manual';

export interface DailyTaskItem {
  id: string;
  text: string;
  order: number;
  completed: boolean;
  origin?: TaskOrigin;
}

export interface DailyTaskDoc {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  tasks: DailyTaskItem[];
  suppressed?: string[];
}

const DailyTaskItemSchema = new Schema<DailyTaskItem>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    order: { type: Number, required: true },
    completed: { type: Boolean, default: false },
    origin: { type: String, enum: ['weekly', 'regular', 'manual'], required: false },
  },
  { _id: false }
);

const DailyTaskSchema = new Schema<DailyTaskDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true, index: true },
    tasks: { type: [DailyTaskItemSchema], default: [] },
    suppressed: { type: [String], default: [] },
  },
  { collection: 'dailyTasks' }
);

DailyTaskSchema.index({ userId: 1, date: 1 });

const DailyTaskModel: Model<DailyTaskDoc> =
  (mongoose.models.DailyTask as Model<DailyTaskDoc>) ||
  mongoose.model<DailyTaskDoc>('DailyTask', DailyTaskSchema);

export default DailyTaskModel;
