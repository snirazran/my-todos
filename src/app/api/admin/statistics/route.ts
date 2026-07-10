import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import AnalyticsEventModel from '@/lib/models/AnalyticsEvent';
import UserModel from '@/lib/models/User';
import { getPrizePool } from '@/lib/skins/gifts';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import QuestSeasonModel from '@/lib/models/QuestSeason';
import FriendshipModel from '@/lib/models/Friendship';
import FriendRequestModel from '@/lib/models/FriendRequest';
import ReferralModel from '@/lib/models/Referral';
import TaskBondModel from '@/lib/models/TaskBond';

const VALID_RANGES = new Set([7, 30, 90, 365]);
const RETENTION_EVENT = 'app_opened';

type EventSummaryRow = {
  _id: string;
  count: number;
  users: string[];
};

type DailyEventRow = {
  _id: { date: string; name: string };
  count: number;
  users: string[];
  sessions: string[];
  revenue: number;
  proceeds: number;
};

type EconomyRow = {
  _id: {
    name: string;
    source: string;
    tier: 'premium' | 'free';
    rarity: string;
    fromRarity: string;
    toRarity: string;
    packId: string;
    seasonId: string;
    seasonDay: number;
  };
  count: number;
  users: string[];
  flies: number;
  spent: number;
  received: number;
  items: number;
  revenue: number;
};

type EngagementPropertyRow = {
  _id: {
    name: string;
    key: string;
    value: string | number | boolean;
  };
  count: number;
  users: string[];
};

type QuestObjectiveMixRow = {
  _id: {
    placement: string;
    category: string;
    tier: string;
    type: string;
    action: string;
    tagMode: string;
    metric: string;
    rewardType: string;
  };
  count: number;
  users: string[];
  targets: number;
  flies: number;
  items: number;
};

const ENGAGEMENT_EVENTS = [
  'task_created',
  'task_completed',
  'timer_started',
  'timer_completed',
  'quest_objective_claimed',
  'daily_reward_claimed',
  'season_reward_claimed',
];

