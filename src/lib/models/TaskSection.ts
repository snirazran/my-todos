import mongoose, { Schema, type Model } from 'mongoose';

export interface TaskSectionDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  id: string;
  name: string;
  order: number;
  collapsed?: boolean;
  collapsedDayKey?: string;
  tagIds?: string[];
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
    collapsedDayKey: { type: String, default: '' },
    tagIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

TaskSectionSchema.index({ userId: 1, id: 1 }, { unique: true });
TaskSectionSchema.index({ userId: 1, order: 1 });

export function isSectionCollapsedOn(
  section: Pick<TaskSectionDoc, 'collapsed' | 'collapsedDayKey'>,
  todayKey: string,
) {
  return !!section.collapsed && section.collapsedDayKey === todayKey;
}

export const TaskSectionModel: Model<TaskSectionDoc> =
  mongoose.models.TaskSection ||
  mongoose.model<TaskSectionDoc>('TaskSection', TaskSectionSchema);
