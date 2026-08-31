import mongoose, { Schema, type Model } from 'mongoose';
import type { CalendarProvider, ConnectionSettings } from '@/lib/calendar/types';

export type CalendarConnectionStatus =
  | 'active'
  | 'error'
  | 'paused'
  | 'reauth_required'
  | 'disconnected';

export type CalendarSyncErrorKind = 'auth' | 'gone' | 'rateLimit' | 'transient';

export interface CalendarConnectionDoc {
  _id?: mongoose.Types.ObjectId;
  userId: string;
  provider: CalendarProvider;
  status: CalendarConnectionStatus;
  errorMessage?: string;
  consecutiveFailures?: number;
  firstFailureAt?: Date;
  lastFailureAt?: Date;
  lastErrorKind?: CalendarSyncErrorKind;
  lastSuccessAt?: Date;
  pausedAt?: Date;
  pausedReason?: string;
  encRefreshToken?: string;
  /** Google scopes the stored refresh token was granted; absent on legacy rows. */
  grantedScopes?: string[];
  encAppPassword?: string;
  appleId?: string;
  calendarId?: string;
  appCalendarId?: string; // app-owned "Frogress" calendar receiving exported tasks (Google)
  appCalendarUrl?: string; // app-owned "Frogress" calendar receiving exported tasks (Apple)
  calendarDisplayName?: string;
  syncToken?: string;
  calendarCtags?: Record<string, string>; // per source-calendar ctag (Apple)
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
      enum: ['active', 'error', 'paused', 'reauth_required', 'disconnected'],
      default: 'active',
    },
    errorMessage: { type: String },
    consecutiveFailures: { type: Number, default: 0 },
    firstFailureAt: { type: Date },
    lastFailureAt: { type: Date },
    lastErrorKind: {
      type: String,
      enum: ['auth', 'gone', 'rateLimit', 'transient'],
    },
    lastSuccessAt: { type: Date },
    pausedAt: { type: Date },
    pausedReason: { type: String },
    encRefreshToken: { type: String },
    grantedScopes: { type: [String], default: undefined },
    encAppPassword: { type: String },
    appleId: { type: String },
    calendarId: { type: String },
    appCalendarId: { type: String },
    appCalendarUrl: { type: String },
    calendarDisplayName: { type: String },
    syncToken: { type: String },
    calendarCtags: { type: Schema.Types.Mixed },
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
CalendarConnectionSchema.index({ status: 1, firstFailureAt: 1 });

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
