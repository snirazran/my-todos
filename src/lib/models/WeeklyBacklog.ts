import mongoose, { Schema, type Model } from 'mongoose';

export interface WeeklyBacklogTask {
  id: string;
  text: string;
  order: number;
  completed: boolean;
}

export interface WeeklyBacklogDoc {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  weekStart: string; // LOCAL Sunday YYYY-MM-DD
  tasks: WeeklyBacklogTask[];
}

const WeeklyBacklogTaskSchema = new Schema<WeeklyBacklogTask>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    order: { type: Number, required: true },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const WeeklyBacklogSchema = new Schema<WeeklyBacklogDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weekStart: { type: String, required: true, index: true },
    tasks: { type: [WeeklyBacklogTaskSchema], default: [] },
  },
  { collection: 'weeklyBacklog' }
);

WeeklyBacklogSchema.index({ userId: 1, weekStart: 1 });

const WeeklyBacklogModel: Model<WeeklyBacklogDoc> =
  (mongoose.models.WeeklyBacklog as Model<WeeklyBacklogDoc>) ||
  mongoose.model<WeeklyBacklogDoc>('WeeklyBacklog', WeeklyBacklogSchema);

export default WeeklyBacklogModel;
