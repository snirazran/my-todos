import connectMongo from '@/lib/mongoose';
import AnalyticsEventModel from '@/lib/models/AnalyticsEvent';
import {
  analyticsCategory,
  sanitizeAnalyticsProperties,
  type AnalyticsEventName,
  type AnalyticsPlatform,
  type AnalyticsSource,
} from '@/lib/analytics/events';

type RecordAnalyticsInput = {
  userId: string;
  name: AnalyticsEventName;
  source?: AnalyticsSource;
  platform?: AnalyticsPlatform;
  sessionId?: string;
  anonymousId?: string;
  externalId?: string;
  properties?: Record<string, unknown>;
  occurredAt?: Date;
};

export async function recordAnalyticsEvent(input: RecordAnalyticsInput) {
  try {
    await connectMongo();
    const document = {
      userId: input.userId,
      name: input.name,
      category: analyticsCategory(input.name),
      source: input.source ?? 'server',
      platform: input.platform ?? 'unknown',
      sessionId: input.sessionId?.slice(0, 80) || undefined,
      anonymousId: input.anonymousId?.slice(0, 80) || undefined,
      externalId: input.externalId?.slice(0, 160) || undefined,
      properties: sanitizeAnalyticsProperties(input.properties),
      occurredAt: input.occurredAt ?? new Date(),
    };

    if (document.externalId) {
      await AnalyticsEventModel.updateOne(
        { externalId: document.externalId },
        { $setOnInsert: document },
        { upsert: true },
      );
      return;
    }
    await AnalyticsEventModel.create(document);
  } catch (error) {
    console.error('Analytics event write failed:', error);
  }
}
