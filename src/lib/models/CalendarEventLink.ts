import mongoose, { Schema, type Model } from 'mongoose';
import type { CalendarProvider } from '@/lib/calendar/types';

export interface CalendarEventLinkDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  connectionId: mongoose.Types.ObjectId;
  provider: CalendarProvider;
  taskId?: string;
  repeatGroupId?: string;
  providerEventId?: string;
  providerHref?: string;
  providerUid?: string;
  etag?: string;
  recurrenceInstanceId?: string;
  origin: 'app' | 'calendar';
  lastSyncedAt: Date;
  lastSyncedFingerprint: string;
  createdAt: Date;
  updatedAt: Date;
}

const CalendarEventLinkSchema = new Schema<CalendarEventLinkDoc>(
  {
    userId: { type: String, required: true, index: true },
    connectionId: {
      type: Schema.Types.ObjectId,
      ref: 'CalendarConnection',
      required: true,
    },
    provider: { type: String, enum: ['google', 'apple'], required: true },
    taskId: { type: String },
    repeatGroupId: { type: String },
    providerEventId: { type: String },
    providerHref: { type: String },
    providerUid: { type: String },
    etag: { type: String },
    recurrenceInstanceId: { type: String },
    origin: { type: String, enum: ['app', 'calendar'], required: true },
    lastSyncedAt: { type: Date, required: true },
    lastSyncedFingerprint: { type: String, required: true },
  },
  {
    collection: 'calendareventlinks',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

CalendarEventLinkSchema.index({ userId: 1, provider: 1, providerEventId: 1 });
CalendarEventLinkSchema.index({ userId: 1, taskId: 1 });
CalendarEventLinkSchema.index({ userId: 1, repeatGroupId: 1 });
CalendarEventLinkSchema.index({ connectionId: 1 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.CalendarEventLink;
}

const CalendarEventLinkModel: Model<CalendarEventLinkDoc> =
  (mongoose.models.CalendarEventLink as Model<CalendarEventLinkDoc>) ||
  mongoose.model<CalendarEventLinkDoc>(
    'CalendarEventLink',
    CalendarEventLinkSchema,
  );

export default CalendarEventLinkModel;
