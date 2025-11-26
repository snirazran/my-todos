import mongoose, { Schema, type Model } from 'mongoose';

export interface TimeEntryDoc {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  task: string;
  category: string;
  start: Date;
  end: Date;
  durationMs: number;
  plannedMinutes?: number | null;
  dateKey: string; // YYYY-MM-DD (LOCAL-ish)
  createdAt: Date;
}

const TimeEntrySchema = new Schema<TimeEntryDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    task: { type: String, required: true },
    category: { type: String, required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    durationMs: { type: Number, required: true },
    plannedMinutes: { type: Number, default: null },
    dateKey: { type: String, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'timeEntries' }
);

TimeEntrySchema.index({ userId: 1, dateKey: 1 });

const TimeEntryModel: Model<TimeEntryDoc> =
  (mongoose.models.TimeEntry as Model<TimeEntryDoc>) ||
  mongoose.model<TimeEntryDoc>('TimeEntry', TimeEntrySchema);

export default TimeEntryModel;
