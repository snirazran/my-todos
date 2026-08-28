import QuestCategoryModel from '@/lib/models/QuestCategory';
import QuestSeasonModel from '@/lib/models/QuestSeason';
import type { StatSection, StatTable } from '@/lib/analytics/catalog';
import { groupByProperties, kpi, rate, round, type ReportContext } from './context';
import { averagesTable, mixTable, propertyMix } from './dimensions';

const OBJECTIVE_KEYS = [
  'quest_placement',
  'quest_generation',
  'quest_tier',
  'objective_type',
  'objective_action',
  'objective_tag_mode',
  'objective_metric',
  'reward_type',
  'is_premium',
  'objective_target',
  'objective_count',
  'reward_amount',
  'reward_count',
];

export async function buildQuests(context: ReportContext): Promise<StatSection> {
  const [objectiveMix, mixRows, seasonRows, categories, seasons] = await Promise.all([
    propertyMix({ occurredAt: context.window, name: 'quest_objective_claimed' }, OBJECTIVE_KEYS),
    groupByProperties(
      { occurredAt: context.window, name: 'quest_objective_claimed' },
      {
        placement: 'quest_placement',
        category: 'quest_category',
        tier: 'quest_tier',
        type: 'objective_type',
        action: 'objective_action',
        metric: 'objective_metric',
        rewardType: 'reward_type',
      },
      { sums: { targets: 'objective_target', flies: 'reward_amount', items: 'reward_count' }, limit: 60 },
    ),
    groupByProperties(
      { occurredAt: context.window, name: 'season_reward_claimed' },
      { seasonId: 'season_id', day: 'season_day', tier: 'is_premium' },
      { sums: { flies: 'reward_amount', items: 'reward_count' }, limit: 120 },
    ),
    QuestCategoryModel.find({}).select('categoryId name shortLabel').lean(),
    QuestSeasonModel.find({}).select('seasonId name').lean(),
  ]);

  const categoryNames = new Map(
    categories.map((category) => [
      String(category.categoryId),
      String(category.shortLabel || category.name || category.categoryId),
    ]),
  );
  const seasonNames = new Map(
    seasons.map((season) => [String(season.seasonId), String(season.name || season.seasonId)]),
  );

  const objectives = context.metric('quest_objective_claimed');
  const swaps = context.metric('daily_quest_swapped');
  const committed = context.metric('pact_committed');
  const claimed = context.metric('pact_claimed');
  const skipped = context.metric('pact_skipped');
  const dropped = context.metric('pact_dropped');
  const retro = context.metric('pact_retro_claimed');
  const dailyReward = context.metric('daily_reward_claimed');
  const seasonReward = context.metric('season_reward_claimed');

  const objectivePerformance: StatTable = {
    key: 'quests.objective_performance',
    title: 'Objective performance',
    question: 'Which objective shapes get claimed, and what do they cost you in flies?',
    columns: [
      { key: 'placement', label: 'Surface' },
      { key: 'category', label: 'Category' },
      { key: 'tier', label: 'Slot' },
      { key: 'type', label: 'Type' },
      { key: 'action', label: 'Action' },
      { key: 'claims', label: 'Claims', format: 'integer' },
      { key: 'users', label: 'Users', format: 'integer' },
      { key: 'avg_target', label: 'Avg target', format: 'decimal' },
      { key: 'avg_flies', label: 'Avg flies', format: 'decimal' },
      { key: 'flies', label: 'Flies paid', format: 'integer' },
    ],
    rows: mixRows.map((row) => ({
      placement: String(row._id.placement),
      category: categoryNames.get(String(row._id.category)) ?? String(row._id.category),
      tier: String(row._id.tier),
      type: String(row._id.type),
      action: String(row._id.action),
      claims: row.count,
      users: row.users,
      avg_target: row.count ? round(row.targets / row.count, 2) : 0,
      avg_flies: row.count ? round(row.flies / row.count, 2) : 0,
      flies: row.flies,
    })),
    note: 'A shape with a high target and few claims is too hard. A shape with a low target and heavy claims is where the flies leak.',
  };

  const pactFunnel: StatTable = {
    key: 'quests.pact_funnel',
    title: 'Leap outcomes',
    question: 'Of the weekly Leaps people commit to, how many actually land?',
    columns: [
      { key: 'outcome', label: 'Outcome' },
      { key: 'events', label: 'Events', format: 'integer' },
      { key: 'users', label: 'Users', format: 'integer' },
      { key: 'of_committed', label: '% of committed', format: 'percent' },
    ],
    rows: [
      { label: 'Committed', total: committed },
      { label: 'Claimed', total: claimed },
      { label: 'Skipped a session', total: skipped },
      { label: 'Dropped', total: dropped },
      { label: 'Claimed retroactively', total: retro },
      { label: 'Sessions removed', total: context.metric('pact_sessions_removed') },
    ].map((row) => ({
      outcome: row.label,
      events: row.total.events,
      users: row.total.users,
      of_committed: rate(row.total.events, committed.events),
    })),
  };

  const seasonTable: StatTable = {
    key: 'quests.season_rewards',
    title: 'Season reward claims',
    question: 'How far down the season track do free and Plus users actually get?',
    columns: [
      { key: 'season', label: 'Season' },
      { key: 'day', label: 'Day', format: 'integer' },
      { key: 'tier', label: 'Tier' },
      { key: 'claims', label: 'Claims', format: 'integer' },
      { key: 'users', label: 'Users', format: 'integer' },
      { key: 'flies', label: 'Flies', format: 'integer' },
      { key: 'items', label: 'Items', format: 'integer' },
    ],
    rows: seasonRows
      .map((row) => ({
        season: seasonNames.get(String(row._id.seasonId)) ?? String(row._id.seasonId),
        day: Number(row._id.day) || 0,
        tier: row._id.tier === true || row._id.tier === 'true' ? 'Plus' : 'Free',
        claims: row.count,
        users: row.users,
        flies: row.flies,
        items: row.items,
      }))
      .sort((a, b) => a.day - b.day),
    note: 'A cliff in the day column is where the season stops being worth opening.',
  };

  return {
    id: 'quests',
    title: 'Quests & Leaps',
    question: 'Are the goals we hand out being taken and finished?',
    blurb: 'Daily quests, Leaps, seasons — the goals the app authors for the user.',
    kpis: [
      kpi('quest_objectives_claimed', objectives.events, {
        sparkline: context.seriesFor('quest_objective_claimed'),
      }),
      kpi('quest_claimers', objectives.users),
      kpi('quest_reach', rate(objectives.users, context.activeUsers), {
        detail: `${objectives.users} of ${context.activeUsers} active users`,
        sample: context.activeUsers,
      }),
      kpi('quest_swap_rate', rate(swaps.users, objectives.users), {
        detail: `${swaps.events} swaps by ${swaps.users} users`,
        sample: objectives.users,
      }),
      kpi('pact_committed', committed.events, { sparkline: context.seriesFor('pact_committed') }),
      kpi('pact_completion_rate', rate(claimed.events, committed.events), {
        sample: committed.events,
      }),
      kpi('pact_drop_rate', rate(dropped.events + skipped.events, committed.events), {
        sample: committed.events,
      }),
    ],
    series: [
      {
        key: 'quests.daily',
        title: 'Quest activity per day',
        question: 'Does quest engagement track the release of new content, or drift on its own?',
        lines: [
          { key: 'objectives', label: 'Objectives claimed', format: 'integer' },
          { key: 'daily_reward', label: 'Daily rewards', format: 'integer' },
          { key: 'pact', label: 'Leaps committed', format: 'integer' },
        ],
        points: context.dates.map((date, index) => ({
          date,
          objectives: context.seriesFor('quest_objective_claimed')[index] ?? 0,
          daily_reward: context.seriesFor('daily_reward_claimed')[index] ?? 0,
          pact: context.seriesFor('pact_committed')[index] ?? 0,
        })),
      },
    ],
    tables: [
      objectivePerformance,
      mixTable({
        key: 'quests.objective_mix',
        title: 'Objective mix',
        question: 'What kind of objective is doing the work right now?',
        rows: objectiveMix,
        total: objectives.events,
        countLabel: 'Claims',
        order: [
          'quest_placement',
          'quest_generation',
          'quest_tier',
          'objective_type',
          'objective_action',
          'objective_metric',
          'objective_tag_mode',
          'reward_type',
          'is_premium',
        ],
      }),
      averagesTable({
        key: 'quests.objective_averages',
        title: 'Objective difficulty and payout',
        question: 'Is the average objective priced right for the effort it asks?',
        rows: objectiveMix,
      }),
      pactFunnel,
      seasonTable,
      {
        key: 'quests.reward_surfaces',
        title: 'Reward surfaces',
        question: 'Which reward surface is carrying the daily return, and which is idle?',
        columns: [
          { key: 'surface', label: 'Surface' },
          { key: 'claims', label: 'Claims', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
          { key: 'reach', label: 'Reach of actives', format: 'percent' },
        ],
        rows: [
          { surface: 'Quest objectives', total: objectives },
          { surface: 'Login calendar', total: dailyReward },
          { surface: 'Season track', total: seasonReward },
          { surface: 'Leaps', total: claimed },
        ].map((row) => ({
          surface: row.surface,
          claims: row.total.events,
          users: row.total.users,
          reach: rate(row.total.users, context.activeUsers),
        })),
      },
    ],
  };
}
