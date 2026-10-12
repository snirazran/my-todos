import mongoose, { type Model } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import AnalyticsEventModel, {
  AnalyticsEventSchema,
  type AnalyticsEventDoc,
} from '@/lib/models/AnalyticsEvent';

const EXCLUDED_FROG_NAMES = new Set(['snirlovealon']);
const CACHE_MS = 60_000;

let cache: { ids: Set<string>; at: number } | null = null;

export const NOT_STATS_EXCLUDED = { excludeFromStats: { $ne: true } } as const;

export function isStatsExcludedFrogName(name: unknown): boolean {
  return (
    typeof name === 'string' &&
    EXCLUDED_FROG_NAMES.has(name.toLowerCase().replace(/\s+/g, ''))
  );
}

export async function statsExcludedUserIds(): Promise<string[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return Array.from(cache.ids);
  await connectMongo();
  const rows = await UserModel.find({ excludeFromStats: true })
    .select('_id')
    .lean<Array<{ _id: unknown }>>();
  cache = { ids: new Set(rows.map((row) => String(row._id))), at: Date.now() };
  return Array.from(cache.ids);
}

export async function isStatsExcludedUser(userId: string): Promise<boolean> {
  return (await statsExcludedUserIds()).includes(userId);
}

async function linkedEventFilter(userId: string) {
  const anonymousIds = (
    await AnalyticsEventModel.distinct('anonymousId', {
      userId,
      anonymousId: { $type: 'string' },
    })
  ).filter((id): id is string => typeof id === 'string' && id.length > 0);

  return {
    $or: [
      { userId },
      ...(anonymousIds.length
        ? [
            {
              userId: { $in: anonymousIds.map((id) => `anonymous:${id}`) },
              anonymousId: { $in: anonymousIds },
            },
          ]
        : []),
    ],
  };
}

export async function excludeUserFromStats(userId: string): Promise<void> {
  await connectMongo();
  await UserModel.updateOne({ _id: userId }, { $set: { excludeFromStats: true } });
  cache?.ids.add(userId);
  await AnalyticsEventModel.updateMany(await linkedEventFilter(userId), {
    $set: { excludeFromStats: true },
  });
}

export async function includeUserInStats(userId: string): Promise<void> {
  await connectMongo();
  await UserModel.updateOne({ _id: userId }, { $set: { excludeFromStats: false } });
  cache?.ids.delete(userId);
  await AnalyticsEventModel.updateMany(await linkedEventFilter(userId), {
    $unset: { excludeFromStats: 1 },
  });
}

function buildStatsEventModel(): Model<AnalyticsEventDoc> {
  const schema = AnalyticsEventSchema.clone();
  schema.set('autoIndex', false);
  schema.pre('aggregate', function () {
    this.pipeline().unshift({ $match: NOT_STATS_EXCLUDED });
  });
  schema.pre(['find', 'findOne', 'countDocuments', 'distinct'], function () {
    this.where(NOT_STATS_EXCLUDED);
  });
  return mongoose.model<AnalyticsEventDoc>('AnalyticsEventStats', schema, 'analyticsEvents');
}

export const StatsEventModel: Model<AnalyticsEventDoc> =
  (mongoose.models.AnalyticsEventStats as Model<AnalyticsEventDoc>) || buildStatsEventModel();
