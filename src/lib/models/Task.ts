import mongoose, { Schema, type Model } from 'mongoose';

export type TaskType = 'weekly' | 'regular' | 'backlog';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TaskDoc {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: TaskType;
  id: string;
  text: string;
  order: number;
  completed?: boolean;
  dayOfWeek?: Weekday;
  date?: string;
  weekStart?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<TaskDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['weekly', 'regular', 'backlog'], required: true },
    id: { type: String, required: true, index: true },
    text: { type: String, required: true },
    order: { type: Number, required: true },
    completed: { type: Boolean, default: false },
    dayOfWeek: { type: Number, min: 0, max: 6 },
    date: { type: String },
    weekStart: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'tasks',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

TaskSchema.index({ userId: 1, id: 1 });

const TaskModel: Model<TaskDoc> =
  (mongoose.models.Task as Model<TaskDoc>) ||
  mongoose.model<TaskDoc>('Task', TaskSchema);

export default TaskModel;
