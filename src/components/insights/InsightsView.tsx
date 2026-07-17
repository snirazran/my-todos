'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Focus,
  Leaf,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { cn } from '@/lib/utils';

type DailyPoint = { date: string; planned: number; completed: number; focusSeconds: number };
type TimelinePoint = DailyPoint & { from: string; to: string };
type InsightData = {
  range: { days: number; from: string; to: string; previousFrom: string; previousTo: string };
  profile: { name: string | null; frogName: string | null };
  summary: {
    planned: number;
    completed: number;
    focusSeconds: number;
    activeDays: number;
    bestRun: number;
    completionRate: number;
    completionDelta: number;
    focusDelta: number | null;
    headline: string;
    message: string;
  };
  timeline: TimelinePoint[];
  daily: DailyPoint[];
  weekdayPatterns: Array<{
    day: number;
    name: string;
    short: string;
    planned: number;
    completed: number;
    rate: number;
    focusSeconds: number;
  }>;
  tags: Array<{ id: string; name: string; color: string; planned: number; completed: number; rate: number }>;
  habits: Array<{
    id: string;
    title: string;
    completed: number;
    scheduled: number;
    rate: number;
    streak: number;
    recent: Array<{ date: string; completed: boolean }>;
  }>;
  signals: Array<{
    tone: 'positive' | 'watch' | 'neutral';
    eyebrow: string;
    title: string;
    body: string;
  }>;
  nextStep: { title: string; body: string; href: string; action: string };
  patternDays: number;
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('We could not load your patterns');
  return response.json() as Promise<InsightData>;
};

const numberFormat = new Intl.NumberFormat();
function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${numberFormat.format(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${numberFormat.format(hours)}h ${numberFormat.format(remainder)}m` : `${numberFormat.format(hours)}h`;
}

function formatDate(dayKey: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${dayKey}T12:00:00`));
}

