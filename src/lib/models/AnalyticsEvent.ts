import mongoose, { Schema, type Model } from 'mongoose';
import type {
  AnalyticsEventName,
  AnalyticsPlatform,
  AnalyticsSource,
} from '@/lib/analytics/events';

export interface AnalyticsEventDoc {
  userId: string;
  name: AnalyticsEventName;
  category: string;
  source: AnalyticsSource;
  platform: AnalyticsPlatform;
  sessionId?: string;
  anonymousId?: string;
  externalId?: string;
  properties: Record<string, string | number | boolean>;
  occurredAt: Date;
  createdAt: Date;
}

const AnalyticsEventSchema = new Schema<AnalyticsEventDoc>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    source: { type: String, required: true },
    platform: { type: String, required: true, default: 'unknown', index: true },
    sessionId: { type: String, default: undefined },
    anonymousId: { type: String, default: undefined, index: true },
    externalId: { type: String, default: undefined },
    properties: { type: Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, required: true, default: Date.now, index: true },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
      expires: 60 * 60 * 24 * 400,
    },
  },
  { collection: 'analyticsEvents' },
);

AnalyticsEventSchema.index({ occurredAt: 1, name: 1, userId: 1 });
AnalyticsEventSchema.index({ externalId: 1 }, { unique: true, sparse: true });

const AnalyticsEventModel: Model<AnalyticsEventDoc> =
  (mongoose.models.AnalyticsEvent as Model<AnalyticsEventDoc>) ||
  mongoose.model<AnalyticsEventDoc>('AnalyticsEvent', AnalyticsEventSchema);

export default AnalyticsEventModel;
