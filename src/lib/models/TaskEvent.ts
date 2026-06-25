import mongoose, { Schema, type Model } from 'mongoose';

export type TaskEventKind =
  | 'tasks-changed'
  | 'task-completed'
  | 'task-uncompleted'
  | 'background-equipped'
  | 'wardrobe-equipped';

export interface TaskEventDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  eventKind: TaskEventKind;
  taskId?: string;
  completed?: boolean;
  date?: string;
  backgroundId?: string;
  slot?: string;
  itemId?: string | null;
  createdAt: Date;
}

const TaskEventSchema = new Schema<TaskEventDoc>(
  {
    userId: { type: String, required: true, index: true },
    eventKind: {
      type: String,
      enum: [
        'tasks-changed',
        'task-completed',
        'task-uncompleted',
        'background-equipped',
        'wardrobe-equipped',
      ],
      required: true,
    },
    taskId: { type: String },
    completed: { type: Boolean },
    date: { type: String },
    backgroundId: { type: String },
    slot: { type: String },
    itemId: { type: String, default: undefined },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 14 },
  },
  {
    collection: 'taskEvents',
  },
);

TaskEventSchema.index({ userId: 1, _id: 1 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.TaskEvent;
}

const TaskEventModel: Model<TaskEventDoc> =
  (mongoose.models.TaskEvent as Model<TaskEventDoc>) ||
  mongoose.model<TaskEventDoc>('TaskEvent', TaskEventSchema);

export default TaskEventModel;
