import mongoose, { Schema, type Model } from 'mongoose';
import type { CalendarProvider, ConnectionSettings } from '@/lib/calendar/types';

export type CalendarConnectionStatus = 'active' | 'error' | 'reauth_required';

export interface CalendarConnectionDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  provider: CalendarProvider;
  status: CalendarConnectionStatus;
  errorMessage?: string;
  encRefreshToken?: string;
  encAppPassword?: string;
  appleId?: string;
  calendarId?: string;
  appCalendarId?: string; // app-owned "Frogress" calendar receiving exported tasks
  calendarUrl?: string;
  calendarDisplayName?: string;
  syncToken?: string;
  ctag?: string;
  lastFullSyncAt?: Date;
  lastIncrementalSyncAt?: Date;
  nextPollAt?: Date;
  syncRequestedAt?: Date;
  channelId?: string;
  resourceId?: string;
  channelExpiration?: Date;
  channelToken?: string;
  settings: ConnectionSettings;
  createdAt: Date;
  updatedAt: Date;
}

const CalendarConnectionSchema = new Schema<CalendarConnectionDoc>(
  {
    userId: { type: String, required: true, index: true },
    provider: { type: String, enum: ['google', 'apple'], required: true },
    status: {
      type: String,
      enum: ['active', 'error', 'reauth_required'],
      default: 'active',
    },
    errorMessage: { type: String },
    encRefreshToken: { type: String },
    encAppPassword: { type: String },
    appleId: { type: String },
    calendarId: { type: String },
    appCalendarId: { type: String },
    calendarUrl: { type: String },
    calendarDisplayName: { type: String },
    syncToken: { type: String },
    ctag: { type: String },
    lastFullSyncAt: { type: Date },
    lastIncrementalSyncAt: { type: Date },
    nextPollAt: { type: Date },
    syncRequestedAt: { type: Date },
    channelId: { type: String },
    resourceId: { type: String },
    channelExpiration: { type: Date },
    channelToken: { type: String },
    settings: {
      importTagId: { type: String },
      exportEnabled: { type: Boolean, default: true },
      importEnabled: { type: Boolean, default: true },
    },
  },
  {
    collection: 'calendarconnections',
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
);

CalendarConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });
CalendarConnectionSchema.index({ nextPollAt: 1, status: 1 });
CalendarConnectionSchema.index({ channelId: 1 });

if (process.env.NODE_ENV === 'development') {
  delete mongoose.models.CalendarConnection;
}

const CalendarConnectionModel: Model<CalendarConnectionDoc> =
  (mongoose.models.CalendarConnection as Model<CalendarConnectionDoc>) ||
  mongoose.model<CalendarConnectionDoc>(
    'CalendarConnection',
    CalendarConnectionSchema,
  );

export default CalendarConnectionModel;
