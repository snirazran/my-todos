import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import AnalyticsEventModel from '@/lib/models/AnalyticsEvent';
import ReferralModel from '@/lib/models/Referral';
import {
  classifyTouch,
  cleanText,
  sanitizeTouch,
  type AcquisitionChannel,
  type FirstTouch,
  type UserAcquisition,
} from './classify';

const RC_API_BASE = 'https://api.revenuecat.com/v1';
const RC_WINDOW_DAYS = 8;
const TOUCH_GRACE_MS = 15 * 60 * 1000;
const BACKFILL_DELAY_MS = 30 * 60 * 1000;

type Platform = UserAcquisition['platform'];

type RcAttributes = Record<string, { value?: unknown } | undefined>;

function isNative(platform: Platform) {
  return platform === 'ios' || platform === 'android';
}

function rcBackoffMs(checks: number) {
  if (checks < 3) return 20 * 60 * 1000;
  if (checks < 8) return 3 * 60 * 60 * 1000;
  return 12 * 60 * 60 * 1000;
}

async function inviterFor(touch: FirstTouch | undefined, userId: string) {
  if (touch?.ref) {
    const referral = await ReferralModel.findOne({ code: touch.ref }).select('inviterId').lean();
    if (referral?.inviterId) return referral.inviterId;
  }
  const claimed = await ReferralModel.findOne({ claimedByUserId: userId }).select('inviterId').lean();
  return claimed?.inviterId ?? undefined;
}

async function acquisitionFromTouch(
  userId: string,
  touch: FirstTouch | undefined,
  platform: Platform,
): Promise<UserAcquisition> {
  const classified = classifyTouch(touch, platform);
  const inviterId = await inviterFor(touch, userId);
  const now = new Date();
  const base: UserAcquisition = {
    ...classified,
    touch,
    touchedAt: touch ? new Date(touch.at) : undefined,
    resolvedAt: now,
    status: isNative(platform) && !classified.paid ? 'pending' : 'final',
  };
  if (inviterId && !classified.paid) {
    return { ...base, channel: 'referral', network: base.network ?? 'invite', inviterId, resolvedBy: 'referral' };
  }
  return base;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export async function saveFirstTouch(userId: string, rawTouch: unknown, platform: Platform) {
  const touch = sanitizeTouch(rawTouch);
  if (!touch) return;
  try {
    await connectMongo();
    const user = await UserModel.findOne({ _id: userId, acquisition: { $exists: false } })
      .select('createdAt')
      .lean<{ createdAt?: Date } | null>();
    if (!user?.createdAt) return;
    if (new Date(touch.at).getTime() > new Date(user.createdAt).getTime() + TOUCH_GRACE_MS) return;
    const acquisition = await acquisitionFromTouch(userId, touch, platform);
    await UserModel.updateOne(
      { _id: userId, acquisition: { $exists: false } },
      { $set: { acquisition: stripUndefined(acquisition) } },
    );
  } catch (error) {
    console.error('First-touch save failed:', error);
  }
}

function attr(attributes: RcAttributes, key: string) {
  return cleanText(attributes?.[key]?.value, 200);
}

function rcChannel(mediaSource: string): AcquisitionChannel {
  const source = mediaSource.toLowerCase();
  if (source.includes('apple') || source.includes('search ads')) return 'apple_ads';
  if (source.includes('facebook') || source.includes('meta') || source.includes('instagram')) return 'meta_ads';
  if (source.includes('tiktok')) return 'tiktok_ads';
  if (source.includes('google') || source.includes('adwords')) return 'google_ads';
  return 'other_paid';
}

export function acquisitionFromRevenueCat(
  attributes: RcAttributes | undefined,
): Partial<UserAcquisition> | null {
  if (!attributes || typeof attributes !== 'object') return null;
  const mediaSource = attr(attributes, '$mediaSource');
  if (!mediaSource || /organic/i.test(mediaSource)) return null;
  return stripUndefined({
    channel: rcChannel(mediaSource),
    paid: true,
    network: mediaSource,
    campaign: attr(attributes, '$campaign'),
    adGroup: attr(attributes, '$adGroup'),
    keyword: attr(attributes, '$keyword'),
    ad: attr(attributes, '$ad') ?? attr(attributes, '$creative'),
    resolvedBy: 'revenuecat' as const,
    status: 'final' as const,
    resolvedAt: new Date(),
  });
}

export async function applyRevenueCatAttributes(userId: string, attributes: RcAttributes | undefined) {
  const resolved = acquisitionFromRevenueCat(attributes);
  if (!resolved) return false;
  await connectMongo();
  const user = await UserModel.findById(userId)
    .select('acquisition')
    .lean<{ acquisition?: UserAcquisition } | null>();
  if (!user) return false;
  const existing = user.acquisition;
  if (existing?.paid && existing.resolvedBy !== 'revenuecat') return false;
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        acquisition: stripUndefined({
          platform: existing?.platform,
          touch: existing?.touch,
          touchedAt: existing?.touchedAt,
          referrerHost: existing?.referrerHost,
          rcChecks: (existing?.rcChecks ?? 0) + 1,
          rcCheckedAt: new Date(),
          ...resolved,
        }),
      },
    },
  );
  return true;
}