export function InsightsView({ days }: { days: 7 | 30 | 90 }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const { data, error, isLoading, mutate } = useSWR<InsightData>(
    user ? `/api/insights?days=${days}&timezone=${encodeURIComponent(timezone)}` : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, router, user]);

  if (authLoading || (!data && isLoading)) return <InsightsSkeleton />;
  if (!user) return null;
  if (error || !data) return <InsightsError onRetry={() => mutate()} />;

  return (
    <div className="relative isolate min-h-[100dvh] overflow-x-hidden bg-[#f3f6f1] pb-10 dark:bg-[#0d1711] md:pb-14">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 -top-28 h-80 w-80 rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-500/10" />
        <div className="absolute -right-28 top-16 h-96 w-96 rounded-full bg-sky-200/25 blur-3xl dark:bg-sky-500/[0.07]" />
      </div>
      <div className="mx-auto w-full max-w-6xl px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-8 md:pt-8">
        <header className="relative overflow-hidden rounded-[28px] border border-white/50 bg-white/[0.88] px-5 pb-5 pt-4 shadow-[0_18px_60px_rgba(25,61,35,0.14)] backdrop-blur-xl dark:border-white/10 dark:bg-[#13201a]/[0.92] md:flex md:items-center md:justify-between md:gap-8 md:px-8 md:py-7">
          <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-emerald-300/20 blur-2xl" aria-hidden="true" />
          <div className="relative flex min-w-0 flex-1 items-start gap-3">
            <Link
              href="/"
              aria-label="Back to Today"
              className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-950/5 text-foreground transition-[background-color,transform] hover:bg-emerald-950/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-white/10 dark:hover:bg-white/15"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#4f9149] dark:text-emerald-400">Your Patterns</p>
              <h1 className="mt-0.5 text-balance text-2xl font-black tracking-[-0.035em] text-foreground md:text-4xl">
                See what’s working
              </h1>
              <p className="mt-1 max-w-2xl text-pretty text-sm font-medium leading-relaxed text-muted-foreground md:text-base">
                A simple view of your habits, focus, and follow-through—made from your real activity.
              </p>
            </div>
          </div>
          <nav className="relative mt-5 grid grid-cols-3 rounded-2xl bg-emerald-950/[0.055] p-1 dark:bg-white/[0.06] md:ml-auto md:mt-0 md:w-72" aria-label="Insights time range">
            {([7, 30, 90] as const).map((range) => (
              <Link
                key={range}
                href={`/insights?days=${range}`}
                aria-current={days === range ? 'page' : undefined}
                className={cn(
                  'rounded-xl px-3 py-2 text-center text-xs font-black transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  days === range
                    ? 'bg-card text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {range === 7 ? '7 Days' : range === 30 ? '30 Days' : '3 Months'}
              </Link>
            ))}
          </nav>
        </header>

        {data.summary.planned === 0 ? (
          <EmptyInsights />
        ) : (
          <div className="mt-5 space-y-5 md:mt-7 md:space-y-7">
            <SummaryHero data={data} />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
              <ProgressChart data={data} days={days} />
              <MetricStack data={data} />
            </div>
            <SignalsSection signals={data.signals} patternDays={data.patternDays} />
            <div className="grid gap-5 lg:grid-cols-2">
              <WeekdayRhythm data={data} />
              <HabitSection habits={data.habits} patternDays={data.patternDays} />
            </div>
            {data.tags.length > 0 ? <TagSection tags={data.tags} patternDays={data.patternDays} /> : null}
            <NextStepCard nextStep={data.nextStep} />
            <DailyHistory daily={data.daily} />
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryHero({ data }: { data: InsightData }) {
  const rate = data.summary.completionRate;
  const rangeLabel = data.range.days === 7 ? 'this week' : `in the last ${data.range.days} days`;
  return (
    <section className="relative overflow-hidden rounded-[28px] bg-[#163f2c] px-5 py-6 text-white shadow-[0_16px_40px_rgba(18,65,42,0.22)] md:px-8 md:py-8" aria-labelledby="summary-heading">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(134,239,172,0.24),transparent_35%),linear-gradient(135deg,transparent,rgba(255,255,255,0.04))]" aria-hidden="true" />
      <div className="relative grid items-center gap-6 md:grid-cols-[1fr_auto]">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-100 ring-1 ring-white/10">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Your Check-In
          </div>
          <h2 id="summary-heading" className="mt-3 text-balance text-2xl font-black tracking-[-0.035em] md:text-4xl">
            {data.summary.headline}
          </h2>
          <p className="mt-2 max-w-xl text-pretty text-sm font-medium leading-relaxed text-emerald-50/80 md:text-base">
            {data.summary.message}
          </p>
          <p className="mt-4 text-xs font-bold text-emerald-100/65">
            Based on {numberFormat.format(data.summary.planned)} planned tasks {rangeLabel}
          </p>
        </div>
        <div
          role="img"
          aria-label={`${rate}% of planned tasks completed`}
          className="relative mx-auto grid h-36 w-36 shrink-0 place-items-center rounded-full md:h-40 md:w-40"
          style={{ background: `conic-gradient(#86efac ${rate * 3.6}deg, rgba(255,255,255,0.13) 0deg)` }}
        >
          <div className="grid h-[116px] w-[116px] place-items-center rounded-full bg-[#163f2c] text-center md:h-[132px] md:w-[132px]">
            <div>
              <span className="block text-4xl font-black tabular-nums tracking-[-0.05em]">{rate}%</span>
              <span className="mt-0.5 block text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100/70">Completed</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricStack({ data }: { data: InsightData }) {
  const delta = data.summary.completionDelta;
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Target;
  return (
    <section className="grid grid-cols-3 gap-2 lg:grid-cols-1" aria-label="At a glance">
      <MetricCard
        icon={<Check className="h-5 w-5" aria-hidden="true" />}
        tone="green"
        value={`${numberFormat.format(data.summary.completed)}/${numberFormat.format(data.summary.planned)}`}
        label="Tasks Finished"
        detail={delta === 0 ? 'Same pace as before' : `${Math.abs(delta)} points ${delta > 0 ? 'higher' : 'lower'} than before`}
        compactDetail
      />
      <MetricCard
        icon={<Focus className="h-5 w-5" aria-hidden="true" />}
        tone="violet"
        value={formatDuration(data.summary.focusSeconds)}
        label="Focus Time"
        detail="Time spent in focus sessions"
      />
      <MetricCard
        icon={<DeltaIcon className="h-5 w-5" aria-hidden="true" />}
        tone="amber"
        value={numberFormat.format(data.summary.bestRun)}
        label="Best Run"
        detail={data.summary.bestRun === 1 ? 'Day with a completed task' : 'Days in a row with a win'}
      />
    </section>
  );
}

function MetricCard({
  icon,
  tone,
  value,
  label,
  detail,
  compactDetail = false,
}: {
  icon: React.ReactNode;
  tone: 'green' | 'violet' | 'amber';
  value: string;
  label: string;
  detail: string;
  compactDetail?: boolean;
}) {
  const toneClass = {
    green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  }[tone];
  return (
    <div className="min-w-0 rounded-2xl border border-border/[0.55] bg-card/[0.92] p-3 shadow-sm backdrop-blur-md md:p-4 lg:flex lg:items-center lg:gap-4">
      <div className={cn('grid h-9 w-9 place-items-center rounded-xl lg:h-11 lg:w-11', toneClass)}>{icon}</div>
      <div className="mt-2 min-w-0 lg:mt-0">
        <p className="text-xl font-black tabular-nums tracking-[-0.04em] text-foreground md:text-2xl">{value}</p>
        <p className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground md:text-[11px]">{label}</p>
        <p className={cn('mt-0.5 hidden text-xs font-medium text-muted-foreground lg:block', compactDetail && 'text-[11px]')}>{detail}</p>
      </div>
    </div>
  );
}

function ProgressChart({ data, days }: { data: InsightData; days: 7 | 30 | 90 }) {
  const maxPlanned = Math.max(1, ...data.timeline.map((point) => point.planned));
  const label = days === 7 ? 'Daily follow-through' : 'Weekly follow-through';
  return (
    <section className="rounded-[24px] border border-border/[0.55] bg-card/[0.92] p-5 shadow-sm backdrop-blur-md md:p-6" aria-labelledby="progress-heading">
      <SectionHeading
        icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
        eyebrow={days === 7 ? 'This Week' : days === 30 ? 'Last 30 Days' : 'Last 3 Months'}
        title={label}
        description="Green shows what you finished. The full bar is what you planned."
        id="progress-heading"
      />
      <div className="mt-6 flex h-44 items-end gap-2 border-b border-border/60 px-1 md:gap-3" role="img" aria-label={`${label} chart`}>
        {data.timeline.map((point) => {
          const plannedHeight = Math.max(point.planned > 0 ? 8 : 0, (point.planned / maxPlanned) * 128);
          const completedHeight = point.planned > 0 ? (point.completed / point.planned) * plannedHeight : 0;
          const dateLabel = point.from === point.to
            ? formatDate(point.from, { weekday: 'short' })
            : formatDate(point.from, { month: 'short', day: 'numeric' });
          const fullLabel = point.from === point.to
            ? formatDate(point.from, { weekday: 'long', month: 'short', day: 'numeric' })
            : `${formatDate(point.from, { month: 'short', day: 'numeric' })}–${formatDate(point.to, { month: 'short', day: 'numeric' })}`;
          return (
            <div key={point.from} className="flex min-w-0 flex-1 flex-col items-center justify-end self-stretch" title={`${fullLabel}: ${point.completed} of ${point.planned} completed`}>
              <span className="mb-1 text-[10px] font-black tabular-nums text-muted-foreground">{point.completed || ''}</span>
              <div className="relative w-full max-w-9 overflow-hidden rounded-t-lg bg-muted" style={{ height: plannedHeight }}>
                <div className="absolute inset-x-0 bottom-0 rounded-t-lg bg-gradient-to-t from-[#3f7f46] to-[#70b567]" style={{ height: completedHeight }} />
              </div>
              <span className="mt-2 max-w-full truncate text-[9px] font-black text-muted-foreground md:text-[10px]">{dateLabel}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SignalsSection({ signals, patternDays }: { signals: InsightData['signals']; patternDays: number }) {
  if (!signals.length) return null;
  return (
    <section aria-labelledby="signals-heading">
      <div className="flex items-end justify-between gap-4 px-1">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#4f9149] dark:text-emerald-400">Plain-English Insights</p>
          <h2 id="signals-heading" className="mt-0.5 text-xl font-black tracking-[-0.025em] text-foreground md:text-2xl">Things worth knowing</h2>
        </div>
        <p className="hidden text-xs font-semibold text-muted-foreground sm:block">Last {patternDays} days</p>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {signals.map((signal) => {
          const styles = {
            positive: { card: 'border-emerald-200/80 bg-emerald-50/90 dark:border-emerald-400/20 dark:bg-emerald-500/10', icon: 'bg-emerald-500 text-white', Icon: TrendingUp },
            watch: { card: 'border-amber-200/80 bg-amber-50/90 dark:border-amber-400/20 dark:bg-amber-500/10', icon: 'bg-amber-400 text-amber-950', Icon: CircleAlert },
            neutral: { card: 'border-sky-200/80 bg-sky-50/90 dark:border-sky-400/20 dark:bg-sky-500/10', icon: 'bg-sky-500 text-white', Icon: Lightbulb },
          }[signal.tone];
          return (
            <article key={signal.title} className={cn('rounded-[22px] border p-4 shadow-sm', styles.card)}>
              <div className={cn('grid h-9 w-9 place-items-center rounded-xl shadow-sm', styles.icon)}>
                <styles.Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{signal.eyebrow}</p>
              <h3 className="mt-1 text-pretty text-base font-black leading-snug tracking-[-0.02em] text-foreground">{signal.title}</h3>
              <p className="mt-1.5 text-pretty text-xs font-medium leading-relaxed text-muted-foreground">{signal.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function WeekdayRhythm({ data }: { data: InsightData }) {
  return (
    <section className="rounded-[24px] border border-border/[0.55] bg-card/[0.92] p-5 shadow-sm md:p-6" aria-labelledby="rhythm-heading">
      <SectionHeading
        icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
        eyebrow={`Last ${data.patternDays} Days`}
        title="Your weekly rhythm"
        description="A calmer view of which days naturally click."
        id="rhythm-heading"
      />
      <div className="mt-5 space-y-3">
        {data.weekdayPatterns.map((day) => (
          <div key={day.day} className="grid grid-cols-[2.75rem_1fr_2.25rem] items-center gap-3">
            <span className="text-xs font-black text-muted-foreground">{day.short}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-[#5da15b]" style={{ width: `${day.rate}%` }} />
            </div>
            <span className="text-right text-xs font-black tabular-nums text-foreground" aria-label={`${day.rate}% completed on ${day.name}s`}>
              {day.planned > 0 ? `${day.rate}%` : '—'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function HabitSection({ habits, patternDays }: { habits: InsightData['habits']; patternDays: number }) {
  return (
    <section className="rounded-[24px] border border-border/[0.55] bg-card/[0.92] p-5 shadow-sm md:p-6" aria-labelledby="habits-heading">
      <SectionHeading
        icon={<Leaf className="h-5 w-5" aria-hidden="true" />}
        eyebrow={`Last ${patternDays} Days`}
        title="Habits taking root"
        description="Your repeating tasks, without the pressure of being perfect."
        id="habits-heading"
      />
      {habits.length ? (
        <div className="mt-4 divide-y divide-border/55">
          {habits.map((habit) => (
            <div key={habit.id} className="py-3.5 first:pt-1 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-foreground" title={habit.title}>{habit.title}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                    {habit.completed} of {habit.scheduled} times
                    {habit.streak > 1 ? ` · ${habit.streak} in a row` : ''}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-black tabular-nums text-emerald-700 dark:text-emerald-300">{habit.rate}%</span>
              </div>
              <div className="mt-2.5 flex gap-1.5" aria-label={`Recent history for ${habit.title}`}>
                {habit.recent.map((item) => (
                  <span
                    key={item.date}
                    role="img"
                    aria-label={`${formatDate(item.date, { month: 'short', day: 'numeric' })}: ${item.completed ? 'completed' : 'not completed'}`}
                    title={`${formatDate(item.date, { month: 'short', day: 'numeric' })}: ${item.completed ? 'completed' : 'not completed'}`}
                    className={cn(
                      'grid h-6 w-6 place-items-center rounded-full border',
                      item.completed
                        ? 'border-[#5da15b] bg-[#5da15b] text-white'
                        : 'border-border bg-muted/[0.55] text-transparent',
                    )}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl bg-muted/[0.45] px-4 py-5 text-center">
          <Leaf className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-sm font-black text-foreground">No repeating pattern yet</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">Repeating tasks will appear here after a few check-ins.</p>
        </div>
      )}
    </section>
  );
}

function TagSection({ tags, patternDays }: { tags: InsightData['tags']; patternDays: number }) {
  return (
    <section className="rounded-[24px] border border-border/[0.55] bg-card/[0.92] p-5 shadow-sm md:p-6" aria-labelledby="areas-heading">
      <SectionHeading
        icon={<Target className="h-5 w-5" aria-hidden="true" />}
        eyebrow={`Last ${patternDays} Days`}
        title="Where your energy goes"
        description="Your areas of life, ordered by how often they show up."
        id="areas-heading"
      />
      <div className="mt-5 grid gap-x-8 gap-y-4 md:grid-cols-2">
        {tags.map((tag) => (
          <div key={tag.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden="true" />
                <span className="truncate text-sm font-black text-foreground">{tag.name}</span>
              </div>
              <span className="shrink-0 text-xs font-black tabular-nums text-muted-foreground">{tag.completed}/{tag.planned}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${tag.rate}%`, backgroundColor: tag.color }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NextStepCard({ nextStep }: { nextStep: InsightData['nextStep'] }) {
  return (
    <section className="relative overflow-hidden rounded-[26px] border border-emerald-200 bg-[linear-gradient(120deg,#effdf1,#e6f8e8)] p-5 shadow-sm dark:border-emerald-400/20 dark:bg-[linear-gradient(120deg,rgba(34,197,94,0.13),rgba(16,185,129,0.06))] md:flex md:items-center md:gap-6 md:p-7" aria-labelledby="next-step-heading">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#4f9149] text-white shadow-[0_6px_18px_rgba(79,145,73,0.28)]">
        <Lightbulb className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="mt-4 min-w-0 flex-1 md:mt-0">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#4f9149] dark:text-emerald-400">Your Next Small Win</p>
        <h2 id="next-step-heading" className="mt-1 text-balance text-xl font-black tracking-[-0.025em] text-foreground">{nextStep.title}</h2>
        <p className="mt-1 max-w-2xl text-pretty text-sm font-medium leading-relaxed text-muted-foreground">{nextStep.body}</p>
      </div>
      <Link
        href={nextStep.href}
        className="mt-5 inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#3f7f46] px-5 text-sm font-black text-white shadow-[0_4px_0_#2f6135] transition-[transform,box-shadow,background-color] hover:bg-[#397540] active:translate-y-1 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:mt-0 md:w-auto"
      >
        {nextStep.action}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

function DailyHistory({ daily }: { daily: DailyPoint[] }) {
  const recent = [...daily].reverse().slice(0, 14);
  return (
    <details className="group rounded-[24px] border border-border/[0.55] bg-card/[0.92] shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-[24px] px-5 py-4 transition-colors hover:bg-muted/[0.35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
          <Clock3 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-black text-foreground">Daily history</h2>
          <p className="text-xs font-medium text-muted-foreground">Open the supporting detail</p>
        </div>
        <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-border/[0.55] px-5 pb-5">
        <div className="divide-y divide-border/45">
          {recent.map((day) => (
            <div key={day.date} className="grid grid-cols-[1fr_auto] items-center gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-foreground">{formatDate(day.date, { weekday: 'long' })}</p>
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {formatDate(day.date, { month: 'long', day: 'numeric' })}
                  {day.focusSeconds > 0 ? ` · ${formatDuration(day.focusSeconds)} focused` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black tabular-nums text-foreground">{day.completed}/{day.planned}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Finished</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function SectionHeading({ icon, eyebrow, title, description, id }: { icon: React.ReactNode; eyebrow: string; title: string; description: string; id: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#4f9149]/10 text-[#4f9149] dark:text-emerald-400">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#4f9149] dark:text-emerald-400">{eyebrow}</p>
        <h2 id={id} className="mt-0.5 text-lg font-black tracking-[-0.025em] text-foreground">{title}</h2>
        <p className="mt-0.5 text-pretty text-xs font-medium leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function EmptyInsights() {
  return (
    <section className="mt-5 rounded-[28px] border border-border/[0.55] bg-card/[0.94] px-6 py-12 text-center shadow-sm md:mt-7 md:py-16">
      <div className="relative mx-auto grid h-20 w-20 place-items-center rounded-[26px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <Leaf className="h-9 w-9" aria-hidden="true" />
        <Sparkles className="absolute -right-2 -top-2 h-6 w-6 text-amber-400" aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-balance text-2xl font-black tracking-[-0.035em] text-foreground">Your patterns start with one small win</h2>
      <p className="mx-auto mt-2 max-w-md text-pretty text-sm font-medium leading-relaxed text-muted-foreground">
        Add a few tasks and check them off as you go. This page will turn that history into gentle, useful patterns.
      </p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#3f7f46] px-5 text-sm font-black text-white shadow-[0_4px_0_#2f6135] transition-[transform,box-shadow,background-color] hover:bg-[#397540] active:translate-y-1 active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
        Plan My First Win
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

function InsightsSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-[#f3f6f1] dark:bg-[#0d1711]">
      <div className="mx-auto w-full max-w-6xl px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-8 md:pt-8" aria-label="Loading your patterns">
        <div className="h-44 rounded-[28px] bg-card/80 shadow-sm motion-safe:animate-pulse" />
        <div className="mt-5 h-64 rounded-[28px] bg-emerald-950/20 motion-safe:animate-pulse" />
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="h-72 rounded-[24px] bg-card/80 motion-safe:animate-pulse" />
          <div className="h-72 rounded-[24px] bg-card/80 motion-safe:animate-pulse" />
        </div>
        <p className="sr-only" aria-live="polite">Loading your patterns…</p>
      </div>
    </div>
  );
}

function InsightsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto grid min-h-[100dvh] max-w-none place-items-center bg-[#f3f6f1] px-5 text-center dark:bg-[#0d1711]">
      <div>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <CircleAlert className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-black text-foreground">Your patterns need another moment</h1>
        <p className="mt-2 text-sm font-medium text-muted-foreground">Check your connection, then try loading them again.</p>
        <button type="button" onClick={onRetry} className="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-black text-primary-foreground transition-[transform,opacity] hover:opacity-90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try Again
        </button>
      </div>
    </div>
  );
}
