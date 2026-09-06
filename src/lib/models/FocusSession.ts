import mongoose, { Schema, type Model } from 'mongoose';
import type { FocusSubjectKind } from '@/lib/focusSubject';

export type FocusReviewState = 'pending' | 'done' | 'expired';

export interface FocusSessionDoc {
  _id?: mongoose.Types.ObjectId;
  id: string;
  userId: string;
  date: string;
  subjectKind: FocusSubjectKind;
  subjectId: string;
  subjectLabel: string;
  focusSeconds: number;
  breakSeconds: number;
  taskIds: string[];
  startedAt: Date;
  endedAt?: Date;
  reviewState: FocusReviewState;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FocusSessionSchema = new Schema<FocusSessionDoc>(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    subjectKind: { type: String, required: true, default: 'task' },
    subjectId: { type: String, default: '' },
    subjectLabel: { type: String, default: '' },
    focusSeconds: { type: Number, default: 0 },
    breakSeconds: { type: Number, default: 0 },
    taskIds: { type: [String], default: [] },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: undefined },
    reviewState: { type: String, default: 'pending' },
    reviewedAt: { type: Date, default: undefined },
  },
  {
    collection: 'focussessions',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

FocusSessionSchema.index({ userId: 1, id: 1 }, { unique: true });
FocusSessionSchema.index({ userId: 1, date: 1 });
FocusSessionSchema.index({ userId: 1, reviewState: 1, endedAt: -1 });
FocusSessionSchema.index({ userId: 1, taskIds: 1 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.FocusSession;
}

const FocusSessionModel: Model<FocusSessionDoc> =
  (mongoose.models.FocusSession as Model<FocusSessionDoc>) ||
  mongoose.model<FocusSessionDoc>('FocusSession', FocusSessionSchema);

export default FocusSessionModel;
