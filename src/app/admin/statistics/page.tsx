'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  ChevronDown,
  Eye,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { AdminGuard } from '@/components/auth/AdminGuard';

type Metric = { events: number; users: number };
type EngagementBreakdown = {
  averages: Array<{ key: string; label: string; average: number; total: number; samples: number }>;
  dimensions: Array<{
    key: string;
    label: string;
    rows: Array<{ value: string; events: number; users: number; share: number }>;
  }>;
};
type StatisticsData = {
  range: { days: number; start: string; end: string };
  coverage: { firstEventAt: string | null; retentionDays: number; timezone: string };
  overview: {
    totalUsers: number;
    newUsers: number;
    activePremium: number;
    activeUsers: number;
    dau: number;
    wau: number;
    mau: number;
    stickiness: number;
    sessions: number;
    tasksCompleted: number;
  };
  series: Array<{
    date: string;
    activeUsers: number;
    sessions: number;
    newUsers: number;
    tasksCompleted: number;
    timersCompleted: number;
    revenue: number;
    proceeds: number;
  }>;
  retention: Array<{ day: number; eligible: number; retained: number; rate: number }>;
  funnel: Array<{ key: string; label: string; users: number; rate: number }>;
  events: Array<{ name: string; events: number; users: number }>;
  platforms: Array<{ platform: string; users: number; events: number }>;
  sources: Array<{ source: string; users: number; sessions: number }>;
  pages: Array<{ page: string; users: number; views: number }>;
  engagement: {
    tasksCreated: Metric;
    tasksCompleted: Metric;
    timersStarted: Metric;
    timersCompleted: Metric;
    questObjectives: Metric;
    questObjectiveMix: Array<{
      placement: string;
      category: string;
      tier: string;
      objectiveType: string;
      action: string;
      tagMode: string;
      metric: string;
      rewardType: string;
      claims: number;
      users: number;
      averageTarget: number;
      averageFlies: number;
      averageItems: number;
    }>;
    dailyRewards: Metric;
    seasonRewards: Metric;
  };
  engagementBreakdowns: Record<string, EngagementBreakdown>;
  monetization: {
    paywallViews: number;
    paywallViewers: number;
    purchaseStarts: number;
    purchaseStartUsers: number;
    purchaseCompletions: number;
    purchaseCompletionUsers: number;
    purchaseConversion: number;
    subscriptionsStarted: number;
    renewals: number;
    cancellations: number;
    expirations: number;
    billingIssues: number;
    refunds: number;
    grossRevenue: number;
    estimatedProceeds: number;
  };
  ads: Array<{
    placement: string;
    requested: number;
    impressions: number;
    completed: number;
    dismissed: number;
    failed: number;
    completionRate: number;
  }>;
  economy: {
    flyEarning: Record<'free' | 'premium', { flies: number; events: number; users: number; averagePerUser: number; averagePerEvent: number }>;
    flySources: Array<{
      source: string;
      flies: number;
      events: number;
      users: number;
      averagePerEvent: number;
      averagePerUser: number;
      shareOfFlies: number;
      tiers: Array<{ tier: string; flies: number; events: number; users: number; averagePerEvent: number; averagePerUser: number }>;
    }>;
    flySpending: { total: number; sources: Array<{ source: string; tier: string; flies: number; events: number; users: number; averagePerUser: number }> };
    catalogRarities: Array<{ rarity: string; items: number; averagePrice: number; minimumPrice: number; maximumPrice: number }>;
    skins: Array<{ action: string; rarity: string; tier: string; transactions: number; users: number; items: number; flies: number }>;
    trades: Array<{ tier: string; fromRarity: string; toRarity: string; trades: number; users: number; itemsConsumed: number; averagePerTrader: number }>;
    seasons: Array<{ seasonId: string; seasonName: string; day: number; tier: string; claims: number; users: number; flies: number; items: number; averageFlies: number }>;
    flyShop: { views: Metric; packs: Array<{ packId: string; stage: string; events: number; users: number; flies: number; revenue: number }>; completedPurchases: number; revenue: number };
  };
  tryFunnel: Array<{ key: string; label: string; users: number; events: number }>;
  paywallPlacements: Array<{
    placement: string;
    views: number;
    viewers: number;
    starts: number;
    completed: number;
    cancelled: number;
    failed: number;
    startRate: number;
    conversionRate: number;
    steps: Array<{ step: number; label: string; events: number; users: number; reachRate: number; stepConversion: number }>;
  }>;
  friends: {
    network: { totalFriendships: number; connectedUsers: number; averageFriends: number; newFriendships: number; sources: Array<{ source: string; friendships: number }> };
    referrals: {
      created: number; inviters: number; withBuddyTask: number;
      shared: Metric; opened: Metric; claimed: number; conversionRate: number;
      byGift: Array<{ giftOption: string; created: number; claimed: number }>;
    };
    shareMethods: Array<{ kind: string; surface: string; method: string; shares: number; users: number }>;
    friendRequests: Array<{ source: string; sent: number; accepted: number; declined: number; pending: number; acceptanceRate: number; averageResponseHours: number }>;
    buddies: {
      active: number; invites: number; accepted: number; declined: number; pending: number; acceptanceRate: number;
      taskCompletions: number; completers: number; bothCompletedDays: number;
      schedules: Array<{ schedule: string; invites: number; accepted: number; declined: number; pending: number; averageStreak: number }>;
    };
    rewards: { flies: number; actions: number; users: number; averagePerUser: number };
  };
};

type Tab = 'overview' | 'engagement' | 'friends' | 'economy' | 'revenue' | 'acquisition';
const RANGES = [7, 30, 90, 365] as const;
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'friends', label: 'Friends' },
  { id: 'economy', label: 'Economy' },
  { id: 'revenue', label: 'Revenue & ads' },
  { id: 'acquisition', label: 'Acquisition' },
];

const integer = new Intl.NumberFormat();
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function dateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function quickRange(days: number) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: dateInput(start), end: dateInput(end) };
}

function previousRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const length = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
  const previousEnd = new Date(startDate);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (length - 1));
  return { start: dateInput(previousStart), end: dateInput(previousEnd) };
}

function selectedDays(start: string, end: string) {
  return Math.round(
    (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) /
      86_400_000,
  ) + 1;
}

export default function StatisticsPage() {
  return (
    <AdminGuard>
      <StatisticsPageContent />
    </AdminGuard>
  );
}

