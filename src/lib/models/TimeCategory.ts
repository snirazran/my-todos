import mongoose, { Schema, type Model } from 'mongoose';

export interface TimeCategoryDoc {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  categories: string[];
}

const TimeCategorySchema = new Schema<TimeCategoryDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    categories: { type: [String], default: [] },
  },
  { collection: 'timeCategories' }
);

TimeCategorySchema.index({ userId: 1 });

const TimeCategoryModel: Model<TimeCategoryDoc> =
  (mongoose.models.TimeCategory as Model<TimeCategoryDoc>) ||
  mongoose.model<TimeCategoryDoc>('TimeCategory', TimeCategorySchema);

export default TimeCategoryModel;
