import { NextRequest, NextResponse } from 'next/server';
import type { PipelineStage } from 'mongoose';
import { requireAdmin } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import AnalyticsEventModel from '@/lib/models/AnalyticsEvent';
import FriendshipModel from '@/lib/models/Friendship';
import UserModel from '@/lib/models/User';
import { addUtcDays, resolveRange, ymd } from '@/lib/analytics/report/context';
import { toCsv } from '@/lib/analytics/export';

export const dynamic = 'force-dynamic';

const EVENT_SORTS = new Set([
  'events',
  'active_days',
  'tasks_created',
  'tasks_completed',
  'quest_claims',
  'focus_sessions',
  'purchases',
  'flies_earned',
  'flies_spent',
  'last_seen',
]);
const PROFILE_SORTS = new Set(['created_at', 'flies', 'streak', 'name']);

export const USER_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'user_id', label: 'User ID' },
  { key: 'created_at', label: 'Signed up' },
  { key: 'tier', label: 'Tier' },
  { key: 'platform', label: 'Platform' },
  { key: 'last_seen', label: 'Last seen' },
  { key: 'active_days', label: 'Active days' },
  { key: 'events', label: 'Events' },
  { key: 'tasks_created', label: 'Tasks created' },
  { key: 'tasks_completed', label: 'Tasks done' },
  { key: 'quest_claims', label: 'Quest claims' },
  { key: 'focus_sessions', label: 'Focus sessions' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'flies_earned', label: 'Flies earned' },
  { key: 'flies_spent', label: 'Flies spent' },
  { key: 'flies', label: 'Fly balance' },
  { key: 'streak', label: 'Login streak' },
  { key: 'friends', label: 'Friends' },
];

type EventAggregate = {
  _id: string;
  events: number;
  active_days: number;
  last_seen: Date;
  platform: string;
  tasks_created: number;
  tasks_completed: number;
  quest_claims: number;
  focus_sessions: number;
  purchases: number;
  flies_earned: number;
  flies_spent: number;
};

function countIf(name: string) {
  return { $sum: { $cond: [{ $eq: ['$name', name] }, 1, 0] } };
}

function sumProperty(name: string, property: string) {
  return {
    $sum: {
      $cond: [{ $eq: ['$name', name] }, { $ifNull: [`$properties.${property}`, 0] }, 0],
    },
  };
}

function eventGroupStage(): PipelineStage.Group {
  return {
    $group: {
      _id: '$userId',
      events: { $sum: 1 },
      dates: {
        $addToSet: { $dateToString: { date: '$occurredAt', format: '%Y-%m-%d', timezone: 'UTC' } },
      },
      last_seen: { $max: '$occurredAt' },
      platform: { $last: '$platform' },
      tasks_created: countIf('task_created'),
      tasks_completed: countIf('task_completed'),
      quest_claims: countIf('quest_objective_claimed'),
      focus_sessions: countIf('timer_started'),
      purchases: countIf('skin_purchased'),
      flies_earned: sumProperty('fly_earned', 'fly_amount'),
      flies_spent: sumProperty('fly_spent', 'fly_amount'),
    },
  };
}