async function fetchRevenueCatAttributes(userId: string): Promise<RcAttributes | null> {
  const secretKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!secretKey) return null;
  const response = await fetch(`${RC_API_BASE}/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`RevenueCat attribute fetch failed (${response.status})`);
  const data = await response.json();
  return (data?.subscriber?.subscriber_attributes as RcAttributes) ?? {};
}

async function checkRevenueCat(user: { _id: unknown; createdAt?: Date; acquisition?: UserAcquisition }) {
  const userId = String(user._id);
  const attributes = await fetchRevenueCatAttributes(userId);
  if (attributes === null) return 'unconfigured' as const;
  if (await applyRevenueCatAttributes(userId, attributes)) return 'resolved' as const;
  const age = Date.now() - new Date(user.createdAt ?? Date.now()).getTime();
  const expired = age > RC_WINDOW_DAYS * 86_400_000;
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        'acquisition.rcCheckedAt': new Date(),
        ...(expired ? { 'acquisition.status': 'final' } : {}),
      },
      $inc: { 'acquisition.rcChecks': 1 },
    },
  );
  return expired ? ('expired' as const) : ('waiting' as const);
}

async function platformFor(userId: string): Promise<Platform> {
  const rows = await AnalyticsEventModel.aggregate<{ _id: string; count: number }>([
    { $match: { userId, platform: { $in: ['ios', 'android', 'web'] } } },
    { $group: { _id: '$platform', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);
  const platform = rows[0]?._id;
  return platform === 'ios' || platform === 'android' || platform === 'web' ? platform : 'unknown';
}

async function touchFromEvents(userId: string, createdAt: Date): Promise<FirstTouch | undefined> {
  const anonymousIds = await AnalyticsEventModel.distinct('anonymousId', {
    userId,
    anonymousId: { $exists: true },
  });
  const first = await AnalyticsEventModel.findOne({
    name: 'app_opened',
    occurredAt: { $lte: new Date(createdAt.getTime() + TOUCH_GRACE_MS) },
    $or: [{ userId }, ...(anonymousIds.length ? [{ anonymousId: { $in: anonymousIds } }] : [])],
  })
    .sort({ occurredAt: 1 })
    .select('occurredAt properties')
    .lean<{ occurredAt: Date; properties?: Record<string, unknown> } | null>();
  if (!first) return undefined;
  const properties = first.properties ?? {};
  const host = cleanText(properties.referrer_host);
  return sanitizeTouch({
    at: new Date(first.occurredAt).toISOString(),
    referrer: host ? `https://${host}/` : undefined,
    utm_source: properties.utm_source,
    utm_medium: properties.utm_medium,
    utm_campaign: properties.utm_campaign,
    utm_content: properties.utm_content,
    utm_term: properties.utm_term,
  });
}

export async function backfillAcquisition(user: { _id: unknown; createdAt?: Date }) {
  const userId = String(user._id);
  const createdAt = new Date(user.createdAt ?? Date.now());
  const [touch, platform] = await Promise.all([touchFromEvents(userId, createdAt), platformFor(userId)]);
  const acquisition = await acquisitionFromTouch(userId, touch, platform);
  await UserModel.updateOne(
    { _id: userId, acquisition: { $exists: false } },
    { $set: { acquisition: stripUndefined(acquisition) } },
  );
  return acquisition;
}

export type ResolverReport = {
  backfilled: number;
  checked: number;
  resolved: number;
  expired: number;
  failed: number;
  revenueCatConfigured: boolean;
};

export async function runAttributionResolver(options: { backfillLimit?: number; checkLimit?: number; force?: boolean } = {}) {
  await connectMongo();
  const report: ResolverReport = {
    backfilled: 0,
    checked: 0,
    resolved: 0,
    expired: 0,
    failed: 0,
    revenueCatConfigured: !!process.env.REVENUECAT_SECRET_API_KEY,
  };

  const missing = await UserModel.find({
    acquisition: { $exists: false },
    createdAt: { $lte: new Date(Date.now() - (options.force ? 0 : BACKFILL_DELAY_MS)) },
  })
    .select('_id createdAt')
    .sort({ createdAt: -1 })
    .limit(options.backfillLimit ?? 100)
    .lean<Array<{ _id: unknown; createdAt?: Date }>>();
  for (const user of missing) {
    try {
      await backfillAcquisition(user);
      report.backfilled += 1;
    } catch (error) {
      report.failed += 1;
      console.error('Attribution backfill failed:', error);
    }
  }

  if (!report.revenueCatConfigured) return report;

  const pending = await UserModel.find({ 'acquisition.status': 'pending' })
    .select('_id createdAt acquisition')
    .sort({ createdAt: -1 })
    .limit((options.checkLimit ?? 40) * 3)
    .lean<Array<{ _id: unknown; createdAt?: Date; acquisition?: UserAcquisition }>>();
  const now = Date.now();
  const due = pending
    .filter((user) => {
      if (options.force) return true;
      const last = user.acquisition?.rcCheckedAt ? new Date(user.acquisition.rcCheckedAt).getTime() : 0;
      return now - last >= rcBackoffMs(user.acquisition?.rcChecks ?? 0);
    })
    .slice(0, options.checkLimit ?? 40);

  for (const user of due) {
    try {
      const outcome = await checkRevenueCat(user);
      report.checked += 1;
      if (outcome === 'resolved') report.resolved += 1;
      if (outcome === 'expired') report.expired += 1;
    } catch (error) {
      report.failed += 1;
      console.error('RevenueCat attribution check failed:', error);
    }
  }
  return report;
}
