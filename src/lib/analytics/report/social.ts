import FriendshipModel from '@/lib/models/Friendship';
import FriendRequestModel from '@/lib/models/FriendRequest';
import ReferralModel from '@/lib/models/Referral';
import TaskBondModel from '@/lib/models/TaskBond';
import type { StatSection } from '@/lib/analytics/catalog';
import { groupByProperties, kpi, rate, round, ymd, type ReportContext } from './context';

export async function buildSocial(context: ReportContext): Promise<StatSection> {
  const { range } = context;
  const dayFrom = ymd(range.start);
  const dayTo = ymd(range.endDay);

  const [
    totalFriendships,
    connectedRows,
    friendships,
    referrals,
    requests,
    bonds,
    activeBonds,
    shareRows,
    pondRows,
  ] = await Promise.all([
    FriendshipModel.countDocuments({}),
    FriendshipModel.aggregate<{ _id: null; count: number }>([
      { $project: { users: ['$userA', '$userB'] } },
      { $unwind: '$users' },
      { $group: { _id: null, users: { $addToSet: '$users' } } },
      { $project: { count: { $size: '$users' } } },
    ]),
    FriendshipModel.find({ createdAt: context.window }).select('source createdAt').lean(),
    ReferralModel.find({ createdAt: context.window })
      .select('inviterId giftOptionId buddyTask claimedByUserId createdAt')
      .lean(),
    FriendRequestModel.find({ createdAt: context.window })
      .select('source status createdAt respondedAt')
      .lean(),
    TaskBondModel.find({
      $or: [
        { createdAt: context.window },
        { bonusAwardedDates: { $elemMatch: { $gte: dayFrom, $lte: dayTo } } },
      ],
    })
      .select('status repeatLabel streak bonusAwardedDates createdAt')
      .lean(),
    TaskBondModel.countDocuments({ status: 'active' }),
    groupByProperties(
      { occurredAt: context.window, category: 'social' },
      { name: 'method', surface: 'share_surface' },
    ),
    groupByProperties(
      { occurredAt: context.window, name: 'fly_earned', 'properties.source': { $in: ['friend_activity', 'friend_reward_double', 'friend_pond', 'friend_pond_double'] } },
      { source: 'source' },
      { sums: { flies: 'fly_amount' } },
    ),
  ]);

  const connectedUsers = connectedRows[0]?.count ?? 0;
  const claimedReferrals = referrals.filter((referral) => !!referral.claimedByUserId).length;

  const newBonds = bonds.filter(
    (bond) =>
      new Date(bond.createdAt) >= range.start && new Date(bond.createdAt) < range.endExclusive,
  );
  const accepted = newBonds.filter((bond) => ['active', 'severed'].includes(bond.status)).length;
  const declined = newBonds.filter((bond) => bond.status === 'declined').length;
  const bothDoneDays = bonds.reduce(
    (sum, bond) =>
      sum + (bond.bonusAwardedDates ?? []).filter((day) => day >= dayFrom && day <= dayTo).length,
    0,
  );

  const requestSources = Array.from(new Set(requests.map((request) => request.source ?? 'unknown')));
  const buddySchedules = Array.from(
    new Set(newBonds.map((bond) => bond.repeatLabel || 'one-off')),
  );

  const acceptedRequests = requests.filter((request) => request.status === 'accepted').length;

  return {
    id: 'social',
    title: 'Friends & buddies',
    question: 'Does the social layer bring people in and keep them?',
    blurb: 'Invites, friendships, the pond, and shared Goal Buddy tasks.',
    kpis: [
      kpi('connected_users', connectedUsers, {
        detail: `${round((totalFriendships * 2) / (connectedUsers || 1), 1)} friends each on average`,
      }),
      kpi('new_friendships', friendships.length),
      kpi('invite_conversion', rate(claimedReferrals, referrals.length), {
        detail: `${claimedReferrals} claimed of ${referrals.length} invites`,
        sample: referrals.length,
      }),
      kpi('friend_request_acceptance', rate(acceptedRequests, requests.length), {
        sample: requests.length,
      }),
      kpi('buddy_acceptance_rate', rate(accepted, newBonds.length), {
        detail: `${activeBonds} bonds active right now`,
        sample: newBonds.length,
      }),
    ],
    series: [
      {
        key: 'social.daily',
        title: 'Social activity per day',
        question: 'Is the graph growing on its own, or only when you push invites?',
        lines: [
          { key: 'invites', label: 'Invites created', format: 'integer' },
          { key: 'requests', label: 'Friend requests', format: 'integer' },
          { key: 'buddy', label: 'Buddy invites', format: 'integer' },
        ],
        points: context.dates.map((date, index) => ({
          date,
          invites: context.seriesFor('referral_invite_created')[index] ?? 0,
          requests: context.seriesFor('friend_request_sent')[index] ?? 0,
          buddy: context.seriesFor('buddy_invite_sent')[index] ?? 0,
        })),
      },
    ],
    tables: [
      {
        key: 'social.referral_funnel',
        title: 'Invite funnel',
        question: 'Where do invites die — at sharing, at opening, or at claiming?',
        columns: [
          { key: 'step', label: 'Step' },
          { key: 'events', label: 'Events', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
          { key: 'of_created', label: '% of created', format: 'percent' },
        ],
        rows: [
          { step: 'Invite created', events: referrals.length, users: new Set(referrals.map((r) => r.inviterId)).size },
          {
            step: 'Invite shared',
            events: context.events('referral_invite_shared'),
            users: context.users('referral_invite_shared'),
          },
          {
            step: 'Invite opened',
            events: context.events('referral_invite_opened'),
            users: context.users('referral_invite_opened'),
          },
          { step: 'Gift claimed', events: claimedReferrals, users: claimedReferrals },
        ].map((row) => ({ ...row, of_created: rate(row.events, referrals.length) })),
      },
      {
        key: 'social.share_methods',
        title: 'How links get shared',
        question: 'Which share surface is worth building for?',
        columns: [
          { key: 'method', label: 'Method' },
          { key: 'surface', label: 'Surface' },
          { key: 'shares', label: 'Shares', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
        ],
        rows: shareRows
          .filter((row) => String(row._id.name) !== 'unknown')
          .map((row) => ({
            method: String(row._id.name),
            surface: String(row._id.surface),
            shares: row.count,
            users: row.users,
          })),
      },
      {
        key: 'social.requests',
        title: 'Friend requests by source',
        question: 'Which discovery path produces friendships people actually accept?',
        columns: [
          { key: 'source', label: 'Source' },
          { key: 'sent', label: 'Sent', format: 'integer' },
          { key: 'accepted', label: 'Accepted', format: 'integer' },
          { key: 'declined', label: 'Declined', format: 'integer' },
          { key: 'pending', label: 'Pending', format: 'integer' },
          { key: 'acceptance', label: 'Acceptance', format: 'percent' },
          { key: 'avg_hours', label: 'Avg response (h)', format: 'decimal' },
        ],
        rows: requestSources
          .map((source) => {
            const rows = requests.filter((request) => (request.source ?? 'unknown') === source);
            const acceptedRows = rows.filter((request) => request.status === 'accepted');
            const hours = rows
              .filter((request) => request.respondedAt)
              .map(
                (request) =>
                  (new Date(request.respondedAt as Date).getTime() -
                    new Date(request.createdAt).getTime()) /
                  3_600_000,
              );
            return {
              source: String(source),
              sent: rows.length,
              accepted: acceptedRows.length,
              declined: rows.filter((request) => request.status === 'declined').length,
              pending: rows.filter((request) => request.status === 'pending').length,
              acceptance: rate(acceptedRows.length, rows.length),
              avg_hours: hours.length
                ? round(hours.reduce((sum, value) => sum + value, 0) / hours.length, 1)
                : 0,
            };
          })
          .sort((a, b) => b.sent - a.sent),
      },
      {
        key: 'social.friendship_sources',
        title: 'Where friendships come from',
        question: 'Which entry point is actually building the graph?',
        columns: [
          { key: 'source', label: 'Source' },
          { key: 'friendships', label: 'New friendships', format: 'integer' },
          { key: 'share', label: 'Share', format: 'percent' },
        ],
        rows: Array.from(new Set(friendships.map((friendship) => friendship.source ?? 'unknown')))
          .map((source) => {
            const count = friendships.filter(
              (friendship) => (friendship.source ?? 'unknown') === source,
            ).length;
            return {
              source: String(source),
              friendships: count,
              share: rate(count, friendships.length),
            };
          })
          .sort((a, b) => b.friendships - a.friendships),
      },
      {
        key: 'social.buddies',
        title: 'Goal Buddy bonds',
        question: 'Do shared tasks survive past the first week?',
        columns: [
          { key: 'schedule', label: 'Schedule' },
          { key: 'invites', label: 'Invites', format: 'integer' },
          { key: 'accepted', label: 'Accepted', format: 'integer' },
          { key: 'declined', label: 'Declined', format: 'integer' },
          { key: 'pending', label: 'Pending', format: 'integer' },
          { key: 'avg_streak', label: 'Avg streak', format: 'decimal' },
        ],
        rows: buddySchedules
          .map((schedule) => {
            const rows = newBonds.filter((bond) => (bond.repeatLabel || 'one-off') === schedule);
            return {
              schedule: String(schedule),
              invites: rows.length,
              accepted: rows.filter((bond) => ['active', 'severed'].includes(bond.status)).length,
              declined: rows.filter((bond) => bond.status === 'declined').length,
              pending: rows.filter((bond) => bond.status === 'pending').length,
              avg_streak: rows.length
                ? round(
                    rows.reduce((sum, bond) => sum + (bond.streak?.count ?? 0), 0) / rows.length,
                    1,
                  )
                : 0,
            };
          })
          .sort((a, b) => b.invites - a.invites),
        note: `Both partners finished on ${bothDoneDays} day${bothDoneDays === 1 ? '' : 's'} in this range. Declined: ${declined}.`,
      },
      {
        key: 'social.rewards',
        title: 'Social fly rewards',
        question: 'Is the friend pond paying enough to be worth checking?',
        columns: [
          { key: 'source', label: 'Source' },
          { key: 'grants', label: 'Grants', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
          { key: 'flies', label: 'Flies', format: 'integer' },
          { key: 'per_user', label: 'Flies / user', format: 'decimal' },
        ],
        rows: pondRows.map((row) => ({
          source: String(row._id.source),
          grants: row.count,
          users: row.users,
          flies: row.flies,
          per_user: round(row.flies / (row.users || 1), 1),
        })),
      },
    ],
  };
}