const EVENT_PROJECT: PipelineStage.Project = {
  $project: {
    events: 1,
    last_seen: 1,
    platform: 1,
    tasks_created: 1,
    tasks_completed: 1,
    quest_claims: 1,
    focus_sessions: 1,
    purchases: 1,
    flies_earned: 1,
    flies_spent: 1,
    active_days: { $size: '$dates' },
  },
};

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const range = resolveRange({
    start: params.get('start'),
    end: params.get('end'),
    days: params.get('days') ? Number(params.get('days')) : null,
  });
  const window = { $gte: range.start, $lt: range.endExclusive };

  const search = (params.get('q') ?? '').trim();
  const tier = params.get('tier') ?? 'any';
  const segment = params.get('segment') ?? 'any';
  const platform = params.get('platform') ?? 'any';
  const format = params.get('format') ?? 'json';
  const sort = params.get('sort') ?? 'last_seen';
  const direction = params.get('dir') === 'asc' ? 1 : -1;
  const limit = format === 'csv' ? 5000 : Math.min(200, Math.max(10, Number(params.get('limit') ?? 50)));
  const page = Math.max(1, Number(params.get('page') ?? 1));
  const skip = format === 'csv' ? 0 : (page - 1) * limit;

  await connectMongo();

  const now = new Date();
  const userFilter: Record<string, unknown> = {};
  if (search) {
    userFilter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }
  if (tier === 'plus') userFilter.premiumUntil = { $gt: now };
  if (tier === 'free') userFilter.$and = [
    { $or: [{ premiumUntil: { $exists: false } }, { premiumUntil: { $lte: now } }] },
  ];
  if (tier === 'guest') userFilter.isGuest = true;
  if (segment === 'new') userFilter.createdAt = window;

  const eventMatch: PipelineStage.Match['$match'] = {
    occurredAt: window,
    userId: { $not: /^anonymous:/ },
  };
  if (platform !== 'any') eventMatch.platform = platform;

  const useProfileSort = PROFILE_SORTS.has(sort) || segment === 'dormant' || !!search || tier !== 'any';
  const sortKey = EVENT_SORTS.has(sort) || PROFILE_SORTS.has(sort) ? sort : 'last_seen';

  let userIds: string[];
  let total = 0;

  if (useProfileSort) {
    const profileSortField =
      sortKey === 'created_at'
        ? 'createdAt'
        : sortKey === 'flies'
          ? 'wardrobe.flies'
          : sortKey === 'streak'
            ? 'quests.loginStreak.count'
            : sortKey === 'name'
              ? 'name'
              : 'createdAt';
    const [docs, count] = await Promise.all([
      UserModel.find(userFilter)
        .select('_id')
        .sort({ [profileSortField]: direction })
        .skip(skip)
        .limit(limit)
        .lean<Array<{ _id: unknown }>>(),
      UserModel.countDocuments(userFilter),
    ]);
    userIds = docs.map((doc) => String(doc._id));
    total = count;
  } else {
    const [rows, countRows] = await Promise.all([
      AnalyticsEventModel.aggregate<{ _id: string }>([
        { $match: eventMatch },
        eventGroupStage(),
        EVENT_PROJECT,
        { $sort: { [sortKey]: direction } },
        { $skip: skip },
        { $limit: limit },
        { $project: { _id: 1 } },
      ]),
      AnalyticsEventModel.aggregate<{ count: number }>([
        { $match: eventMatch },
        { $group: { _id: null, users: { $addToSet: '$userId' } } },
        { $project: { count: { $size: '$users' } } },
      ]),
    ]);
    userIds = rows.map((row) => row._id);
    total = countRows[0]?.count ?? 0;
  }

  if (!userIds.length) {
    return NextResponse.json(
      {
        range: { start: ymd(range.start), end: ymd(range.endDay), days: range.days },
        columns: USER_COLUMNS,
        rows: [],
        total,
        page,
        limit,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const [users, aggregates, friendRows] = await Promise.all([
    UserModel.find({ _id: { $in: userIds } })
      .select('_id name email createdAt premiumUntil isGuest wardrobe.flies quests.loginStreak.count')
      .lean<
        Array<{
          _id: unknown;
          name?: string;
          email?: string;
          createdAt: Date;
          premiumUntil?: Date;
          isGuest?: boolean;
          wardrobe?: { flies?: number };
          quests?: { loginStreak?: { count?: number } };
        }>
      >(),
    AnalyticsEventModel.aggregate<EventAggregate>([
      { $match: { ...eventMatch, userId: { $in: userIds } } },
      eventGroupStage(),
      EVENT_PROJECT,
    ]),
    FriendshipModel.aggregate<{ _id: string; count: number }>([
      { $match: { $or: [{ userA: { $in: userIds } }, { userB: { $in: userIds } }] } },
      { $project: { users: ['$userA', '$userB'] } },
      { $unwind: '$users' },
      { $match: { users: { $in: userIds } } },
      { $group: { _id: '$users', count: { $sum: 1 } } },
    ]),
  ]);

  const aggregateById = new Map(aggregates.map((row) => [row._id, row]));
  const friendsById = new Map(friendRows.map((row) => [row._id, row.count]));
  const orderIndex = new Map(userIds.map((id, index) => [id, index]));

  const dormantCutoff = addUtcDays(range.endDay, -13);

  const rows = users
    .map((user) => {
      const id = String(user._id);
      const aggregate = aggregateById.get(id);
      return {
        name: user.name ?? '',
        email: user.email ?? '',
        user_id: id,
        created_at: user.createdAt ? new Date(user.createdAt).toISOString().slice(0, 10) : '',
        tier: user.isGuest
          ? 'Guest'
          : user.premiumUntil && new Date(user.premiumUntil) > now
            ? 'Plus'
            : 'Free',
        platform: aggregate?.platform ?? 'unknown',
        last_seen: aggregate?.last_seen
          ? new Date(aggregate.last_seen).toISOString().slice(0, 10)
          : '',
        active_days: aggregate?.active_days ?? 0,
        events: aggregate?.events ?? 0,
        tasks_created: aggregate?.tasks_created ?? 0,
        tasks_completed: aggregate?.tasks_completed ?? 0,
        quest_claims: aggregate?.quest_claims ?? 0,
        focus_sessions: aggregate?.focus_sessions ?? 0,
        purchases: aggregate?.purchases ?? 0,
        flies_earned: aggregate?.flies_earned ?? 0,
        flies_spent: aggregate?.flies_spent ?? 0,
        flies: user.wardrobe?.flies ?? 0,
        streak: user.quests?.loginStreak?.count ?? 0,
        friends: friendsById.get(id) ?? 0,
      };
    })
    .filter((row) => {
      if (segment === 'dormant') return !row.last_seen || row.last_seen < ymd(dormantCutoff);
      if (segment === 'engaged') return row.active_days >= 5;
      if (segment === 'paying') return row.tier === 'Plus';
      if (segment === 'social') return row.friends > 0;
      return true;
    })
    .sort((a, b) => (orderIndex.get(a.user_id) ?? 0) - (orderIndex.get(b.user_id) ?? 0));

  // A profile-level filter has to page over users rather than events, so an
  // activity column cannot be sorted in the database. Re-sort the page in
  // memory rather than silently ignoring the column the admin clicked.
  if (useProfileSort && EVENT_SORTS.has(sortKey)) {
    rows.sort((a, b) => {
      const left = (a as Record<string, string | number>)[sortKey];
      const right = (b as Record<string, string | number>)[sortKey];
      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * direction;
      }
      return String(left ?? '').localeCompare(String(right ?? '')) * direction;
    });
  }

  if (format === 'csv') {
    const csv = toCsv([
      USER_COLUMNS.map((column) => column.label),
      ...rows.map((row) => USER_COLUMNS.map((column) => (row as Record<string, string | number>)[column.key] ?? '')),
    ]);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="frogress-users_${ymd(range.start)}_${ymd(range.endDay)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json(
    {
      range: { start: ymd(range.start), end: ymd(range.endDay), days: range.days },
      columns: USER_COLUMNS,
      rows,
      total,
      page,
      limit,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