function StatisticsPageContent() {
  const [days, setDays] = useState(30);
  const [primaryRange, setPrimaryRange] = useState(() => quickRange(30));
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [comparisonRange, setComparisonRange] = useState(() => {
    const range = quickRange(30);
    return previousRange(range.start, range.end);
  });
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<StatisticsData | null>(null);
  const [comparisonData, setComparisonData] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const invalidPrimary = !primaryRange.start || !primaryRange.end || primaryRange.start > primaryRange.end || selectedDays(primaryRange.start, primaryRange.end) > 400;
    const invalidComparison = comparisonEnabled && (!comparisonRange.start || !comparisonRange.end || comparisonRange.start > comparisonRange.end || selectedDays(comparisonRange.start, comparisonRange.end) > 400);
    if (invalidPrimary || invalidComparison) {
      setLoading(false);
      setError('Choose valid date ranges of 400 days or fewer, with From on or before To.');
      return () => controller.abort();
    }
    const load = async (range: { start: string; end: string }) => {
      const response = await fetch(`/api/admin/statistics?start=${range.start}&end=${range.end}`, {
        credentials: 'include',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Statistics could not be loaded');
      return response.json() as Promise<StatisticsData>;
    };
    Promise.all([
      load(primaryRange),
      comparisonEnabled ? load(comparisonRange) : Promise.resolve(null),
    ])
      .then(([primary, comparison]) => {
        setData(primary);
        setComparisonData(comparison);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : 'Statistics could not be loaded');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [primaryRange, comparisonEnabled, comparisonRange, reloadKey]);

  const selectQuickRange = (rangeDays: number) => {
    const range = quickRange(rangeDays);
    setDays(rangeDays);
    setPrimaryRange(range);
    if (comparisonEnabled) setComparisonRange(previousRange(range.start, range.end));
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/admin"
              title="Back to admin"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black tracking-tight md:text-2xl">Statistics</h1>
              <p className="text-xs font-medium text-muted-foreground md:text-sm">
                Product health, retention, monetization, and ad performance
              </p>
            </div>
          </div>
          <button
            type="button"
            title="Refresh statistics"
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={loading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5 md:px-8 md:py-7">
        <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Statistics views">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`h-9 shrink-0 rounded-md px-3 text-xs font-bold transition-colors md:text-sm ${
                  tab === item.id
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex w-fit rounded-md border border-border bg-muted/40 p-1" aria-label="Date range">
            {RANGES.map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => selectQuickRange(range)}
                className={`h-7 min-w-10 rounded px-2 text-[11px] font-bold transition-colors ${
                  days === range ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                {range === 365 ? '1Y' : `${range}D`}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 rounded-md border border-border bg-card p-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <DateField label="From" value={primaryRange.start} onChange={(start) => { setDays(0); setPrimaryRange((range) => ({ ...range, start })); }} />
            <DateField label="To" value={primaryRange.end} onChange={(end) => { setDays(0); setPrimaryRange((range) => ({ ...range, end })); }} />
            <button
              type="button"
              onClick={() => {
                const enabled = !comparisonEnabled;
                setComparisonEnabled(enabled);
                if (enabled) setComparisonRange(previousRange(primaryRange.start, primaryRange.end));
              }}
              className={`h-9 rounded-md border px-3 text-xs font-bold transition-colors ${comparisonEnabled ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border text-muted-foreground hover:bg-muted'}`}
            >
              Compare dates
            </button>
          </div>
          {comparisonEnabled ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
              <span className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">Compared with</span>
              <DateField label="From" value={comparisonRange.start} onChange={(start) => setComparisonRange((range) => ({ ...range, start }))} />
              <DateField label="To" value={comparisonRange.end} onChange={(end) => setComparisonRange((range) => ({ ...range, end }))} />
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm font-semibold text-red-700 dark:text-red-300">
            {error}
          </div>
        ) : loading && !data ? (
          <DashboardSkeleton />
        ) : data ? (
          <div className="mt-5">
            {comparisonEnabled && comparisonData ? <ComparisonSummary primary={data} comparison={comparisonData} /> : null}
            {tab === 'overview' && <Overview data={data} />}
            {tab === 'engagement' && <Engagement data={data} />}
            {tab === 'friends' && <FriendsAnalytics data={data} />}
            {tab === 'economy' && <Economy data={data} />}
            {tab === 'revenue' && <Revenue data={data} />}
            {tab === 'acquisition' && <Acquisition data={data} />}
            <CoverageNote coverage={data.coverage} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      {label}
      <span className="relative">
        <CalendarDays className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4" />
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 rounded-md border border-border bg-background pl-8 pr-2 text-xs font-semibold normal-case tracking-normal text-foreground outline-none focus:border-emerald-500"
        />
      </span>
    </label>
  );
}

function ComparisonSummary({ primary, comparison }: { primary: StatisticsData; comparison: StatisticsData }) {
  const rows = [
    ['Active users', primary.overview.activeUsers, comparison.overview.activeUsers, 'number'],
    ['New users', primary.overview.newUsers, comparison.overview.newUsers, 'number'],
    ['Tasks completed', primary.overview.tasksCompleted, comparison.overview.tasksCompleted, 'number'],
    ['Gross revenue', primary.monetization.grossRevenue, comparison.monetization.grossRevenue, 'money'],
    ['Free flies / user', primary.economy.flyEarning.free.averagePerUser, comparison.economy.flyEarning.free.averagePerUser, 'number'],
    ['Plus flies / user', primary.economy.flyEarning.premium.averagePerUser, comparison.economy.flyEarning.premium.averagePerUser, 'number'],
  ] as const;
  return (
    <section className="mb-5 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-black">Period comparison</h2>
          <p className="text-[11px] text-muted-foreground">{primary.range.start} to {primary.range.end} vs {comparison.range.start} to {comparison.range.end}</p>
        </div>
        <BarChart3 className="h-5 w-5 text-emerald-600" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {rows.map(([label, current, previous, format]) => {
          const delta = previous === 0 ? (current > 0 ? null : 0) : ((current - previous) / Math.abs(previous)) * 100;
          return (
            <div key={label} className="rounded-md border border-border bg-card p-3">
              <p className="truncate text-[10px] font-bold text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-black tabular-nums">{format === 'money' ? money.format(current) : integer.format(current)}</p>
              <p className={`mt-0.5 text-[10px] font-bold ${delta === null ? 'text-muted-foreground' : delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {delta === null ? 'New vs zero' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Overview({ data }: { data: StatisticsData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Activity />} label="Daily active" value={integer.format(data.overview.dau)} detail={`${integer.format(data.overview.mau)} monthly active`} />
        <Kpi icon={<Users />} label="New users" value={integer.format(data.overview.newUsers)} detail={`${integer.format(data.overview.totalUsers)} total accounts`} />
        <Kpi icon={<Target />} label="DAU / MAU" value={`${data.overview.stickiness}%`} detail="Daily product stickiness" />
        <Kpi icon={<TrendingUp />} label="Tasks completed" value={integer.format(data.overview.tasksCompleted)} detail={`${integer.format(data.overview.sessions)} sessions`} />
      </div>

      <Panel title="Active users" subtitle="Unique users with tracked activity each UTC day">
        <BarTrend rows={data.series} valueKey="activeUsers" />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Activation milestones" subtitle="Unique users reaching each milestone in this period">
          <Funnel rows={data.funnel} />
        </Panel>
        <Panel title="New-user retention" subtitle="Returned and opened Frogress on the exact cohort day">
          <div className="grid grid-cols-3 gap-3">
            {data.retention.map((row) => (
              <div key={row.day} className="rounded-md border border-border bg-muted/30 p-4">
                <p className="text-xs font-bold text-muted-foreground">Day {row.day}</p>
                <p className="mt-1 text-2xl font-black tabular-nums">{row.rate}%</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {row.retained} of {row.eligible} eligible
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Audience snapshot" subtitle="Rolling activity windows and current Plus access">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <InlineMetric label="DAU" value={data.overview.dau} />
          <InlineMetric label="WAU" value={data.overview.wau} />
          <InlineMetric label="MAU" value={data.overview.mau} />
          <InlineMetric label="Active Plus" value={data.overview.activePremium} />
        </div>
      </Panel>
    </div>
  );
}

function Engagement({ data }: { data: StatisticsData }) {
  const features = [
    ['task_created', 'Tasks created', data.engagement.tasksCreated],
    ['task_completed', 'Tasks completed', data.engagement.tasksCompleted],
    ['timer_started', 'Focus timers started', data.engagement.timersStarted],
    ['timer_completed', 'Focus timers completed', data.engagement.timersCompleted],
    ['quest_objective_claimed', 'Quest objectives claimed', data.engagement.questObjectives],
    ['daily_reward_claimed', 'Login calendar rewards', data.engagement.dailyRewards],
    ['season_reward_claimed', 'Season rewards', data.engagement.seasonRewards],
  ] as const;
  return (
    <div className="space-y-5">
      <Panel title="Feature adoption" subtitle="Expand a feature for its event mix. Detailed properties appear only on events collected after that property was introduced.">
        <FeatureAdoption rows={features.map(([event, label, metric]) => ({
          event,
          label,
          metric,
          breakdown: data.engagementBreakdowns[event],
          questMix: event === 'quest_objective_claimed' ? data.engagement.questObjectiveMix : undefined,
        }))} />
      </Panel>
      <Panel title="Work completed" subtitle="Tasks and completed focus timers by day">
        <BarTrend rows={data.series} valueKey="tasksCompleted" secondaryKey="timersCompleted" />
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Most-used pages" subtitle="Views and unique visitors">
          <DataTable headers={['Page', 'Views', 'Users']} rows={data.pages.map((row) => [row.page, integer.format(row.views), integer.format(row.users)])} />
        </Panel>
        <Panel title="Event health" subtitle="All allowlisted events received in this period">
          <DataTable headers={['Event', 'Count', 'Users', 'Events / user']} rows={data.events.map((row) => [humanize(row.name), integer.format(row.events), integer.format(row.users), row.users ? (row.events / row.users).toFixed(1) : '0'])} />
        </Panel>
      </div>
    </div>
  );
}

function FeatureAdoption({ rows }: {
  rows: Array<{ event: string; label: string; metric: Metric; breakdown?: EngagementBreakdown; questMix?: StatisticsData['engagement']['questObjectiveMix'] }>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px] divide-y divide-border">
        <div className="grid grid-cols-[minmax(180px,1fr)_80px_80px_100px_28px] gap-2 pb-2 text-[10px] font-bold uppercase text-muted-foreground">
          <span>Feature</span><span className="text-right">Events</span><span className="text-right">Users</span><span className="text-right">Events / user</span><span />
        </div>
        {rows.map((row) => {
          const open = expanded === row.event;
          const hasDetails = !!row.breakdown && (row.breakdown.averages.length > 0 || row.breakdown.dimensions.length > 0);
          return (
            <div key={row.event}>
              <button
                type="button"
                className="grid w-full grid-cols-[minmax(180px,1fr)_80px_80px_100px_28px] items-center gap-2 py-3 text-left text-xs hover:bg-muted/30"
                onClick={() => hasDetails && setExpanded(open ? null : row.event)}
                aria-expanded={open}
                disabled={!hasDetails}
              >
                <span className="font-bold">{row.label}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.metric.events)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.metric.users)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{row.metric.users ? (row.metric.events / row.metric.users).toFixed(1) : '0'}</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''} ${hasDetails ? '' : 'opacity-20'}`} />
              </button>
              {open && row.breakdown ? <FeatureDetails event={row.event} breakdown={row.breakdown} questMix={row.questMix} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DETAIL_GROUPS: Record<string, Array<{ title: string; keys: string[] }>> = {
  task_created: [
    { title: 'Task setup', keys: ['task_type', 'recurring', 'repeat_mode', 'buddy'] },
    { title: 'Organization used', keys: ['focus_connected', 'has_schedule', 'has_reminder', 'streak_tier'] },
  ],
  task_completed: [
    { title: 'Tasks people finished', keys: ['task_type', 'recurring', 'repeat_mode', 'buddy'] },
    { title: 'Features on completed tasks', keys: ['focus_connected', 'has_schedule', 'has_reminder', 'streak_tier'] },
  ],
  timer_started: [
    { title: 'Timer setup', keys: ['phase', 'auto_start_breaks'] },
    { title: 'Tasks used with timers', keys: ['task_type', 'recurring', 'buddy', 'focus_connected'] },
  ],
  timer_completed: [
    { title: 'Completed timer setup', keys: ['phase', 'auto_start_breaks'] },
    { title: 'Tasks used with timers', keys: ['task_type', 'recurring', 'buddy', 'focus_connected'] },
  ],
  quest_objective_claimed: [
    { title: 'Where users saw it', keys: ['quest_placement', 'quest_category', 'quest_tier'] },
    { title: 'What users had to do', keys: ['objective_type', 'objective_subject', 'objective_action', 'objective_tag_mode', 'objective_metric'] },
    { title: 'What users earned', keys: ['reward_type', 'premium_reward_included'] },
  ],
  daily_reward_claimed: [
    { title: 'Login calendar progress', keys: ['reward_day', 'premium_reward_included', 'is_premium'] },
    { title: 'Rewards received', keys: ['reward_type'] },
  ],
  season_reward_claimed: [
    { title: 'Season progress', keys: ['season_id', 'season_day', 'is_premium'] },
    { title: 'Rewards received', keys: ['reward_type', 'premium_reward_included'] },
  ],
};

const OMIT_EMPTY_DIMENSIONS = new Set(['objective_action', 'objective_metric', 'quest_tier']);

function readableDetailValue(key: string, value: string) {
  const normalized = value.toLowerCase();
  if (key === 'quest_tier' && /^\d+$/.test(value)) return `Tier ${value}`;
  if (key === 'reward_day') return `Day ${value} of the login calendar`;
  if (key === 'season_day') return `Season day ${value}`;
  const labels: Record<string, Record<string, string>> = {
    quest_placement: { onboarding: 'Onboarding quests', daily: 'Daily quests', category: 'Focus quests' },
    quest_generation: { authored: 'Made in the admin', generated: 'Generated automatically' },
    quest_category: { uncategorized: 'No focus category', daily: 'Daily quests' },
    objective_type: {
      focus_minutes: 'Focus for a number of minutes',
      count: 'Create or complete tasks',
      metric_count: 'Reach an in-app milestone',
    },
    objective_subject: { task: 'Tasks', any: 'Any eligible activity' },
    objective_action: { complete: 'Complete tasks', add: 'Create tasks' },
    objective_tag_mode: {
      ignore: 'Any task counts',
      random_user_tag: 'Tasks with one selected tag',
      focus_category_tags: 'Tasks connected to the focus category',
    },
    reward_type: { flies: 'Flies', item: 'Cosmetic item', mixed: 'Flies and cosmetic items' },
    is_premium: { plus: 'Plus users', free: 'Free users' },
    premium_reward_included: { yes: 'Plus reward included', no: 'Free reward only' },
    recurring: { yes: 'Repeating', no: 'One-time' },
    buddy: { yes: 'Buddy task', no: 'Individual task' },
    focus_connected: { yes: 'Connected to a focus', no: 'Not connected to a focus' },
    has_schedule: { yes: 'Scheduled time', no: 'No scheduled time' },
    has_reminder: { yes: 'Reminder enabled', no: 'No reminder' },
    auto_start_breaks: { yes: 'Break starts automatically', no: 'Break starts manually' },
  };
  return labels[key]?.[normalized] ?? humanize(value);
}

function readableAverage(key: string, value: number, objectiveType?: string) {
  const labels: Record<string, string> = {
    count: 'Tasks created per action',
    tag_count: 'Tags per task',
    focus_tag_count: 'Focus tags per task',
    checklist_count: 'Checklist items per task',
    streak_length: 'Streak length',
    focus_duration_minutes: 'Focus timer length',
    break_duration_minutes: 'Break length',
    duration_minutes: 'Timer length',
    completed_seconds: 'Completed focus time',
    objective_count: 'Objectives in each quest',
    objective_target: 'Target to complete',
    reward_amount: 'Flies earned per claim',
    reward_count: 'Items earned per claim',
  };
  const number = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (['focus_duration_minutes', 'break_duration_minutes', 'duration_minutes'].includes(key)) {
    return { label: labels[key], value: `${number} min` };
  }
  if (key === 'completed_seconds') return { label: labels[key], value: `${number} sec` };
  if (key === 'objective_target') {
    if (objectiveType === 'focus_minutes') return { label: labels[key], value: `${number} min` };
    if (objectiveType === 'count') return { label: labels[key], value: `${number} tasks` };
    return { label: labels[key], value: number };
  }
  return { label: labels[key] ?? humanize(key), value: number };
}

function FeatureDetails({ event, breakdown, questMix }: { event: string; breakdown: EngagementBreakdown; questMix?: StatisticsData['engagement']['questObjectiveMix'] }) {
  const dimensions = breakdown.dimensions.filter((dimension) => {
    if (!OMIT_EMPTY_DIMENSIONS.has(dimension.key)) return true;
    return dimension.rows.some((row) => !['none', 'not_applicable', '0'].includes(row.value.toLowerCase()));
  });
  const byKey = new Map(dimensions.map((dimension) => [dimension.key, dimension]));
  const configuredGroups = DETAIL_GROUPS[event] ?? [{ title: 'Usage breakdown', keys: dimensions.map((item) => item.key) }];
  const groups = configuredGroups
    .map((group) => ({ ...group, dimensions: group.keys.flatMap((key) => byKey.get(key) ?? []) }))
    .filter((group) => group.dimensions.length > 0);
  const averageOrder = ['count', 'tag_count', 'focus_tag_count', 'checklist_count', 'streak_length', 'focus_duration_minutes', 'break_duration_minutes', 'duration_minutes', 'completed_seconds', 'objective_count', 'objective_target', 'reward_amount', 'reward_count'];
  const averages = [...breakdown.averages]
    .filter((average) => !(average.average === 0 && ['reward_amount', 'reward_count'].includes(average.key)))
    .sort((a, b) => averageOrder.indexOf(a.key) - averageOrder.indexOf(b.key));
  const actionLabel = event.includes('quest') || event.includes('reward') ? 'claims' : event.includes('timer') ? 'timer sessions' : 'task actions';
  const countLabel = event.includes('quest') || event.includes('reward') ? ['claim', 'claims'] : event.includes('timer') ? ['session', 'sessions'] : ['action', 'actions'];
  const objectiveType = byKey.get('objective_type')?.rows.length === 1
    ? byKey.get('objective_type')?.rows[0]?.value
    : undefined;

  return (
    <div className="border-t border-border/60 bg-muted/20 px-3 py-4">
      {event !== 'quest_objective_claimed' && averages.length > 0 ? (
        <div className="mb-5 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 xl:grid-cols-4">
          {averages.map((average) => (
            <div key={average.key} className="border-l-2 border-emerald-500 pl-3">
              <p className="text-[10px] font-bold text-muted-foreground">{readableAverage(average.key, average.average, objectiveType).label}</p>
              <p className="mt-0.5 text-lg font-black tabular-nums">{readableAverage(average.key, average.average, objectiveType).value}</p>
              <p className="text-[10px] text-muted-foreground">Based on {integer.format(average.samples)} {actionLabel}</p>
            </div>
          ))}
        </div>
      ) : null}
      {event === 'quest_objective_claimed' && questMix ? (
        <QuestObjectivePerformance rows={questMix} />
      ) : <div className="grid gap-x-8 gap-y-5 xl:grid-cols-2">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="mb-3 text-xs font-black">{group.title}</h3>
            <div className="space-y-4">
              {group.dimensions.map((dimension) => (
                <div key={dimension.key}>
                  <p className="mb-1.5 text-[10px] font-bold uppercase text-muted-foreground">{dimension.label}</p>
                  <div className="space-y-2">
                    {dimension.rows.map((item) => (
                      <div key={item.value}>
                        <div className="flex items-center justify-between gap-4 text-xs">
                          <span className="font-semibold">{readableDetailValue(dimension.key, item.value)}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {integer.format(item.events)} {item.events === 1 ? countLabel[0] : countLabel[1]} · {integer.format(item.users)} {item.users === 1 ? 'user' : 'users'}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
                          <div className="h-full bg-emerald-500" style={{ width: `${item.share}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>}
    </div>
  );
}

function QuestObjectivePerformance({ rows }: { rows: StatisticsData['engagement']['questObjectiveMix'] }) {
  if (!rows.length) return <EmptyState text="No detailed quest objective claims in this period." />;
  const trackLabel = (row: (typeof rows)[number]) => {
    if (row.placement === 'daily') return 'Daily quests';
    if (row.placement === 'category') return row.category && row.category !== 'uncategorized' ? `Focus · ${row.category}` : 'Focus quests';
    if (row.placement === 'onboarding') return 'Onboarding';
    return humanize(row.placement);
  };
  const targetLabel = (row: (typeof rows)[number]) => {
    const target = row.averageTarget.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (row.objectiveType === 'focus_minutes') return `${target} min`;
    if (row.objectiveType === 'count') return `${target} tasks`;
    return target;
  };
  const rewardLabel = (row: (typeof rows)[number]) => {
    const rewards: string[] = [];
    if (row.averageFlies > 0) rewards.push(`${row.averageFlies.toLocaleString()} flies`);
    if (row.averageItems > 0) rewards.push(`${row.averageItems.toLocaleString()} items`);
    return rewards.join(' + ') || humanize(row.rewardType);
  };

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <h3 className="text-xs font-black">Objective performance</h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Track, generated tier, requirement, and reward stay connected in each row.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[820px] divide-y divide-border">
          <div className="grid grid-cols-[150px_110px_minmax(210px,1fr)_90px_80px_80px_130px] gap-3 pb-2 text-[10px] font-bold uppercase text-muted-foreground">
            <span>Track</span><span>Tier</span><span>Objective</span><span className="text-right">Target</span><span className="text-right">Claims</span><span className="text-right">Users</span><span className="text-right">Avg reward</span>
          </div>
          {rows.map((row, index) => (
            <div key={`${row.placement}-${row.category}-${row.tier}-${row.objectiveType}-${index}`} className="grid grid-cols-[150px_110px_minmax(210px,1fr)_90px_80px_80px_130px] items-center gap-3 py-3 text-xs">
              <span className="font-bold">{trackLabel(row)}</span>
              <span className="font-semibold text-muted-foreground">{/^\d+$/.test(row.tier) ? `Tier ${row.tier}` : 'Not tiered'}</span>
              <span>
                <span className="block font-semibold">{readableDetailValue('objective_type', row.objectiveType)}</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">{readableDetailValue('objective_tag_mode', row.tagMode)}</span>
              </span>
              <span className="text-right font-bold tabular-nums">{targetLabel(row)}</span>
              <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.claims)}</span>
              <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.users)}</span>
              <span className="text-right font-semibold tabular-nums">{rewardLabel(row)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FriendsAnalytics({ data }: { data: StatisticsData }) {
  const friends = data.friends;
  const referralSteps = [
    { label: 'Invite links created', value: friends.referrals.created },
    { label: 'Share actions', value: friends.referrals.shared.events },
    { label: 'Referral links opened', value: friends.referrals.opened.events },
    { label: 'Invites claimed', value: friends.referrals.claimed },
  ];
  const referralMax = Math.max(1, ...referralSteps.map((step) => step.value));
  const sourceLabel = (source: string) => ({
    invite: 'Gift referral', code: 'Friend code', qr: 'QR code', suggestion: 'Suggestion', link: 'Shared link',
  }[source] ?? humanize(source));
  const methodLabel = (method: string) => ({
    native_share: 'System share sheet', copy_link: 'Copied link', copy_code: 'Copied friend code', link: 'Opened link',
  }[method] ?? humanize(method));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Users />} label="Friendships" value={integer.format(friends.network.totalFriendships)} detail={`${integer.format(friends.network.connectedUsers)} users have at least one friend`} />
        <Kpi icon={<TrendingUp />} label="New friendships" value={integer.format(friends.network.newFriendships)} detail={`${friends.network.averageFriends} average friends per connected user`} />
        <Kpi icon={<Target />} label="Referral conversion" value={`${friends.referrals.conversionRate}%`} detail={`${integer.format(friends.referrals.claimed)} claimed from ${integer.format(friends.referrals.created)} links created`} />
        <Kpi icon={<Activity />} label="Active buddy tasks" value={integer.format(friends.buddies.active)} detail={`${integer.format(friends.buddies.bothCompletedDays)} days completed by both buddies`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Referral sharing funnel" subtitle="Gift links used to bring another person into Frogress">
          <div className="space-y-4">
            {referralSteps.map((step, index) => (
              <div key={step.label}>
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="font-bold">{index + 1}. {step.label}</span>
                  <span className="tabular-nums text-muted-foreground">{integer.format(step.value)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-emerald-500" style={{ width: `${(step.value / referralMax) * 100}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-4">
            <InlineMetric label="People inviting" value={friends.referrals.inviters} />
            <InlineMetric label="With buddy task" value={friends.referrals.withBuddyTask} />
            <InlineMetric label="Unique openers" value={friends.referrals.opened.users} />
          </div>
        </Panel>

        <Panel title="How people share" subtitle="Successful share actions by surface and method">
          {friends.shareMethods.length ? (
            <DataTable
              headers={['Share type', 'Surface', 'Method', 'Shares', 'Users']}
              rows={friends.shareMethods.map((row) => [row.kind, humanize(row.surface), methodLabel(row.method), integer.format(row.shares), integer.format(row.users)])}
            />
          ) : <EmptyState text="Share-channel tracking begins with this version." />}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Friendships created" subtitle="Where successful friend connections came from">
          <DataTable headers={['Source', 'Friendships']} rows={friends.network.sources.map((row) => [sourceLabel(row.source), integer.format(row.friendships)])} />
        </Panel>
        <Panel title="Friend requests" subtitle="Request outcomes and response speed by discovery source">
          <DataTable
            headers={['Source', 'Sent', 'Accepted', 'Declined', 'Pending', 'Accept rate', 'Avg response']}
            rows={friends.friendRequests.map((row) => [sourceLabel(row.source), integer.format(row.sent), integer.format(row.accepted), integer.format(row.declined), integer.format(row.pending), `${row.acceptanceRate}%`, row.averageResponseHours ? `${row.averageResponseHours}h` : '-'])}
          />
        </Panel>
      </div>

      <Panel title="Buddy-task collaboration" subtitle="Invites, shared schedules, completion activity, and sustained use">
        <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          <InlineMetric label="Invites sent" value={friends.buddies.invites} />
          <InlineMetric label="Accepted" value={friends.buddies.accepted} />
          <InlineMetric label="Buddy completions" value={friends.buddies.taskCompletions} />
          <InlineMetric label="Active completers" value={friends.buddies.completers} />
        </div>
        <DataTable
          headers={['Schedule', 'Invites', 'Accepted', 'Declined', 'Pending', 'Avg streak']}
          rows={friends.buddies.schedules.map((row) => [humanize(row.schedule), integer.format(row.invites), integer.format(row.accepted), integer.format(row.declined), integer.format(row.pending), `${row.averageStreak} days`])}
        />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Referral gift performance" subtitle="Which selected gifts lead to claimed invitations">
          <DataTable
            headers={['Gift option', 'Links created', 'Claimed', 'Conversion']}
            rows={friends.referrals.byGift.map((row) => [humanize(row.giftOption), integer.format(row.created), integer.format(row.claimed), `${row.created ? Math.round((row.claimed / row.created) * 1000) / 10 : 0}%`])}
          />
        </Panel>
        <Panel title="Friend reward economy" subtitle="Flies earned from friend activity and doubled friend rewards">
          <div className="grid grid-cols-2 gap-5">
            <InlineMetric label="Flies earned" value={friends.rewards.flies} />
            <InlineMetric label="Reward actions" value={friends.rewards.actions} />
            <InlineMetric label="Recipients" value={friends.rewards.users} />
            <InlineMetric label="Avg flies / user" value={friends.rewards.averagePerUser} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

const FLY_SOURCE_LABELS: Record<string, string> = {
  task: 'Task completions',
  buddy_task: 'Buddy task completions',
  quest: 'Quest objectives',
  quest_objective: 'Quest objectives',
  quest_streak: 'Quest streak rewards',
  daily_reward: 'Login calendar',
  season: 'Season track',
  login_streak: 'Login streak',
  rewarded_ad: 'Rewarded ads',
  rewarded_ad_double: 'Doubled rewards from ads',
  cross_platform_gift: 'Cross-platform gift',
  friend_activity: 'Friend activity',
  friend_reward_double: 'Doubled friend rewards',
  background_sale: 'Background sales',
  skin_sale: 'Skin sales',
};

function FlySourceBreakdown({ rows, questRows, seasonRows, skinRows }: {
  rows: StatisticsData['economy']['flySources'];
  questRows: StatisticsData['engagement']['questObjectiveMix'];
  seasonRows: StatisticsData['economy']['seasons'];
  skinRows: StatisticsData['economy']['skins'];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!rows.length) return <EmptyState text="No gameplay flies earned in this period." />;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px] divide-y divide-border">
        <div className="grid grid-cols-[minmax(180px,1fr)_90px_90px_80px_100px_100px_100px_28px] gap-2 pb-2 text-[10px] font-bold uppercase text-muted-foreground">
          <span>Source</span><span className="text-right">Flies</span><span className="text-right">Actions</span><span className="text-right">Users</span><span className="text-right">Avg / action</span><span className="text-right">Avg / user</span><span className="text-right">Fly share</span><span />
        </div>
        {rows.map((row) => {
          const open = expanded === row.source;
          return (
            <div key={row.source}>
              <button
                type="button"
                className="grid w-full grid-cols-[minmax(180px,1fr)_90px_90px_80px_100px_100px_100px_28px] items-center gap-2 py-3 text-left text-xs hover:bg-muted/30"
                onClick={() => setExpanded(open ? null : row.source)}
                aria-expanded={open}
              >
                <span className="font-bold">{FLY_SOURCE_LABELS[row.source] ?? humanize(row.source)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.flies)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.events)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.users)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.averagePerEvent)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.averagePerUser)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{row.shareOfFlies}%</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open ? (
                <div className="border-t border-border/60 bg-muted/20 px-3 py-4">
                  <h3 className="mb-3 text-xs font-black">Free and Plus breakdown</h3>
                  <DataTable
                    headers={['Account', 'Flies', 'Actions', 'Users', 'Avg / action', 'Avg / user']}
                    rows={[...row.tiers]
                      .sort((a, b) => a.tier.localeCompare(b.tier))
                      .map((tier) => [tier.tier === 'premium' ? 'Plus' : 'Free', integer.format(tier.flies), integer.format(tier.events), integer.format(tier.users), integer.format(tier.averagePerEvent), integer.format(tier.averagePerUser)])}
                  />
                  {(row.source === 'quest' || row.source === 'quest_objective') ? (
                    <div className="mt-5 border-t border-border/60 pt-5">
                      <QuestObjectivePerformance rows={questRows.filter((quest) => quest.averageFlies > 0)} />
                    </div>
                  ) : null}
                  {row.source === 'season' ? (
                    <div className="mt-5 border-t border-border/60 pt-5">
                      <h3 className="mb-3 text-xs font-black">Season and reward day</h3>
                      <SeasonRewardPerformance rows={seasonRows.filter((season) => season.flies > 0)} />
                    </div>
                  ) : null}
                  {row.source === 'skin_sale' ? (
                    <div className="mt-5 border-t border-border/60 pt-5">
                      <SkinSaleRarityPerformance rows={skinRows.filter((skin) => skin.action === 'sold')} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RARITY_SWATCHES: Record<string, string> = {
  common: 'bg-slate-400',
  uncommon: 'bg-emerald-500',
  rare: 'bg-sky-500',
  epic: 'bg-violet-500',
  legendary: 'bg-amber-500',
  unknown: 'bg-zinc-400',
};
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'unknown'];

function SkinSaleRarityPerformance({ rows }: { rows: StatisticsData['economy']['skins'] }) {
  if (!rows.length) return <EmptyState text="No skin sales with fly returns in this period." />;
  return (
    <div>
      <h3 className="mb-3 text-xs font-black">Sales by rarity</h3>
      <div className="overflow-x-auto">
        <div className="min-w-[650px] divide-y divide-border">
          <div className="grid grid-cols-[minmax(150px,1fr)_90px_100px_80px_80px_120px] gap-3 pb-2 text-[10px] font-bold uppercase text-muted-foreground">
            <span>Rarity</span><span>Account</span><span className="text-right">Sales</span><span className="text-right">Items</span><span className="text-right">Users</span><span className="text-right">Flies returned</span>
          </div>
          {[...rows]
            .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.tier.localeCompare(b.tier))
            .map((row, index) => (
              <div key={`${row.rarity}-${row.tier}-${index}`} className="grid grid-cols-[minmax(150px,1fr)_90px_100px_80px_80px_120px] items-center gap-3 py-3 text-xs">
                <span className="flex items-center gap-2 font-bold"><span className={`h-3 w-3 shrink-0 rounded-sm ${RARITY_SWATCHES[row.rarity] ?? RARITY_SWATCHES.unknown}`} />{humanize(row.rarity)}</span>
                <span className="font-semibold text-muted-foreground">{row.tier === 'premium' ? 'Plus' : 'Free'}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.transactions)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.items)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.users)}</span>
                <span className="text-right font-bold tabular-nums">{integer.format(row.flies)}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function SkinMarketBreakdown({ rows }: { rows: StatisticsData['economy']['skins'] }) {
  if (!rows.length) return <EmptyState text="No skin purchases or sales in this period." />;
  const purchases = rows.filter((row) => row.action === 'purchased');
  const sales = rows.filter((row) => row.action === 'sold');
  const total = (items: typeof rows, key: 'transactions' | 'items' | 'flies') => items.reduce((sum, row) => sum + row[key], 0);

  const section = (title: string, subtitle: string, items: typeof rows, fliesLabel: string) => (
    <div>
      <div className="mb-3">
        <h3 className="text-xs font-black">{title}</h3>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
      {items.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[660px] divide-y divide-border">
            <div className="grid grid-cols-[minmax(150px,1fr)_90px_100px_80px_80px_110px] gap-3 pb-2 text-[10px] font-bold uppercase text-muted-foreground">
              <span>Rarity</span><span>Account</span><span className="text-right">Transactions</span><span className="text-right">Items</span><span className="text-right">Users</span><span className="text-right">{fliesLabel}</span>
            </div>
            {[...items]
              .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.tier.localeCompare(b.tier))
              .map((row, index) => (
                <div key={`${title}-${row.rarity}-${row.tier}-${index}`} className="grid grid-cols-[minmax(150px,1fr)_90px_100px_80px_80px_110px] items-center gap-3 py-3 text-xs">
                  <span className="flex items-center gap-2 font-bold"><span className={`h-3 w-3 shrink-0 rounded-sm ${RARITY_SWATCHES[row.rarity] ?? RARITY_SWATCHES.unknown}`} />{humanize(row.rarity)}</span>
                  <span className="font-semibold text-muted-foreground">{row.tier === 'premium' ? 'Plus' : 'Free'}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.transactions)}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.items)}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.users)}</span>
                  <span className="text-right font-bold tabular-nums">{integer.format(row.flies)}</span>
                </div>
              ))}
          </div>
        </div>
      ) : <EmptyState text={`No ${title.toLowerCase()} in this period.`} />}
    </div>
  );

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <InlineMetric label="Shop purchases" value={total(purchases, 'transactions')} />
        <InlineMetric label="Flies spent" value={total(purchases, 'flies')} />
        <InlineMetric label="Items sold back" value={total(sales, 'items')} />
        <InlineMetric label="Flies returned" value={total(sales, 'flies')} />
      </div>
      <div className="grid gap-7 xl:grid-cols-2">
        {section('Bought from the shop', 'Flies removed from the economy', purchases, 'Flies spent')}
        {section('Sold back by users', 'Flies returned to users at the resale value', sales, 'Flies returned')}
      </div>
    </div>
  );
}

function SeasonRewardPerformance({ rows }: { rows: StatisticsData['economy']['seasons'] }) {
  if (!rows.length) return <EmptyState text="No season rewards claimed in this period." />;
  return (
    <DataTable
      headers={['Season', 'Day', 'Account', 'Claims', 'Users', 'Flies', 'Items', 'Avg flies / claim']}
      rows={[...rows]
        .sort((a, b) => a.seasonName.localeCompare(b.seasonName) || a.day - b.day || a.tier.localeCompare(b.tier))
        .map((row) => [
          row.seasonId === 'unknown' ? 'Older data' : row.seasonName,
          row.day > 0 ? `Day ${row.day}` : 'Not recorded',
          row.tier === 'premium' ? 'Plus' : 'Free',
          integer.format(row.claims),
          integer.format(row.users),
          integer.format(row.flies),
          integer.format(row.items),
          integer.format(row.averageFlies),
        ])}
    />
  );
}

function Economy({ data }: { data: StatisticsData }) {
  const free = data.economy.flyEarning.free;
  const premium = data.economy.flyEarning.premium;
  const returns = data.economy.skins
    .filter((row) => row.action === 'sold')
    .reduce((sum, row) => sum + row.flies, 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<TrendingUp />} label="Free flies / user" value={integer.format(free.averagePerUser)} detail={`${integer.format(free.flies)} gameplay flies earned`} />
        <Kpi icon={<TrendingUp />} label="Plus flies / user" value={integer.format(premium.averagePerUser)} detail={`${integer.format(premium.flies)} gameplay flies earned`} />
        <Kpi icon={<CircleDollarSign />} label="Flies spent" value={integer.format(data.economy.flySpending.total)} detail="All tracked economy sinks" />
        <Kpi icon={<CircleDollarSign />} label="Resale returns" value={integer.format(returns)} detail="Flies returned from sales" />
      </div>

      <Panel title="Fly earning by source" subtitle="Gameplay earnings only; expand a source for its Free and Plus payout split">
        <FlySourceBreakdown
          rows={data.economy.flySources}
          questRows={data.engagement.questObjectiveMix}
          seasonRows={data.economy.seasons}
          skinRows={data.economy.skins}
        />
      </Panel>

      <div className="grid gap-5">
        <Panel title="Free vs Plus earning" subtitle="Average per earning action and per unique earner">
          <DataTable
            headers={['Tier', 'Flies', 'Events', 'Users', 'Avg / event', 'Avg / user']}
            rows={(['free', 'premium'] as const).map((tier) => {
              const row = data.economy.flyEarning[tier];
              return [humanize(tier), integer.format(row.flies), integer.format(row.events), integer.format(row.users), integer.format(row.averagePerEvent), integer.format(row.averagePerUser)];
            })}
          />
        </Panel>
      </div>

      <Panel title="Fly spending by sink" subtitle="Cosmetics, backgrounds, streak freezes, and frog hunger">
        <DataTable
          headers={['Sink', 'Tier', 'Flies', 'Events', 'Users', 'Avg / user']}
          rows={data.economy.flySpending.sources.map((row) => [humanize(row.source), humanize(row.tier), integer.format(row.flies), integer.format(row.events), integer.format(row.users), integer.format(row.averagePerUser)])}
        />
      </Panel>

      <Panel title="Skin purchases and sales by rarity" subtitle="Compare what users buy with what they sell back, including Free and Plus activity">
        <SkinMarketBreakdown rows={data.economy.skins} />
      </Panel>

      <Panel title="Catalog price structure" subtitle="Current purchasable cosmetics and backgrounds by rarity">
        <DataTable
          headers={['Rarity', 'Items', 'Average price', 'Minimum', 'Maximum']}
          rows={data.economy.catalogRarities.map((row) => [humanize(row.rarity), integer.format(row.items), integer.format(row.averagePrice), integer.format(row.minimumPrice), integer.format(row.maximumPrice)])}
        />
      </Panel>

      <Panel title="Trade-up economy" subtitle="Five same-rarity items are consumed for one item at the next rarity">
        <DataTable
          headers={['Tier', 'Upgrade', 'Trades', 'Traders', 'Avg / trader']}
          rows={data.economy.trades.map((row) => [humanize(row.tier), `${humanize(row.fromRarity)} to ${humanize(row.toRarity)}`, integer.format(row.trades), integer.format(row.users), row.averagePerTrader.toFixed(1)])}
        />
      </Panel>

      <Panel title="Season reward output" subtitle="Claims by season, reward day, and account tier">
        <SeasonRewardPerformance rows={data.economy.seasons} />
      </Panel>

    </div>
  );
}

function PaywallTriggerBreakdown({ rows }: { rows: StatisticsData['paywallPlacements'] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!rows.length) return <EmptyState text="No paywall views in this period." />;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[820px] divide-y divide-border">
        <div className="grid grid-cols-[minmax(180px,1fr)_70px_80px_70px_80px_80px_60px_90px_28px] gap-2 pb-2 text-[10px] font-bold uppercase text-muted-foreground">
          <span>Trigger</span><span className="text-right">Views</span><span className="text-right">Viewers</span><span className="text-right">Starts</span><span className="text-right">Completed</span><span className="text-right">Cancelled</span><span className="text-right">Failed</span><span className="text-right">View to buy</span><span />
        </div>
        {rows.map((row) => {
          const open = expanded === row.placement;
          return (
            <div key={row.placement}>
              <button
                type="button"
                className="grid w-full grid-cols-[minmax(180px,1fr)_70px_80px_70px_80px_80px_60px_90px_28px] items-center gap-2 py-3 text-left text-xs hover:bg-muted/30"
                onClick={() => setExpanded(open ? null : row.placement)}
                aria-expanded={open}
              >
                <span className="font-bold">{humanize(row.placement)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.views)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.viewers)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.starts)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.completed)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.cancelled)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{integer.format(row.failed)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{row.conversionRate}%</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open ? (
                <div className="border-t border-border/60 bg-muted/20 px-4 py-4">
                  <div className="mb-3 flex items-baseline justify-between gap-4">
                    <h3 className="text-xs font-black">Plus popup progression</h3>
                    <span className="text-[10px] font-medium text-muted-foreground">Percentages use unique viewers</span>
                  </div>
                  <div className="space-y-3">
                    {row.steps.map((step) => (
                      <div key={step.step} className="grid grid-cols-[140px_1fr_210px] items-center gap-4 text-xs">
                        <span className="font-bold">{step.step}. {step.label}</span>
                        <div className="h-2 overflow-hidden rounded bg-muted">
                          <div className="h-full bg-emerald-500" style={{ width: `${step.reachRate}%` }} />
                        </div>
                        <span className="text-right tabular-nums text-muted-foreground">
                          {integer.format(step.users)} users · {step.reachRate}% of viewers
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-4 border-t border-border/60 pt-4">
                    <InlineMetric label="Checkout starts" value={row.starts} />
                    <InlineMetric label="Completed" value={row.completed} />
                    <InlineMetric label="Cancelled" value={row.cancelled} />
                    <InlineMetric label="Failed" value={row.failed} />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Revenue({ data }: { data: StatisticsData }) {
  const m = data.monetization;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<CircleDollarSign />} label="Total gross revenue" value={money.format(m.grossRevenue + data.economy.flyShop.revenue)} detail={`${money.format(m.grossRevenue)} subscriptions + ${money.format(data.economy.flyShop.revenue)} fly packs`} />
        <Kpi icon={<TrendingUp />} label="Est. proceeds" value={money.format(m.estimatedProceeds)} detail="After reported tax and commission" />
        <Kpi icon={<Target />} label="Purchase conversion" value={`${m.purchaseConversion}%`} detail={`${m.purchaseCompletions} completed / ${m.purchaseStarts} started`} />
        <Kpi icon={<Users />} label="Active Plus" value={integer.format(data.overview.activePremium)} detail={`${m.subscriptionsStarted} new subscriptions`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Paywall funnel" subtitle="Custom Plus paywall interactions">
          <Funnel rows={[
            { key: 'views', label: 'Paywall viewers', users: m.paywallViewers, rate: 100 },
            { key: 'starts', label: 'Purchase started', users: m.purchaseStartUsers, rate: m.paywallViewers ? Math.round((m.purchaseStartUsers / m.paywallViewers) * 1000) / 10 : 0 },
            { key: 'complete', label: 'Purchase completed', users: m.purchaseCompletionUsers, rate: m.purchaseConversion },
          ]} />
        </Panel>
        <Panel title="Subscription lifecycle" subtitle="Authoritative RevenueCat webhook events">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <InlineMetric label="Started" value={m.subscriptionsStarted} />
            <InlineMetric label="Renewed" value={m.renewals} />
            <InlineMetric label="Cancelled" value={m.cancellations} />
            <InlineMetric label="Expired" value={m.expirations} />
            <InlineMetric label="Billing issues" value={m.billingIssues} />
            <InlineMetric label="Refunds" value={m.refunds} />
          </div>
        </Panel>
      </div>

      <Panel title="Paywall conversion by trigger" subtitle="The action that opened Plus, followed through to purchase outcomes">
        <PaywallTriggerBreakdown rows={data.paywallPlacements} />
      </Panel>

      <Panel title="Real-money Fly Shop" subtitle="RevenueCat custom-package funnel and production transaction revenue">
        <div className="mb-4 grid grid-cols-3 gap-3">
          <InlineMetric label="Shop viewers" value={data.economy.flyShop.views.users} />
          <InlineMetric label="Purchases" value={data.economy.flyShop.completedPurchases} />
          <div className="border-l-2 border-emerald-500 pl-3"><p className="text-[11px] font-bold text-muted-foreground">Revenue</p><p className="mt-0.5 text-xl font-black tabular-nums">{money.format(data.economy.flyShop.revenue)}</p></div>
        </div>
        <DataTable
          headers={['Pack', 'Stage', 'Events', 'Users', 'Flies', 'Revenue']}
          rows={data.economy.flyShop.packs.map((row) => [humanize(row.packId), humanize(row.stage), integer.format(row.events), integer.format(row.users), integer.format(row.flies), money.format(row.revenue)])}
        />
      </Panel>

      <Panel title="Rewarded ad performance" subtitle="Requests, impressions, and outcomes by placement">
        {data.ads.length ? (
          <DataTable
            headers={['Placement', 'Requests', 'Impressions', 'Completed', 'Dismissed', 'Failed', 'Completion']}
            rows={data.ads.map((row) => [
              humanize(row.placement),
              integer.format(row.requested),
              integer.format(row.impressions),
              integer.format(row.completed),
              integer.format(row.dismissed),
              integer.format(row.failed),
              `${row.completionRate}%`,
            ])}
          />
        ) : <EmptyState text="No rewarded ad events in this period." />}
        <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-medium text-amber-900 dark:text-amber-200">
          Ad revenue is intentionally not estimated here. Connect AdMob impression-level paid events or its reporting API before using revenue, eCPM, or LTV figures.
        </div>
      </Panel>
    </div>
  );
}

function Acquisition({ data }: { data: StatisticsData }) {
  const tryFunnel = data.tryFunnel.map((row, index, rows) => ({
    ...row,
    rate: index === 0
      ? 100
      : rows[index - 1].users
        ? Math.round((row.users / rows[index - 1].users) * 1000) / 10
        : 0,
  }));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Users />} label="New accounts" value={integer.format(data.overview.newUsers)} detail="Created in selected period" />
        <Kpi icon={<Activity />} label="Monthly active" value={integer.format(data.overview.mau)} detail="Rolling 30-day unique users" />
        <Kpi icon={<CalendarDays />} label="Sessions" value={integer.format(data.overview.sessions)} detail="App opens in selected period" />
        <Kpi icon={<Eye />} label="Page views" value={integer.format(data.pages.reduce((sum, row) => sum + row.views, 0))} detail="Tracked navigation events" />
      </div>
      <Panel title="New accounts and active users" subtitle="Daily acquisition compared with product activity">
        <BarTrend rows={data.series} valueKey="activeUsers" secondaryKey="newUsers" />
      </Panel>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Acquisition sources" subtitle="UTM source from the first app open in a session">
          {data.sources.length ? (
            <DataTable headers={['Source', 'Sessions', 'Users']} rows={data.sources.map((row) => [row.source || 'direct', integer.format(row.sessions), integer.format(row.users)])} />
          ) : <EmptyState text="No attributed sessions in this period." />}
        </Panel>
        <Panel title="Platforms" subtitle="Unique active users by observed platform">
          <DataTable headers={['Platform', 'Users', 'Events']} rows={data.platforms.map((row) => [humanize(row.platform), integer.format(row.users), integer.format(row.events)])} />
        </Panel>
      </div>
      <Panel title="Activation milestones" subtitle="Use the largest drop to prioritize onboarding improvements">
        <Funnel rows={data.funnel} />
      </Panel>
      <Panel title="/try ad funnel" subtitle="Landing-page progression for paid acquisition traffic">
        <Funnel rows={tryFunnel} />
      </Panel>
    </div>
  );
}

function Kpi({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="truncate text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-black tabular-nums tracking-tight md:text-3xl">{value}</p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground" title={detail}>{detail}</p>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="mb-4">
        <h2 className="text-sm font-black tracking-tight md:text-base">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[11px] font-medium text-muted-foreground md:text-xs">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function BarTrend({ rows, valueKey, secondaryKey }: {
  rows: StatisticsData['series'];
  valueKey: keyof StatisticsData['series'][number];
  secondaryKey?: keyof StatisticsData['series'][number];
}) {
  const visible = useMemo(() => rows.length > 100 ? rows.filter((_, index) => index % Math.ceil(rows.length / 90) === 0 || index === rows.length - 1) : rows, [rows]);
  const maximum = Math.max(1, ...visible.flatMap((row) => [Number(row[valueKey]), secondaryKey ? Number(row[secondaryKey]) : 0]));
  return (
    <div>
      <div className="flex h-44 items-end gap-px overflow-hidden border-b border-border pt-3">
        {visible.map((row) => (
          <div key={row.date} className="group relative flex h-full min-w-0 flex-1 items-end gap-px" title={`${row.date}: ${row[valueKey]}${secondaryKey ? ` / ${row[secondaryKey]}` : ''}`}>
            <div className="w-full min-w-[2px] bg-emerald-500/75 transition-colors group-hover:bg-emerald-500" style={{ height: `${Math.max(2, (Number(row[valueKey]) / maximum) * 100)}%` }} />
            {secondaryKey ? <div className="w-full min-w-[2px] bg-amber-500/75" style={{ height: `${Math.max(2, (Number(row[secondaryKey]) / maximum) * 100)}%` }} /> : null}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-medium text-muted-foreground">
        <span>{rows[0]?.date ?? ''}</span>
        <span>Peak {integer.format(maximum)}</span>
        <span>{rows.at(-1)?.date ?? ''}</span>
      </div>
    </div>
  );
}

function Funnel({ rows }: { rows: Array<{ key: string; label: string; users: number; rate: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.users));
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.key}>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs">
            <span className="font-bold">{row.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {integer.format(row.users)}{index > 0 ? ` · ${row.rate}%` : ''}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-muted">
            <div className="h-full bg-emerald-500" style={{ width: `${Math.max(row.users ? 3 : 0, (row.users / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function InlineMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-l-2 border-emerald-500 pl-3">
      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-black tabular-nums">{integer.format(value)}</p>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<string>> }) {
  if (!rows.length) return <EmptyState text="No events in this period." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
            {headers.map((header, index) => <th key={header} className={`pb-2 font-bold ${index ? 'text-right' : ''}`}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${row[0]}-${rowIndex}`} className="border-b border-border/60 last:border-0">
              {row.map((cell, index) => <td key={`${index}-${cell}`} className={`py-2.5 ${index ? 'text-right tabular-nums text-muted-foreground' : 'font-semibold'}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoverageNote({ coverage }: { coverage: StatisticsData['coverage'] }) {
  return (
    <div className="mt-5 flex flex-col gap-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-[10px] font-medium text-muted-foreground md:flex-row md:justify-between">
      <span>Analytics coverage: {coverage.firstEventAt ? `since ${new Date(coverage.firstEventAt).toLocaleDateString()}` : 'awaiting first event'}</span>
      <span>UTC reporting · {coverage.retentionDays}-day event retention · aggregate admin views only</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-border p-6 text-center text-xs font-medium text-muted-foreground">{text}</div>;
}

function DashboardSkeleton() {
  return (
    <div className="mt-5 space-y-5 animate-pulse">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 rounded-md bg-muted" />)}
      </div>
      <div className="h-64 rounded-md bg-muted" />
      <div className="grid gap-5 lg:grid-cols-2"><div className="h-64 rounded-md bg-muted" /><div className="h-64 rounded-md bg-muted" /></div>
    </div>
  );
}

function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
