import mongoose, { Schema, type Model } from 'mongoose';

export interface TaskSectionDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  id: string;
  name: string;
  order: number;
  collapsed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSectionSchema = new Schema<TaskSectionDoc>(
  {
    userId: { type: String, ref: 'User', required: true, index: true },
    id: { type: String, required: true },
    name: { type: String, required: true },
    order: { type: Number, required: true },
    collapsed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

TaskSectionSchema.index({ userId: 1, id: 1 }, { unique: true });
TaskSectionSchema.index({ userId: 1, order: 1 });

export const TaskSectionModel: Model<TaskSectionDoc> =
  mongoose.models.TaskSection ||
  mongoose.model<TaskSectionDoc>('TaskSection', TaskSectionSchema);