const ENGAGEMENT_PROPERTY_KEYS = [
  'task_type', 'tag_count', 'focus_tag_count', 'focus_connected', 'buddy',
  'recurring', 'repeat_mode', 'checklist_count', 'has_schedule', 'has_reminder',
  'streak_tier', 'streak_length', 'phase', 'duration_minutes',
  'focus_duration_minutes', 'break_duration_minutes', 'auto_start_breaks',
  'completed_seconds', 'quest_placement', 'quest_category', 'quest_generation',
  'quest_tier', 'objective_count', 'objective_type', 'objective_subject',
  'objective_action', 'objective_tag_mode', 'objective_metric', 'objective_target',
  'reward_type', 'reward_amount', 'reward_count', 'reward_day',
  'premium_reward_included', 'season_id', 'season_day', 'is_premium', 'count',
];

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const requestedDays = Number(req.nextUrl.searchParams.get('days') ?? 30);
  const now = new Date();
  const today = startOfUtcDay(now);
  const parseDate = (value: string | null) =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? startOfUtcDay(new Date(`${value}T00:00:00.000Z`))
      : null;
  const requestedStart = parseDate(req.nextUrl.searchParams.get('start'));
  const requestedEnd = parseDate(req.nextUrl.searchParams.get('end'));
  const quickDays = VALID_RANGES.has(requestedDays) ? requestedDays : 30;
  const endDay = requestedEnd ?? today;
  const candidateStart = requestedStart ?? addUtcDays(endDay, -(quickDays - 1));
  const rawDays = Math.floor((endDay.getTime() - candidateStart.getTime()) / 86_400_000) + 1;
  const days = rawDays >= 1 && rawDays <= 400 ? rawDays : quickDays;
  const start = rawDays >= 1 && rawDays <= 400
    ? candidateStart
    : addUtcDays(endDay, -(quickDays - 1));
  const endExclusive = addUtcDays(endDay, 1);
  const eventWindow = { $gte: start, $lt: endExclusive };
  const thirtyDaysAgo = addUtcDays(endDay, -29);
  const sevenDaysAgo = addUtcDays(endDay, -6);

  await connectMongo();

  const [
    totalUsers,
    newUsers,
    activePremium,
    eventSummary,
    dailyEvents,
    platformRows,
    adRows,
    sourceRows,
    pageRows,
    userDailyRows,
    cohortUsers,
    firstEvent,
    rollingActiveRows,
    productionFinanceSummary,
    economyRows,
    paywallRows,
    catalogItems,
    engagementPropertyRows,
    questCategories,
    questObjectiveMixRows,
    questSeasons,
    totalFriendships,
    connectedUserRows,
    friendshipsInRange,
    referralsInRange,
    friendRequestsInRange,
    buddyBondsInRange,
    activeBuddyBonds,
    socialEventRows,
    buddyCompletionRows,
  ] = await Promise.all([
    UserModel.countDocuments({}),
    UserModel.countDocuments({ createdAt: eventWindow }),
    UserModel.countDocuments({ premiumUntil: { $gt: now } }),
    AnalyticsEventModel.aggregate<EventSummaryRow>([
      { $match: { occurredAt: eventWindow } },
      { $group: { _id: '$name', count: { $sum: 1 }, users: { $addToSet: '$userId' } } },
      { $sort: { count: -1 } },
    ]),
    AnalyticsEventModel.aggregate<DailyEventRow>([
      { $match: { occurredAt: eventWindow } },
      {
        $group: {
          _id: {
            date: { $dateToString: { date: '$occurredAt', format: '%Y-%m-%d', timezone: 'UTC' } },
            name: '$name',
          },
          count: { $sum: 1 },
          users: { $addToSet: '$userId' },
          sessions: { $addToSet: '$sessionId' },
          revenue: {
            $sum: {
              $cond: [
                { $ne: ['$properties.environment', 'SANDBOX'] },
                { $ifNull: ['$properties.revenue_usd', 0] },
                0,
              ],
            },
          },
          proceeds: {
            $sum: {
              $cond: [
                { $ne: ['$properties.environment', 'SANDBOX'] },
                { $ifNull: ['$properties.proceeds_usd', 0] },
                0,
              ],
            },
          },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]),
    AnalyticsEventModel.aggregate<{ _id: string; users: string[]; count: number }>([
      { $match: { occurredAt: eventWindow } },
      { $group: { _id: '$platform', users: { $addToSet: '$userId' }, count: { $sum: 1 } } },
    ]),
    AnalyticsEventModel.aggregate<{
      _id: { placement: string; name: string };
      count: number;
      users: string[];
    }>([
      { $match: { occurredAt: eventWindow, category: 'ads' } },
      {
        $group: {
          _id: { placement: { $ifNull: ['$properties.placement', 'unknown'] }, name: '$name' },
          count: { $sum: 1 },
          users: { $addToSet: '$userId' },
        },
      },
    ]),
    AnalyticsEventModel.aggregate<{ _id: string; users: string[]; count: number }>([
      { $match: { occurredAt: eventWindow, name: 'app_opened' } },
      {
        $group: {
          _id: { $ifNull: ['$properties.utm_source', 'direct'] },
          users: { $addToSet: '$userId' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ]),
    AnalyticsEventModel.aggregate<{ _id: string; users: string[]; count: number }>([
      { $match: { occurredAt: eventWindow, name: 'page_viewed' } },
      {
        $group: {
          _id: { $ifNull: ['$properties.page', 'unknown'] },
          users: { $addToSet: '$userId' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ]),
    UserModel.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: eventWindow } },
      {
        $group: {
          _id: { $dateToString: { date: '$createdAt', format: '%Y-%m-%d', timezone: 'UTC' } },
          count: { $sum: 1 },
        },
      },
    ]),
    UserModel.find({ createdAt: { $gte: addUtcDays(start, -30), $lt: endExclusive } })
      .select('_id createdAt')
      .lean<Array<{ _id: string; createdAt: Date }>>(),
    AnalyticsEventModel.findOne({}).sort({ occurredAt: 1 }).select('occurredAt').lean(),
    AnalyticsEventModel.aggregate<{ _id: string; users: string[] }>([
      { $match: { occurredAt: { $gte: thirtyDaysAgo, $lt: endExclusive }, userId: { $not: /^anonymous:/ } } },
      {
        $group: {
          _id: { $dateToString: { date: '$occurredAt', format: '%Y-%m-%d', timezone: 'UTC' } },
          users: { $addToSet: '$userId' },
        },
      },
    ]),
    AnalyticsEventModel.aggregate<EventSummaryRow>([
      {
        $match: {
          occurredAt: eventWindow,
          source: 'revenuecat',
          'properties.environment': { $ne: 'SANDBOX' },
        },
      },
      { $group: { _id: '$name', count: { $sum: 1 }, users: { $addToSet: '$userId' } } },
    ]),
    AnalyticsEventModel.aggregate<EconomyRow>([
      {
        $match: {
          occurredAt: eventWindow,
          name: {
            $in: [
              'fly_earned',
              'fly_spent',
              'skin_purchased',
              'skin_sold',
              'skin_traded',
              'season_reward_claimed',
              'fly_shop_viewed',
              'fly_pack_selected',
              'fly_pack_purchase_started',
              'fly_pack_purchase_completed',
              'fly_pack_purchase_cancelled',
              'fly_pack_purchase_failed',
            ],
          },
        },
      },
      {
        $match: {
          $or: [
            { name: { $ne: 'fly_pack_purchase_completed' } },
            { 'properties.environment': { $ne: 'SANDBOX' } },
          ],
        },
      },
      {
        $group: {
          _id: {
            name: '$name',
            source: { $ifNull: ['$properties.source', 'unknown'] },
            tier: { $cond: ['$properties.is_premium', 'premium', 'free'] },
            rarity: { $ifNull: ['$properties.rarity', 'unknown'] },
            fromRarity: { $ifNull: ['$properties.from_rarity', 'unknown'] },
            toRarity: { $ifNull: ['$properties.to_rarity', 'unknown'] },
            packId: { $ifNull: ['$properties.pack_id', 'unknown'] },
            seasonId: { $ifNull: ['$properties.season_id', 'unknown'] },
            seasonDay: { $ifNull: ['$properties.season_day', 0] },
          },
          count: { $sum: 1 },
          users: { $addToSet: '$userId' },
          flies: { $sum: { $ifNull: ['$properties.fly_amount', 0] } },
          spent: { $sum: { $ifNull: ['$properties.flies_spent', 0] } },
          received: { $sum: { $ifNull: ['$properties.flies_received', 0] } },
          items: { $sum: { $ifNull: ['$properties.item_count', 0] } },
          revenue: {
            $sum: {
              $cond: [
                { $ne: ['$properties.environment', 'SANDBOX'] },
                { $ifNull: ['$properties.revenue_usd', { $ifNull: ['$properties.price_usd', 0] }] },
                0,
              ],
            },
          },
        },
      },
    ]),
    AnalyticsEventModel.aggregate<{
      _id: { placement: string; name: string; step: number };
      count: number;
      users: string[];
    }>([
      {
        $match: {
          occurredAt: eventWindow,
          source: 'client',
          name: { $in: ['paywall_viewed', 'paywall_step_viewed', 'purchase_started', 'purchase_completed', 'purchase_cancelled', 'purchase_failed'] },
        },
      },
      {
        $group: {
          _id: {
            placement: { $ifNull: ['$properties.placement', 'unknown'] },
            name: '$name',
            step: { $ifNull: ['$properties.step', 0] },
          },
          count: { $sum: 1 },
          users: { $addToSet: '$userId' },
        },
      },
    ]),
    getPrizePool(),
    AnalyticsEventModel.aggregate<EngagementPropertyRow>([
      {
        $match: {
          occurredAt: eventWindow,
          name: { $in: ENGAGEMENT_EVENTS },
        },
      },
      {
        $project: {
          name: 1,
          userId: 1,
          property: { $objectToArray: { $ifNull: ['$properties', {}] } },
        },
      },
      { $unwind: '$property' },
      { $match: { 'property.k': { $in: ENGAGEMENT_PROPERTY_KEYS } } },
      {
        $group: {
          _id: { name: '$name', key: '$property.k', value: '$property.v' },
          count: { $sum: 1 },
          users: { $addToSet: '$userId' },
        },
      },
      { $sort: { count: -1 } },
    ]),
    QuestCategoryModel.find({}).select('categoryId name shortLabel').lean(),
    AnalyticsEventModel.aggregate<QuestObjectiveMixRow>([
      { $match: { occurredAt: eventWindow, name: 'quest_objective_claimed' } },
      {
        $group: {
          _id: {
            placement: { $ifNull: ['$properties.quest_placement', 'unknown'] },
            category: { $ifNull: ['$properties.quest_category', 'uncategorized'] },
            tier: { $toString: { $ifNull: ['$properties.quest_tier', 'not_applicable'] } },
            type: { $ifNull: ['$properties.objective_type', 'unknown'] },
            action: { $ifNull: ['$properties.objective_action', 'none'] },
            tagMode: { $ifNull: ['$properties.objective_tag_mode', 'ignore'] },
            metric: { $ifNull: ['$properties.objective_metric', 'none'] },
            rewardType: { $ifNull: ['$properties.reward_type', 'unknown'] },
          },
          count: { $sum: 1 },
          users: { $addToSet: '$userId' },
          targets: { $sum: { $ifNull: ['$properties.objective_target', 0] } },
          flies: { $sum: { $ifNull: ['$properties.reward_amount', 0] } },
          items: { $sum: { $ifNull: ['$properties.reward_count', 0] } },
        },
      },
      { $sort: { count: -1 } },
    ]),
    QuestSeasonModel.find({}).select('seasonId name startsAt endsAt').lean(),
    FriendshipModel.countDocuments({}),
    FriendshipModel.aggregate<{ _id: null; users: string[] }>([
      { $project: { users: ['$userA', '$userB'] } },
      { $unwind: '$users' },
      { $group: { _id: null, users: { $addToSet: '$users' } } },
    ]),
    FriendshipModel.find({ createdAt: eventWindow }).select('userA userB source createdAt').lean(),
    ReferralModel.find({ createdAt: eventWindow }).select('inviterId giftOptionId buddyTask claimedByUserId claimedAt createdAt').lean(),
    FriendRequestModel.find({ createdAt: eventWindow }).select('fromUserId toUserId source status createdAt respondedAt').lean(),
    TaskBondModel.find({
      $or: [
        { createdAt: eventWindow },
        { completedFrom: { $elemMatch: { $gte: ymd(start), $lte: ymd(endDay) } } },
        { completedTo: { $elemMatch: { $gte: ymd(start), $lte: ymd(endDay) } } },
        { bonusAwardedDates: { $elemMatch: { $gte: ymd(start), $lte: ymd(endDay) } } },
      ],
    }).select('status repeatLabel streak completedFrom completedTo bonusAwardedDates createdAt updatedAt').lean(),
    TaskBondModel.countDocuments({ status: 'active' }),
    AnalyticsEventModel.aggregate<{
      _id: { name: string; method: string; surface: string; source: string };
      count: number;
      users: string[];
    }>([
      { $match: { occurredAt: eventWindow, category: 'social' } },
      {
        $group: {
          _id: {
            name: '$name',
            method: { $ifNull: ['$properties.method', 'unknown'] },
            surface: { $ifNull: ['$properties.share_surface', 'unknown'] },
            source: { $ifNull: ['$properties.request_source', { $ifNull: ['$properties.source', 'unknown'] }] },
          },
          count: { $sum: 1 },
          users: { $addToSet: '$userId' },
        },
      },
    ]),
    AnalyticsEventModel.aggregate<{ _id: null; count: number; users: string[] }>([
      { $match: { occurredAt: eventWindow, name: 'task_completed', 'properties.buddy': true } },
      { $group: { _id: null, count: { $sum: 1 }, users: { $addToSet: '$userId' } } },
    ]),
  ]);

  const cohortIds = cohortUsers.map((user) => String(user._id));
  const retentionEvents = cohortIds.length
    ? await AnalyticsEventModel.find({
        userId: { $in: cohortIds },
        name: RETENTION_EVENT,
        occurredAt: { $gte: addUtcDays(start, -30), $lt: endExclusive },
      })
        .select('userId occurredAt')
        .lean<Array<{ userId: string; occurredAt: Date }>>()
    : [];
  const selectedCohortIds = cohortUsers
    .filter((user) => new Date(user.createdAt) >= start && new Date(user.createdAt) < endExclusive)
    .map((user) => String(user._id));
  const cohortMilestoneRows = selectedCohortIds.length
    ? await AnalyticsEventModel.aggregate<{ _id: string; users: string[] }>([
        {
          $match: {
            userId: { $in: selectedCohortIds },
            occurredAt: eventWindow,
            name: {
              $in: [
                'onboarding_completed',
                'task_created',
                'task_completed',
                'timer_started',
              ],
            },
          },
        },
        { $group: { _id: '$name', users: { $addToSet: '$userId' } } },
      ])
    : [];
  const cohortMilestones = new Map(
    cohortMilestoneRows.map((row) => [row._id, row.users.length]),
  );

  const summary = new Map(
    eventSummary.map((row) => [row._id, { events: row.count, users: row.users.length }]),
  );
  const metric = (name: string) => summary.get(name) ?? { events: 0, users: 0 };
  const financeSummary = new Map(
    productionFinanceSummary.map((row) => [row._id, { events: row.count, users: row.users.length }]),
  );
  const financeMetric = (name: string) => financeSummary.get(name) ?? { events: 0, users: 0 };

  const dailyMap = new Map<string, {
    active: Set<string>;
    sessions: Set<string>;
    taskCompleted: number;
    timerCompleted: number;
    revenue: number;
    proceeds: number;
  }>();
  for (let i = 0; i < days; i += 1) {
    dailyMap.set(ymd(addUtcDays(start, i)), {
      active: new Set(),
      sessions: new Set(),
      taskCompleted: 0,
      timerCompleted: 0,
      revenue: 0,
      proceeds: 0,
    });
  }
  for (const row of dailyEvents) {
    const item = dailyMap.get(row._id.date);
    if (!item) continue;
    row.users.filter((id) => !id.startsWith('anonymous:')).forEach((id) => item.active.add(id));
    if (row._id.name === 'app_opened') {
      row.sessions.filter(Boolean).forEach((id) => item.sessions.add(id));
    }
    if (row._id.name === 'task_completed') item.taskCompleted += row.count;
    if (row._id.name === 'timer_completed') item.timerCompleted += row.count;
    if (['subscription_started', 'subscription_renewed', 'subscription_refunded', 'purchase_completed'].includes(row._id.name)) {
      item.revenue += row.revenue;
      item.proceeds += row.proceeds;
    }
  }
  const newUsersByDate = new Map(userDailyRows.map((row) => [row._id, row.count]));
  const series = Array.from(dailyMap, ([date, item]) => ({
    date,
    activeUsers: item.active.size,
    sessions: item.sessions.size,
    newUsers: newUsersByDate.get(date) ?? 0,
    tasksCompleted: item.taskCompleted,
    timersCompleted: item.timerCompleted,
    revenue: round(item.revenue, 2),
    proceeds: round(item.proceeds, 2),
  }));

  const activeSince = (date: Date) => {
    const ids = new Set<string>();
    for (const row of rollingActiveRows) {
      if (row._id >= ymd(date)) row.users.forEach((id) => ids.add(id));
    }
    return ids.size;
  };
  const dau = activeSince(endDay);
  const wau = activeSince(sevenDaysAgo);
  const mau = activeSince(thirtyDaysAgo);
  const periodActiveUsers = new Set(
    dailyEvents.flatMap((row) => row.users.filter((id) => !id.startsWith('anonymous:'))),
  ).size;

  const activeDatesByUser = new Map<string, Set<string>>();
  for (const event of retentionEvents) {
    const dates = activeDatesByUser.get(event.userId) ?? new Set<string>();
    dates.add(ymd(event.occurredAt));
    activeDatesByUser.set(event.userId, dates);
  }
  const retention = [1, 7, 30].map((offset) => {
    const eligible = cohortUsers.filter((user) => {
      const created = startOfUtcDay(new Date(user.createdAt));
      return created >= start && addUtcDays(created, offset) <= endDay;
    });
    const retained = eligible.filter((user) => {
      const returnDate = ymd(addUtcDays(startOfUtcDay(new Date(user.createdAt)), offset));
      return activeDatesByUser.get(String(user._id))?.has(returnDate);
    }).length;
    return {
      day: offset,
      eligible: eligible.length,
      retained,
      rate: eligible.length ? round((retained / eligible.length) * 100) : 0,
    };
  });

  const funnel = [
    { key: 'accounts', label: 'New accounts', users: newUsers },
    { key: 'onboarding', label: 'Onboarding completed', users: cohortMilestones.get('onboarding_completed') ?? 0 },
    { key: 'task_created', label: 'Created a task', users: cohortMilestones.get('task_created') ?? 0 },
    { key: 'task_completed', label: 'Completed a task', users: cohortMilestones.get('task_completed') ?? 0 },
    { key: 'timer_started', label: 'Started a focus timer', users: cohortMilestones.get('timer_started') ?? 0 },
  ].map((step, index, all) => ({
    ...step,
    rate: index === 0
      ? 100
      : all[index - 1].users
        ? round((step.users / all[index - 1].users) * 100)
        : 0,
  }));

  const adPlacements = new Map<string, Record<string, number>>();
  for (const row of adRows) {
    const placement = row._id.placement || 'unknown';
    const values = adPlacements.get(placement) ?? {};
    values[row._id.name] = row.count;
    adPlacements.set(placement, values);
  }
  const ads = Array.from(adPlacements, ([placement, values]) => {
    const requested = values.ad_requested ?? 0;
    const completed = values.ad_completed ?? 0;
    return {
      placement,
      requested,
      impressions: values.ad_impression ?? 0,
      completed,
      dismissed: values.ad_dismissed ?? 0,
      failed: values.ad_failed ?? 0,
      completionRate: requested ? round((completed / requested) * 100) : 0,
    };
  }).sort((a, b) => b.requested - a.requested);

  const productionFinanceRows = dailyEvents.filter((row) =>
    ['subscription_started', 'subscription_renewed', 'subscription_refunded', 'purchase_completed'].includes(row._id.name),
  );
  const grossRevenue = productionFinanceRows.reduce((sum, row) => sum + row.revenue, 0);
  const proceeds = productionFinanceRows.reduce((sum, row) => sum + row.proceeds, 0);

  const flyEarningRows = economyRows.filter(
    (row) => row._id.name === 'fly_earned' && row._id.source !== 'real_money_pack',
  );
  const earningTier = (tier: 'free' | 'premium') => {
    const rows = flyEarningRows.filter((row) => row._id.tier === tier);
    const users = new Set(rows.flatMap((row) => row.users));
    const flies = rows.reduce((sum, row) => sum + row.flies, 0);
    const events = rows.reduce((sum, row) => sum + row.count, 0);
    return {
      flies,
      events,
      users: users.size,
      averagePerUser: users.size ? round(flies / users.size) : 0,
      averagePerEvent: events ? round(flies / events) : 0,
    };
  };
  const totalGameplayFlies = flyEarningRows.reduce((sum, row) => sum + row.flies, 0);
  const flySources = Array.from(new Set(flyEarningRows.map((row) => row._id.source)))
    .map((source) => {
      const rows = flyEarningRows.filter((row) => row._id.source === source);
      const userIds = new Set(rows.flatMap((row) => row.users));
      const flies = rows.reduce((sum, row) => sum + row.flies, 0);
      const events = rows.reduce((sum, row) => sum + row.count, 0);
      return {
        source,
        flies,
        events,
        users: userIds.size,
        averagePerEvent: events ? round(flies / events) : 0,
        averagePerUser: userIds.size ? round(flies / userIds.size) : 0,
        shareOfFlies: totalGameplayFlies ? round((flies / totalGameplayFlies) * 100) : 0,
        tiers: rows.map((row) => ({
          tier: row._id.tier,
          flies: row.flies,
          events: row.count,
          users: row.users.length,
          averagePerEvent: row.count ? round(row.flies / row.count) : 0,
          averagePerUser: row.users.length ? round(row.flies / row.users.length) : 0,
        })),
      };
    })
    .sort((a, b) => b.flies - a.flies);
  const flySpendingRows = economyRows.filter((row) => row._id.name === 'fly_spent');
  const flySpending = {
    total: flySpendingRows.reduce((sum, row) => sum + row.flies, 0),
    sources: flySpendingRows.map((row) => ({
      source: row._id.source,
      tier: row._id.tier,
      flies: row.flies,
      events: row.count,
      users: row.users.length,
      averagePerUser: row.users.length ? round(row.flies / row.users.length) : 0,
    })).sort((a, b) => b.flies - a.flies),
  };
  const skinRows = economyRows.filter((row) =>
    ['skin_purchased', 'skin_sold'].includes(row._id.name),
  ).map((row) => ({
    action: row._id.name === 'skin_purchased' ? 'purchased' : 'sold',
    rarity: row._id.rarity,
    tier: row._id.tier,
    transactions: row.count,
    users: row.users.length,
    items: row.items || row.count,
    flies: row._id.name === 'skin_purchased' ? row.spent : row.received,
  })).sort((a, b) => b.transactions - a.transactions);
  const tradeRows = economyRows.filter((row) => row._id.name === 'skin_traded').map((row) => ({
    tier: row._id.tier,
    fromRarity: row._id.fromRarity,
    toRarity: row._id.toRarity,
    trades: row.count,
    users: row.users.length,
    itemsConsumed: row.items,
    averagePerTrader: row.users.length ? round(row.count / row.users.length) : 0,
  }));
  const seasonNames = new Map(
    questSeasons.map((season) => [String(season.seasonId), String(season.name || season.seasonId)]),
  );
  const seasonRows = economyRows.filter((row) => row._id.name === 'season_reward_claimed').map((row) => ({
    seasonId: row._id.seasonId,
    seasonName: seasonNames.get(row._id.seasonId) ?? row._id.seasonId,
    day: row._id.seasonDay,
    tier: row._id.tier,
    claims: row.count,
    users: row.users.length,
    flies: row.flies,
    items: row.items,
    averageFlies: row.count ? round(row.flies / row.count) : 0,
  }));

  const categoryNames = new Map(
    questCategories.map((category) => [
      String(category.categoryId),
      String(category.shortLabel || category.name || category.categoryId),
    ]),
  );
  const questObjectiveMix = questObjectiveMixRows.map((row) => ({
    placement: row._id.placement,
    category: categoryNames.get(row._id.category) ?? row._id.category,
    tier: row._id.tier,
    objectiveType: row._id.type,
    action: row._id.action,
    tagMode: row._id.tagMode,
    metric: row._id.metric,
    rewardType: row._id.rewardType,
    claims: row.count,
    users: row.users.length,
    averageTarget: row.count ? round(row.targets / row.count, 2) : 0,
    averageFlies: row.count ? round(row.flies / row.count, 2) : 0,
    averageItems: row.count ? round(row.items / row.count, 2) : 0,
  }));

  const connectedUsers = connectedUserRows[0]?.users.length ?? 0;
  const referralClaims = referralsInRange.filter((referral) => !!referral.claimedByUserId).length;
  const referralInviters = new Set(referralsInRange.map((referral) => referral.inviterId)).size;
  const socialMetric = (name: string) => {
    const rows = socialEventRows.filter((row) => row._id.name === name);
    return {
      events: rows.reduce((sum, row) => sum + row.count, 0),
      users: new Set(rows.flatMap((row) => row.users)).size,
    };
  };
  const shareMethods = socialEventRows
    .filter((row) => ['referral_invite_shared', 'friend_link_shared'].includes(row._id.name))
    .map((row) => ({
      kind: row._id.name === 'referral_invite_shared' ? 'Referral invite' : 'Friend link',
      surface: row._id.surface,
      method: row._id.method,
      shares: row.count,
      users: row.users.length,
    }))
    .sort((a, b) => b.shares - a.shares);
  const friendshipSources = Array.from(new Set(friendshipsInRange.map((friendship) => friendship.source))).map((source) => ({
    source,
    friendships: friendshipsInRange.filter((friendship) => friendship.source === source).length,
  })).sort((a, b) => b.friendships - a.friendships);
  const requestSources = Array.from(new Set(friendRequestsInRange.map((request) => request.source))).map((source) => {
    const rows = friendRequestsInRange.filter((request) => request.source === source);
    const accepted = rows.filter((request) => request.status === 'accepted').length;
    const declined = rows.filter((request) => request.status === 'declined').length;
    const responseHours = rows
      .filter((request) => request.respondedAt)
      .map((request) => (new Date(request.respondedAt!).getTime() - new Date(request.createdAt).getTime()) / 3_600_000);
    return {
      source,
      sent: rows.length,
      accepted,
      declined,
      pending: rows.length - accepted - declined,
      acceptanceRate: rows.length ? round((accepted / rows.length) * 100) : 0,
      averageResponseHours: responseHours.length ? round(responseHours.reduce((sum, value) => sum + value, 0) / responseHours.length, 1) : 0,
    };
  }).sort((a, b) => b.sent - a.sent);
  const periodBuddyBonds = buddyBondsInRange.filter(
    (bond) => new Date(bond.createdAt) >= start && new Date(bond.createdAt) < endExclusive,
  );
  const buddyAccepted = periodBuddyBonds.filter((bond) => ['active', 'severed'].includes(bond.status)).length;
  const buddyDeclined = periodBuddyBonds.filter((bond) => bond.status === 'declined').length;
  const buddySchedules = Array.from(new Set(periodBuddyBonds.map((bond) => bond.repeatLabel || 'unknown'))).map((schedule) => {
    const rows = periodBuddyBonds.filter((bond) => (bond.repeatLabel || 'unknown') === schedule);
    return {
      schedule,
      invites: rows.length,
      accepted: rows.filter((bond) => ['active', 'severed'].includes(bond.status)).length,
      declined: rows.filter((bond) => bond.status === 'declined').length,
      pending: rows.filter((bond) => bond.status === 'pending').length,
      averageStreak: rows.length ? round(rows.reduce((sum, bond) => sum + (bond.streak?.count ?? 0), 0) / rows.length, 1) : 0,
    };
  }).sort((a, b) => b.invites - a.invites);
  const inSelectedDates = (date: string) => date >= ymd(start) && date <= ymd(endDay);
  const bothCompletedDays = buddyBondsInRange.reduce(
    (sum, bond) => sum + (bond.bonusAwardedDates ?? []).filter(inSelectedDates).length,
    0,
  );
  const friendRewardRows = flyEarningRows.filter((row) => ['friend_activity', 'friend_reward_double'].includes(row._id.source));
  const friendRewardUsers = new Set(friendRewardRows.flatMap((row) => row.users));
  const friendRewardFlies = friendRewardRows.reduce((sum, row) => sum + row.flies, 0);
  const friendRewardActions = friendRewardRows.reduce((sum, row) => sum + row.count, 0);
  const buddyCompletions = buddyCompletionRows[0] ?? { count: 0, users: [] };
  const friendsAnalytics = {
    network: {
      totalFriendships,
      connectedUsers,
      averageFriends: connectedUsers ? round((totalFriendships * 2) / connectedUsers, 1) : 0,
      newFriendships: friendshipsInRange.length,
      sources: friendshipSources,
    },
    referrals: {
      created: referralsInRange.length,
      inviters: referralInviters,
      withBuddyTask: referralsInRange.filter((referral) => !!referral.buddyTask).length,
      shared: socialMetric('referral_invite_shared'),
      opened: socialMetric('referral_invite_opened'),
      claimed: referralClaims,
      conversionRate: referralsInRange.length ? round((referralClaims / referralsInRange.length) * 100) : 0,
      byGift: Array.from(new Set(referralsInRange.map((referral) => referral.giftOptionId || 'unknown'))).map((giftOption) => {
        const rows = referralsInRange.filter((referral) => (referral.giftOptionId || 'unknown') === giftOption);
        return { giftOption, created: rows.length, claimed: rows.filter((referral) => !!referral.claimedByUserId).length };
      }),
    },
    shareMethods,
    friendRequests: requestSources,
    buddies: {
      active: activeBuddyBonds,
      invites: periodBuddyBonds.length,
      accepted: buddyAccepted,
      declined: buddyDeclined,
      pending: periodBuddyBonds.filter((bond) => bond.status === 'pending').length,
      acceptanceRate: periodBuddyBonds.length ? round((buddyAccepted / periodBuddyBonds.length) * 100) : 0,
      taskCompletions: buddyCompletions.count,
      completers: buddyCompletions.users.length,
      bothCompletedDays,
      schedules: buddySchedules,
    },
    rewards: {
      flies: friendRewardFlies,
      actions: friendRewardActions,
      users: friendRewardUsers.size,
      averagePerUser: friendRewardUsers.size ? round(friendRewardFlies / friendRewardUsers.size) : 0,
    },
  };
  const propertyLabels: Record<string, string> = {
    task_type: 'Task type', tag_count: 'Tags per task', focus_tag_count: 'Focus tags per task',
    focus_connected: 'Connected to a focus', buddy: 'Buddy task', recurring: 'Repeated task',
    repeat_mode: 'Repeat mode', checklist_count: 'Checklist items per task',
    has_schedule: 'Scheduled time', has_reminder: 'Reminder enabled', streak_tier: 'Streak tier',
    streak_length: 'Streak length', phase: 'Timer phase', duration_minutes: 'Duration (minutes)',
    focus_duration_minutes: 'Focus duration (minutes)', break_duration_minutes: 'Break duration (minutes)',
    auto_start_breaks: 'Auto-start breaks', completed_seconds: 'Completed seconds',
    quest_placement: 'Quest area', quest_category: 'Quest category', quest_generation: 'Quest source',
    quest_tier: 'Generated tier', objective_count: 'Objectives per quest', objective_type: 'Objective type',
    objective_subject: 'Objective subject', objective_action: 'Objective action',
    objective_tag_mode: 'Objective tag scope', objective_metric: 'Objective metric',
    objective_target: 'Objective target', reward_type: 'Prize type', reward_amount: 'Flies awarded',
    reward_count: 'Items awarded', reward_day: 'Login calendar day',
    premium_reward_included: 'Plus reward included', season_id: 'Season', season_day: 'Season day',
    is_premium: 'Account tier', count: 'Tasks created per action',
  };
  const averageKeys = new Set([
    'tag_count', 'focus_tag_count', 'checklist_count', 'streak_length', 'duration_minutes',
    'focus_duration_minutes', 'break_duration_minutes', 'completed_seconds', 'objective_count',
    'objective_target', 'reward_amount', 'reward_count', 'count',
  ]);
  const numericDimensionKeys = new Set(['quest_tier', 'reward_day', 'season_day']);
  type DimensionBuilder = { key: string; label: string; rows: Array<{ value: string; events: number; users: number; share: number }> };
  type AverageBuilder = { key: string; label: string; weightedTotal: number; samples: number };
  const breakdownBuilders = new Map<string, {
    dimensions: Map<string, DimensionBuilder>;
    averages: Map<string, AverageBuilder>;
  }>();

  for (const row of engagementPropertyRows) {
    const { name, key } = row._id;
    const rawValue = row._id.value;
    const builder = breakdownBuilders.get(name) ?? {
      dimensions: new Map<string, DimensionBuilder>(),
      averages: new Map<string, AverageBuilder>(),
    };
    breakdownBuilders.set(name, builder);

    if (typeof rawValue === 'number' && averageKeys.has(key)) {
      const average = builder.averages.get(key) ?? {
        key,
        label: propertyLabels[key] ?? key,
        weightedTotal: 0,
        samples: 0,
      };
      average.weightedTotal += rawValue * row.count;
      average.samples += row.count;
      builder.averages.set(key, average);
    }

    if (!averageKeys.has(key) || numericDimensionKeys.has(key)) {
      const dimension = builder.dimensions.get(key) ?? {
        key,
        label: propertyLabels[key] ?? key,
        rows: [],
      };
      let value = String(rawValue);
      if (key === 'quest_category') value = categoryNames.get(value) ?? value;
      if (key === 'season_id') value = seasonNames.get(value) ?? value;
      if (key === 'is_premium') value = rawValue ? 'Plus' : 'Free';
      if (typeof rawValue === 'boolean' && key !== 'is_premium') value = rawValue ? 'Yes' : 'No';
      const eventTotal = metric(name).events;
      dimension.rows.push({
        value,
        events: row.count,
        users: row.users.filter(Boolean).length,
        share: eventTotal ? round((row.count / eventTotal) * 100) : 0,
      });
      builder.dimensions.set(key, dimension);
    }
  }

  const engagementBreakdowns = Object.fromEntries(
    Array.from(breakdownBuilders, ([name, builder]) => [
      name,
      {
        averages: Array.from(builder.averages.values()).map((average) => ({
          key: average.key,
          label: average.label,
          average: average.samples ? round(average.weightedTotal / average.samples, 2) : 0,
          total: round(average.weightedTotal, 2),
          samples: average.samples,
        })),
        dimensions: Array.from(builder.dimensions.values()),
      },
    ]),
  );
  const packRows = economyRows.filter((row) =>
    row._id.name.startsWith('fly_pack_'),
  ).map((row) => ({
    packId: row._id.packId,
    stage: row._id.name.replace('fly_pack_', ''),
    events: row.count,
    users: row.users.length,
    flies: row.flies,
    revenue: row._id.name === 'fly_pack_purchase_completed' ? round(row.revenue, 2) : 0,
  }));

  const tryFunnel = [
    ['try_funnel_viewed', 'Landing viewed'],
    ['try_task_completed', 'Demo task completed'],
    ['try_gift_opened', 'Gift opened'],
    ['try_signin_started', 'Sign-in started'],
    ['try_signup_completed', 'Sign-up completed'],
    ['try_gift_claimed', 'Gift claimed'],
    ['try_continued', 'Continued into app'],
  ].map(([name, label]) => ({
    key: name,
    label,
    users: metric(name).users,
    events: metric(name).events,
  }));
  const placementMap = new Map<string, {
    events: Record<string, { events: number; users: number }>;
    steps: Map<number, { events: number; users: number }>;
  }>();
  for (const row of paywallRows) {
    const values = placementMap.get(row._id.placement) ?? {
      events: {} as Record<string, { events: number; users: number }>,
      steps: new Map<number, { events: number; users: number }>(),
    };
    if (row._id.name === 'paywall_step_viewed') {
      values.steps.set(row._id.step, { events: row.count, users: row.users.length });
    } else {
      values.events[row._id.name] = { events: row.count, users: row.users.length };
    }
    placementMap.set(row._id.placement, values);
  }
  const paywallPlacements = Array.from(placementMap, ([placement, values]) => {
    const views = values.events.paywall_viewed ?? { events: 0, users: 0 };
    const starts = values.events.purchase_started ?? { events: 0, users: 0 };
    const completed = values.events.purchase_completed ?? { events: 0, users: 0 };
    const stepLabels = ['Intro', 'Benefits', 'Trial reminder', 'Plan selection'];
    const steps = stepLabels.map((label, index) => {
      const recorded = values.steps.get(index + 1);
      const reached = index === 0 && !recorded ? views : recorded ?? { events: 0, users: 0 };
      const previous = index === 0
        ? views.users
        : (values.steps.get(index)?.users ?? (index === 1 ? views.users : 0));
      return {
        step: index + 1,
        label,
        events: reached.events,
        users: reached.users,
        reachRate: views.users ? round((reached.users / views.users) * 100) : 0,
        stepConversion: previous ? round((reached.users / previous) * 100) : 0,
      };
    });
    return {
      placement,
      views: views.events,
      viewers: views.users,
      starts: starts.events,
      completed: completed.events,
      cancelled: values.events.purchase_cancelled?.events ?? 0,
      failed: values.events.purchase_failed?.events ?? 0,
      startRate: views.users ? round((starts.users / views.users) * 100) : 0,
      conversionRate: views.users ? round((completed.users / views.users) * 100) : 0,
      steps,
    };
  }).sort((a, b) => b.views - a.views);
  const catalogRarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'].map((rarity) => {
    const items = catalogItems.filter((item) => item.rarity === rarity && item.slot !== 'container');
    const prices = items.map((item) => item.priceFlies ?? 0).filter((price) => price > 0);
    return {
      rarity,
      items: items.length,
      averagePrice: prices.length ? round(prices.reduce((sum, price) => sum + price, 0) / prices.length) : 0,
      minimumPrice: prices.length ? Math.min(...prices) : 0,
      maximumPrice: prices.length ? Math.max(...prices) : 0,
    };
  });

  return NextResponse.json({
    range: { days, start: ymd(start), end: ymd(endDay) },
    coverage: {
      firstEventAt: firstEvent?.occurredAt ?? null,
      retentionDays: 400,
      timezone: 'UTC',
    },
    overview: {
      totalUsers,
      newUsers,
      activePremium,
      activeUsers: periodActiveUsers,
      dau,
      wau,
      mau,
      stickiness: mau ? round((dau / mau) * 100) : 0,
      sessions: metric('app_opened').events,
      tasksCompleted: metric('task_completed').events,
    },
    series,
    retention,
    funnel,
    events: eventSummary
      .filter((row) => row._id !== 'quest_reward_claimed')
      .map((row) => ({ name: row._id, events: row.count, users: row.users.length })),
    platforms: platformRows
      .map((row) => ({ platform: row._id || 'unknown', users: row.users.length, events: row.count }))
      .sort((a, b) => b.users - a.users),
    sources: sourceRows.map((row) => ({ source: row._id || 'direct', users: row.users.length, sessions: row.count })),
    pages: pageRows.map((row) => ({ page: row._id || 'unknown', users: row.users.length, views: row.count })),
    engagement: {
      tasksCreated: metric('task_created'),
      tasksCompleted: metric('task_completed'),
      timersStarted: metric('timer_started'),
      timersCompleted: metric('timer_completed'),
      questObjectives: metric('quest_objective_claimed'),
      questObjectiveMix,
      dailyRewards: metric('daily_reward_claimed'),
      seasonRewards: metric('season_reward_claimed'),
    },
    engagementBreakdowns,
    friends: friendsAnalytics,
    monetization: {
      paywallViews: metric('paywall_viewed').events,
      paywallViewers: metric('paywall_viewed').users,
      purchaseStarts: metric('purchase_started').events,
      purchaseStartUsers: metric('purchase_started').users,
      purchaseCompletions: metric('purchase_completed').events,
      purchaseCompletionUsers: metric('purchase_completed').users,
      purchaseConversion: metric('purchase_started').users
        ? round((metric('purchase_completed').users / metric('purchase_started').users) * 100)
        : 0,
      subscriptionsStarted: financeMetric('subscription_started').events,
      renewals: financeMetric('subscription_renewed').events,
      cancellations: financeMetric('subscription_cancelled').events,
      expirations: financeMetric('subscription_expired').events,
      billingIssues: financeMetric('subscription_billing_issue').events,
      refunds: financeMetric('subscription_refunded').events,
      grossRevenue: round(grossRevenue, 2),
      estimatedProceeds: round(proceeds, 2),
    },
    ads,
    economy: {
      flyEarning: { free: earningTier('free'), premium: earningTier('premium') },
      flySources,
      flySpending,
      catalogRarities,
      skins: skinRows,
      trades: tradeRows,
      seasons: seasonRows,
      flyShop: {
        views: metric('fly_shop_viewed'),
        packs: packRows,
        completedPurchases: financeMetric('fly_pack_purchase_completed').events,
        revenue: round(
          economyRows
            .filter((row) => row._id.name === 'fly_pack_purchase_completed')
            .reduce((sum, row) => sum + row.revenue, 0),
          2,
        ),
      },
    },
    tryFunnel,
    paywallPlacements,
  });
}
