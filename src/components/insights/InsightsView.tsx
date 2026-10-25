'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, ChevronDown, CircleAlert, Moon, RotateCcw, Sun, Sunrise, Sunset, TrendingUp } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import Frog from '@/components/ui/frog';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { Icon, type IconName } from '@/components/ui/Icon';
import { WeeklyCoachCard, type WeeklyFacts } from '@/components/insights/WeeklyCoachCard';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { cn } from '@/lib/utils';

type FrogIndices = React.ComponentProps<typeof Frog>['indices'];
type DailyPoint = { date: string; planned: number; completed: number; focusSeconds: number };
type TimelinePoint = DailyPoint & { from: string; to: string };
type Weekday = {
  day: number;
  name: string;
  short: string;
  planned: number;
  completed: number;
  rate: number;
  focusSeconds: number;
};
export type InsightData = {
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
  };
  previous: { planned: number; completed: number; completionRate: number };
  timeline: TimelinePoint[];
  daily: DailyPoint[];
  weekdayPatterns: Weekday[];
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
  loadPattern?: {
    typicalTasks: number;
    lighterRate: number;
    heavierRate: number;
    lighterDays: number;
    heavierDays: number;
  };
  focusPattern?: { focusedRate: number; otherRate: number; focusedDays: number; otherDays: number };
  timePattern?: {
    label: string;
    count: number;
    share: number;
    buckets: Array<{ label: string; share: number }>;
  } | null;
  nextStep: { title: string; body: string; href: string; action: string };
  patternDays: number;
};

const CARD = 'rounded-[24px] bg-card shadow-[0_0_0_1px_rgba(15,23,42,0.07),0_3px_0_0_rgba(15,23,42,0.08)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_3px_0_0_rgba(0,0,0,0.35)]';
const GREEN_FILL = 'bg-[linear-gradient(to_bottom,#7cc46f,#4e9446)]';
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const TIME_ICONS: Record<string, typeof Sun> = { Morning: Sunrise, Afternoon: Sun, Evening: Sunset, Night: Moon };
const TIME_PHRASES: Record<string, string> = {
  Morning: 'in the morning',
  Afternoon: 'in the afternoon',
  Evening: 'in the evening',
  Night: 'at night',
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('We could not load your patterns');
  return response.json() as Promise<InsightData>;
};

const numberFormat = new Intl.NumberFormat('en-US');
function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${numberFormat.format(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${numberFormat.format(hours)}h ${numberFormat.format(remainder)}m` : `${numberFormat.format(hours)}h`;
}

function formatDate(dayKey: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', options).format(new Date(`${dayKey}T12:00:00`));
}

function windowLabel(days: number) {
  if (days === 90) return 'Last 3 months';
  return days % 7 === 0 ? `Last ${days / 7} weeks` : `Last ${days} days`;
}

/** Numbers only — the coach never sees task titles beyond the recurring ones
 *  the user already sees on this page, and never sees notes or checklists. */
function weeklyFacts(data: InsightData): WeeklyFacts {
  const ranked = [...data.weekdayPatterns].filter((day) => day.planned >= 2);
  const best = [...ranked].sort((a, b) => b.rate - a.rate)[0] ?? null;
  const hardest = [...ranked].sort((a, b) => a.rate - b.rate)[0] ?? null;
  return {
    thisWeek: {
      completionRate: data.summary.completionRate,
      completionDelta: data.summary.completionDelta,
      planned: data.summary.planned,
      completed: data.summary.completed,
      focusMinutes: Math.round(data.summary.focusSeconds / 60),
      activeDays: data.summary.activeDays,
      bestRun: data.summary.bestRun,
    },
    // Weekday rhythm, areas, habits and load are all computed over the longer
    // pattern window — sending them alongside the weekly numbers unlabelled is
    // what produced "0 completed" and "57% completion" in the same note.
    longerTerm: {
      windowDays: data.patternDays,
      bestDay: best?.name ?? null,
      hardestDay: hardest && best && hardest.day !== best.day ? hardest.name : null,
      topAreas: data.tags.slice(0, 4).map((tag) => ({
        name: tag.name,
        rate: tag.rate,
        planned: tag.planned,
      })),
      slippingHabits: data.habits
        .filter((habit) => habit.rate < 70)
        .slice(0, 3)
        .map((habit) => ({ title: habit.title, rate: habit.rate })),
      finishWindow: data.timePattern?.label ?? null,
      typicalTasks: data.loadPattern?.typicalTasks ?? 0,
      lighterRate: data.loadPattern?.lighterRate ?? 0,
      heavierRate: data.loadPattern?.heavierRate ?? 0,
    },
  };
}

export function InsightsView({ days }: { days: 7 | 30 | 90 }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { indices } = useWardrobeIndices(!!user);
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const { data, error, isLoading, mutate } = useSWR<InsightData>(
    user ? `/api/insights?days=${days}&timezone=${encodeURIComponent(timezone)}` : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, router, user]);

  if (authLoading || (!data && isLoading)) return <InsightsSkeleton days={days} />;
  if (!user) return null;
  if (error || !data) return <InsightsError onRetry={() => mutate()} />;

  return <InsightsContent data={data} days={days} indices={indices} />;
}

export function InsightsContent({ data, days, indices }: { data: InsightData; days: 7 | 30 | 90; indices?: FrogIndices }) {
  const hasHistory = data.summary.planned > 0 || data.weekdayPatterns.some((day) => day.planned > 0);
  const period = windowLabel(data.patternDays);
  const line = !hasHistory
    ? 'Nothing to read yet!\nFinish a task and I’ll start.'
    : data.summary.planned === 0
      ? 'A quiet stretch!\nWant to plan a small win?'
      : `${data.summary.headline}!`;
  return (
    <div className="relative isolate min-h-[100dvh] overflow-x-hidden pb-12 md:pb-16">
      {/* The desktop site header is absolutely positioned at the top of the
          scroll container, so every page owes it h-16 of clearance. */}
      <div aria-hidden="true" className="hidden h-16 md:block" />
      <div className="mx-auto w-full max-w-5xl px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-8 md:pt-6">
        <InsightsHeader days={days} />
        <PondStage line={line} indices={indices} />
        {hasHistory ? (
          <div className="relative z-10 -mt-[15px] space-y-4 md:space-y-5">
            <ReportCard data={data} />
            <NextStepCard nextStep={data.nextStep} />
            {data.summary.planned > 0 ? <FollowThrough data={data} days={days} /> : null}
            {days === 7 ? <WeeklyCoachCard facts={weeklyFacts(data)} /> : null}
            <PatternsSection data={data} period={period} />
            <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-2 lg:items-start">
              <HabitSection habits={data.habits} period={period} />
              {data.tags.length > 0 ? <AreaSection tags={data.tags} period={period} /> : null}
            </div>
          </div>
        ) : (
          <EmptyInsights />
        )}
      </div>
    </div>
  );
}

function InsightsHeader({ days }: { days: 7 | 30 | 90 }) {
  return (
    <header className="relative z-20 flex items-center gap-3">
      <Link
        href="/"
        aria-label="Back to Today"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/90 text-[#16351a] shadow-[0_3px_0_rgba(15,46,29,0.18)] backdrop-blur transition-transform active:translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-slate-950/60 dark:text-white"
      >
        <ArrowLeft className="h-5 w-5" strokeWidth={2.75} aria-hidden="true" />
      </Link>
      <nav
        aria-label="Time range"
        className="ml-auto grid w-full max-w-[19rem] grid-cols-3 gap-1 rounded-full bg-white/80 p-1 shadow-[0_3px_0_rgba(15,46,29,0.14)] backdrop-blur dark:bg-slate-950/55"
      >
        {([7, 30, 90] as const).map((range) => (
          <Link
            key={range}
            href={`/insights?days=${range}`}
            replace
            scroll={false}
            aria-current={days === range ? 'page' : undefined}
            className={cn(
              'rounded-full py-2 text-center text-[13px] font-black transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              days === range
                ? 'bg-primary text-primary-foreground shadow-[0_2px_0_rgba(0,0,0,0.2)]'
                : 'text-[#16351a]/70 hover:text-[#16351a] dark:text-white/70 dark:hover:text-white',
            )}
          >
            {range === 7 ? '7 days' : range === 30 ? '30 days' : '3 months'}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function PondStage({ line, indices }: { line: string; indices?: FrogIndices }) {
  return (
    <div className="relative flex flex-col items-center">
      <h1 className="insights-title mt-4 text-center text-[40px] leading-none md:text-[52px]">Your Patterns</h1>
      <div className="pointer-events-none relative z-20 -mt-16 md:-mt-14">
        <Frog width={240} height={270} indices={indices} />
        <FrogSpeechBubble rate={0} done={0} total={0} fixedMessage={line} className="!top-[150px]" />
      </div>
    </div>
  );
}

function ReportCard({ data }: { data: InsightData }) {
  const { summary, previous, range } = data;
  const empty = summary.planned === 0;
  const delta = previous.planned > 0 && !empty ? summary.completionDelta : 0;
  const before = range.days === 7 ? 'the week before' : range.days === 30 ? 'the 30 days before' : 'the 3 months before';
  return (
    <section aria-labelledby="report-heading" className={cn(CARD, 'rounded-[28px] px-5 pb-5 pt-5 md:px-7 md:pb-6 md:pt-6')}>
      <div className="md:flex md:items-end md:gap-8">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black text-muted-foreground">
            {formatDate(range.from, { month: 'short', day: 'numeric' })} – {formatDate(range.to, { month: 'short', day: 'numeric' })}
          </p>
          <h2 id="report-heading" className="mt-1 flex items-baseline gap-2">
            <span className="font-display text-[46px] leading-none tracking-wide text-foreground">{empty ? '0%' : `${summary.completionRate}%`}</span>
            <span className="text-[15px] font-black text-muted-foreground">of your plan done</span>
          </h2>
          <ChunkyBar
            className="mt-3 h-10"
            value={summary.completed}
            max={summary.planned}
            label={`${numberFormat.format(summary.completed)} / ${numberFormat.format(summary.planned)} tasks`}
          />
          {delta !== 0 ? (
            <p className={cn('mt-2.5 flex items-center gap-1.5 text-[13px] font-black', delta > 0 ? 'text-primary' : 'text-muted-foreground')}>
              {delta > 0 ? <TrendingUp className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : null}
              {delta > 0 ? `Up ${delta} points on ${before}` : `${Math.abs(delta)} points under ${before}`}
            </p>
          ) : null}
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 md:mt-0 md:w-[22rem] md:shrink-0">
          <StatTile icon="clock" label="Focus" value={summary.focusSeconds > 0 ? formatDuration(summary.focusSeconds) : '–'} />
          <StatTile icon="date" label="Active days" value={`${summary.activeDays}/${range.days}`} />
          <StatTile icon="leap" label="Best run" value={summary.bestRun === 1 ? '1 day' : `${summary.bestRun} days`} />
        </dl>
      </div>
    </section>
  );
}

function StatTile({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center rounded-[18px] bg-muted/60 px-1.5 pb-2.5 pt-2 text-center">
      <Icon name={icon} className="h-9 w-9" />
      <dd className="mt-1 text-[16px] font-black leading-tight tabular-nums text-foreground">{value}</dd>
      <dt className="max-w-full truncate text-[11px] font-bold text-muted-foreground">{label}</dt>
    </div>
  );
}

function ChunkyBar({
  value,
  max,
  label,
  tone = 'green',
  className,
  delay = 0,
}: {
  value: number;
  max: number;
  label: string;
  tone?: 'green' | 'soft';
  className?: string;
  delay?: number;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('relative overflow-hidden rounded-full bg-muted', className)}
    >
      {pct > 0 ? (
        <div className="absolute inset-[3px]">
          <div
            className={cn(
              'insights-grow-x relative h-full min-w-6 overflow-hidden rounded-full',
              tone === 'green' ? GREEN_FILL : 'bg-muted-foreground/30',
            )}
            style={{ width: `${pct}%`, animationDelay: `${delay}ms` }}
          >
            <span aria-hidden="true" className="absolute inset-x-2 top-[3px] h-[28%] rounded-full bg-white/35" />
            {tone === 'green' ? (
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-white/25 animate-[bar-shine-idle_2.8s_ease-in-out_infinite] motion-reduce:hidden" />
            ) : null}
          </div>
        </div>
      ) : null}
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-[14px] font-black tabular-nums text-foreground/70">
        {label}
      </span>
      {tone === 'green' ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center text-[14px] font-black tabular-nums text-white [text-shadow:0_1px_0_rgba(31,98,28,0.55)]"
          style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

function NextStepCard({ nextStep }: { nextStep: InsightData['nextStep'] }) {
  return (
    <Link
      href={nextStep.href}
      aria-label={`${nextStep.action}: ${nextStep.title}`}
      className={cn(CARD, 'group flex items-center gap-3.5 p-3.5 pr-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:p-4 md:pr-5')}
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-amber-100 dark:bg-amber-400/15">
        <Icon name="quests" className="h-10 w-10" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-black text-amber-600 dark:text-amber-300">Next small win</span>
        <span className="mt-0.5 block text-pretty text-[16px] font-black leading-snug tracking-[-0.01em] text-foreground">{nextStep.title}</span>
        <span className="mt-0.5 line-clamp-2 text-pretty text-[13px] font-semibold leading-snug text-muted-foreground">{nextStep.body}</span>
      </span>
      <span className="flex h-11 shrink-0 items-center rounded-[14px] bg-amber-500 px-4 text-[15px] font-black text-white shadow-[0_3px_0_#b45309] transition-[transform,box-shadow] group-active:translate-y-[3px] group-active:shadow-none">
        <span className="hidden md:inline">{nextStep.action}</span>
        <span className="md:hidden">Go</span>
      </span>
    </Link>
  );
}

function FollowThrough({ data, days }: { data: InsightData; days: 7 | 30 | 90 }) {
  const points = data.timeline;
  const maxPlanned = Math.max(1, ...points.map((point) => point.planned));
  const label = (point: TimelinePoint) =>
    point.from === point.to
      ? formatDate(point.from, { weekday: 'short' })
      : formatDate(point.from, { month: 'short', day: 'numeric' });
  const fullLabel = (point: TimelinePoint) =>
    point.from === point.to
      ? formatDate(point.from, { weekday: 'long', month: 'short', day: 'numeric' })
      : `${formatDate(point.from, { month: 'short', day: 'numeric' })}–${formatDate(point.to, { month: 'short', day: 'numeric' })}`;
  return (
    <section className={cn(CARD, 'p-5 md:p-6')} aria-labelledby="follow-heading">
      <div className="flex items-center gap-3">
        <Icon name="patterns" className="h-10 w-10 shrink-0" />
        <h2 id="follow-heading" className="min-w-0 flex-1 text-[18px] font-black tracking-[-0.02em] text-foreground">
          {days === 7 ? 'Day by day' : 'Week by week'}
        </h2>
        <div aria-hidden="true" className="flex shrink-0 items-center gap-3 text-[12px] font-bold text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className={cn('h-3 w-3 rounded-full', GREEN_FILL)} />Done</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-muted" />Planned</span>
        </div>
      </div>
      <div
        role="img"
        aria-label={points.map((point) => `${fullLabel(point)}: ${point.completed} of ${point.planned} done`).join('. ')}
        className="mt-5 flex items-end gap-1.5 md:gap-3"
      >
        {points.map((point, index) => {
          const plannedHeight = point.planned > 0 ? Math.max(16, (point.planned / maxPlanned) * 112) : 0;
          const doneShare = point.planned > 0 ? point.completed / point.planned : 0;
          const showLabel = points.length <= 7 || index % 3 === 0;
          return (
            <div key={point.from} className="flex min-w-0 flex-1 flex-col items-center" title={`${fullLabel(point)}: ${point.completed} of ${point.planned} done`}>
              <div className="flex h-[136px] w-full items-end justify-center">
                <div className="flex w-full max-w-11 flex-col items-center">
                  {points.length <= 7 && point.planned > 0 ? (
                    <span className="mb-1 text-[12px] font-black tabular-nums text-muted-foreground">{point.completed}</span>
                  ) : null}
                  {point.planned > 0 ? (
                    <div
                      className="insights-grow-y relative w-full overflow-hidden rounded-[10px] bg-muted"
                      style={{ height: plannedHeight, animationDelay: `${80 + index * 40}ms` }}
                    >
                      {doneShare > 0 ? (
                        <div className={cn('absolute inset-x-0 bottom-0 rounded-[10px]', GREEN_FILL)} style={{ height: `${doneShare * 100}%` }}>
                          {doneShare * plannedHeight >= 24 ? (
                            <span aria-hidden="true" className="absolute inset-x-[24%] top-[4px] h-[6px] rounded-full bg-white/40" />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="h-2 w-full rounded-full bg-muted" />
                  )}
                </div>
              </div>
              <span className={cn('mt-2 whitespace-nowrap text-[11px] font-black text-muted-foreground', !showLabel && 'invisible')}>
                {label(point)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function bestWeekday(weekdays: Weekday[]) {
  return [...weekdays]
    .filter((day) => day.planned >= 2 && day.completed > 0)
    .sort((a, b) => b.rate - a.rate || b.completed - a.completed)[0] ?? null;
}

function PatternsSection({ data, period }: { data: InsightData; period: string }) {
  const load = data.loadPattern;
  const focus = data.focusPattern;
  const cards: React.ReactNode[] = [];
  if (bestWeekday(data.weekdayPatterns)) cards.push(<BestDayCard key="day" weekdays={data.weekdayPatterns} />);
  if (load && load.typicalTasks > 0 && load.lighterDays >= 2 && load.heavierDays >= 2) cards.push(<SweetSpotCard key="load" load={load} />);
  if (data.timePattern?.buckets?.length) cards.push(<FinishWindowCard key="time" time={data.timePattern} />);
  if (focus && focus.focusedDays >= 2 && focus.otherDays >= 2 && focus.focusedRate - focus.otherRate >= 8) cards.push(<FocusCard key="focus" focus={focus} />);
  return (
    <section aria-labelledby="patterns-heading">
      <SectionTitle id="patterns-heading" title="What works for you" period={period} className="px-1 pt-2" />
      {cards.length ? (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">{cards}</div>
      ) : (
        <div className={cn(CARD, 'mt-3 flex items-center gap-3.5 p-4')}>
          <Icon name="patterns" className="h-11 w-11 shrink-0" />
          <div className="min-w-0">
            <p className="text-[15px] font-black text-foreground">Your patterns are taking shape</p>
            <p className="mt-0.5 text-[13px] font-semibold leading-snug text-muted-foreground">Keep checking off tasks. They show up after a couple of weeks.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function PatternCard({ icon, eyebrow, title, children }: { icon: IconName; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <article className={cn(CARD, 'p-4 md:p-5')}>
      <div className="flex items-center gap-3">
        <Icon name={icon} className="h-11 w-11 shrink-0" />
        <div className="min-w-0">
          <p className="text-[12px] font-black text-primary">{eyebrow}</p>
          <h3 className="text-pretty text-[16px] font-black leading-snug tracking-[-0.015em] text-foreground">{title}</h3>
        </div>
      </div>
      {children}
    </article>
  );
}

function BestDayCard({ weekdays }: { weekdays: Weekday[] }) {
  const best = bestWeekday(weekdays);
  if (!best) return null;
  const ordered = WEEK_ORDER.map((day) => weekdays.find((item) => item.day === day)).filter((day): day is Weekday => !!day);
  return (
    <PatternCard icon="date" eyebrow="Best day" title={`${best.name}s are your strongest`}>
      <div
        role="img"
        aria-label={ordered.map((day) => `${day.name}: ${day.planned >= 2 ? `${day.rate}% done` : 'not enough tasks'}`).join('. ')}
        className="mt-4 grid grid-cols-7 gap-1.5"
      >
        {ordered.map((day, index) => {
          const isBest = day.day === best.day;
          return (
            <div key={day.day} className="flex flex-col items-center">
              <span
                className={cn(
                  'mb-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-black leading-none tabular-nums',
                  isBest ? 'bg-primary text-primary-foreground shadow-[0_2px_0_rgba(0,0,0,0.18)]' : 'invisible',
                )}
              >
                {day.rate}%
              </span>
              <div className="flex h-[72px] w-full max-w-10 items-end overflow-hidden rounded-[12px] bg-muted">
                {day.planned >= 2 ? (
                  <div
                    className={cn('insights-grow-y relative w-full rounded-[12px]', isBest ? GREEN_FILL : 'bg-primary/25')}
                    style={{ height: `${Math.max(12, day.rate)}%`, animationDelay: `${80 + index * 40}ms` }}
                  >
                    {isBest ? <span aria-hidden="true" className="absolute inset-x-[24%] top-[4px] h-[6px] rounded-full bg-white/40" /> : null}
                  </div>
                ) : null}
              </div>
              <span className={cn('mt-1.5 text-[11px] font-black', isBest ? 'text-primary' : 'text-muted-foreground')}>{day.short}</span>
            </div>
          );
        })}
      </div>
    </PatternCard>
  );
}

function SweetSpotCard({ load }: { load: NonNullable<InsightData['loadPattern']> }) {
  const gap = load.lighterRate - load.heavierRate;
  const lighter = load.typicalTasks === 1 ? '1 task' : `${load.typicalTasks} tasks or fewer`;
  const title = gap >= 10
    ? `Days with ${lighter} go best`
    : gap <= -10
      ? 'You shine on fuller days'
      : 'Your pace holds on busy days';
  return (
    <PatternCard icon="planner" eyebrow="Sweet spot" title={title}>
      <ComparisonBars
        rows={[
          { label: load.typicalTasks === 1 ? '1 task' : `Up to ${load.typicalTasks} tasks`, rate: load.lighterRate, lead: gap >= 0 },
          { label: `${load.typicalTasks + 1}+ tasks`, rate: load.heavierRate, lead: gap < 0 },
        ]}
      />
    </PatternCard>
  );
}

function FocusCard({ focus }: { focus: NonNullable<InsightData['focusPattern']> }) {
  return (
    <PatternCard icon="clock" eyebrow="Focus" title="Focus sessions lift your days">
      <ComparisonBars
        rows={[
          { label: 'With a focus session', rate: focus.focusedRate, lead: true },
          { label: 'Without one', rate: focus.otherRate, lead: false },
        ]}
      />
    </PatternCard>
  );
}

function ComparisonBars({ rows }: { rows: Array<{ label: string; rate: number; lead: boolean }> }) {
  return (
    <div className="mt-4 space-y-2.5">
      {rows.map((row, index) => (
        <div key={row.label}>
          <p className="mb-1 text-[13px] font-bold text-muted-foreground">{row.label}</p>
          <ChunkyBar className="h-8" value={row.rate} max={100} label={`${row.rate}% done`} tone={row.lead ? 'green' : 'soft'} delay={120 + index * 90} />
        </div>
      ))}
    </div>
  );
}

function FinishWindowCard({ time }: { time: NonNullable<InsightData['timePattern']> }) {
  return (
    <PatternCard icon="compass" eyebrow="Finish window" title={`You get the most done ${TIME_PHRASES[time.label] ?? time.label.toLowerCase()}`}>
      <div className="mt-4 grid grid-cols-4 gap-1.5">
        {time.buckets.map((bucket) => {
          const BucketIcon = TIME_ICONS[bucket.label] ?? Sun;
          const top = bucket.label === time.label;
          return (
            <div
              key={bucket.label}
              className={cn(
                'flex min-w-0 flex-col items-center rounded-[16px] px-1 py-2.5',
                top
                  ? 'bg-amber-100 text-amber-600 shadow-[0_3px_0_#f59e0b] dark:bg-amber-400/15 dark:text-amber-300 dark:shadow-[0_3px_0_rgba(245,158,11,0.5)]'
                  : 'bg-muted/60 text-muted-foreground',
              )}
            >
              <BucketIcon className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
              <span className={cn('mt-1 text-[16px] font-black tabular-nums', top ? 'text-amber-700 dark:text-amber-200' : 'text-foreground')}>{bucket.share}%</span>
              <span className="max-w-full truncate text-[11px] font-bold">{bucket.label}</span>
            </div>
          );
        })}
      </div>
    </PatternCard>
  );
}

function HabitSection({ habits, period }: { habits: InsightData['habits']; period: string }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? habits : habits.slice(0, 3);
  return (
    <section className={cn(CARD, 'p-5 md:p-6')} aria-labelledby="habits-heading">
      <SectionTitle id="habits-heading" icon="repeat" title="Habits taking root" period={period} />
      {habits.length ? (
        <>
          <ul className="mt-2 divide-y divide-border/60">
            {visible.map((habit) => (
              <li key={habit.id} className="py-3 last:pb-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-[15px] font-black text-foreground" title={habit.title}>{habit.title}</p>
                  {habit.streak > 1 ? (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-black text-primary">{habit.streak} in a row</span>
                  ) : (
                    <span className="shrink-0 text-[13px] font-black tabular-nums text-muted-foreground">{habit.completed}/{habit.scheduled}</span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-1">
                  {habit.recent.map((item) => {
                    const when = formatDate(item.date, { month: 'short', day: 'numeric' });
                    return item.completed ? (
                      <Icon key={item.date} name="leap" label={`${when}: done`} className="h-7 w-7 shrink-0" />
                    ) : (
                      <span
                        key={item.date}
                        role="img"
                        aria-label={`${when}: missed`}
                        className="grid h-7 w-7 shrink-0 place-items-center"
                      >
                        <span className="h-[22px] w-[22px] rounded-full border-2 border-dashed border-muted-foreground/25" />
                      </span>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
          {habits.length > 3 ? <ShowAllButton expanded={expanded} onToggle={() => setExpanded((value) => !value)} label={`Show all ${habits.length} habits`} /> : null}
        </>
      ) : (
        <div className="mt-4 flex items-center gap-3 rounded-[18px] bg-muted/50 px-4 py-3.5">
          <Icon name="lilyPad" className="h-9 w-9 shrink-0" />
          <p className="text-[13px] font-semibold leading-snug text-muted-foreground">Repeating tasks show up here after a few check-ins.</p>
        </div>
      )}
    </section>
  );
}

function AreaSection({ tags, period }: { tags: InsightData['tags']; period: string }) {
  const [expanded, setExpanded] = useState(false);
  const total = tags.reduce((sum, tag) => sum + tag.planned, 0) || 1;
  const visible = expanded ? tags : tags.slice(0, 4);
  return (
    <section className={cn(CARD, 'p-5 md:p-6')} aria-labelledby="areas-heading">
      <SectionTitle id="areas-heading" icon="filter" title="Where your energy goes" period={period} />
      <div
        role="img"
        aria-label={tags.map((tag) => `${tag.name}: ${Math.round((tag.planned / total) * 100)}% of your tasks`).join('. ')}
        className="mt-4 rounded-full bg-muted p-[3px]"
      >
        <div className="insights-grow-x flex h-4 gap-[3px] overflow-hidden rounded-full">
          {tags.map((tag) => (
            <span key={tag.id} className="relative h-full min-w-[8px] first:rounded-l-full last:rounded-r-full" style={{ flexGrow: tag.planned, flexBasis: 0, backgroundColor: tag.color }}>
              <span aria-hidden="true" className="absolute inset-x-1 top-[2px] h-[4px] rounded-full bg-white/35" />
            </span>
          ))}
        </div>
      </div>
      <ul className="mt-2 divide-y divide-border/60">
        {visible.map((tag) => (
          <li key={tag.id} className="flex items-center gap-3 py-2.5 last:pb-1">
            <span className="h-3 w-3 shrink-0 rounded-full shadow-[inset_0_-2px_0_rgba(0,0,0,0.15)]" style={{ backgroundColor: tag.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[15px] font-black text-foreground">{tag.name}</span>
            <span className="shrink-0 text-[13px] font-bold tabular-nums text-muted-foreground">{Math.round((tag.planned / total) * 100)}%</span>
            <span className="w-[76px] shrink-0 text-right text-[13px] font-black tabular-nums text-foreground">{tag.completed}/{tag.planned} done</span>
          </li>
        ))}
      </ul>
      {tags.length > 4 ? <ShowAllButton expanded={expanded} onToggle={() => setExpanded((value) => !value)} label={`Show all ${tags.length} areas`} /> : null}
    </section>
  );
}

function ShowAllButton({ expanded, onToggle, label }: { expanded: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="mt-2 flex h-10 w-full items-center justify-center gap-1 rounded-[14px] bg-muted/60 text-[13px] font-black text-primary transition-[transform,background-color] hover:bg-muted active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {expanded ? 'Show less' : label}
      <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} strokeWidth={2.75} aria-hidden="true" />
    </button>
  );
}

function SectionTitle({ id, icon, title, period, className }: { id: string; icon?: IconName; title: string; period: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {icon ? <Icon name={icon} className="h-10 w-10 shrink-0" /> : null}
      <div className="min-w-0">
        <h2 id={id} className="text-[18px] font-black leading-tight tracking-[-0.02em] text-foreground">{title}</h2>
        <p className="text-[12px] font-bold text-muted-foreground">{period}</p>
      </div>
    </div>
  );
}

function EmptyInsights() {
  return (
    <section className={cn(CARD, 'relative z-10 -mt-[15px] rounded-[28px] px-6 pb-7 pt-8 text-center')}>
      <h2 className="text-balance text-[22px] font-black tracking-[-0.03em] text-foreground">Your patterns start with one small win</h2>
      <p className="mx-auto mt-2 max-w-md text-pretty text-sm font-semibold leading-relaxed text-muted-foreground">
        Check off a few tasks and this page fills in with what works for you.
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex h-12 items-center justify-center rounded-2xl bg-primary px-6 text-[15px] font-black text-primary-foreground shadow-[0_4px_0_0_#34631f] transition-[transform,box-shadow] active:translate-y-[4px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        Plan my first win
      </Link>
    </section>
  );
}

function InsightsSkeleton({ days }: { days: 7 | 30 | 90 }) {
  return (
    <div className="relative isolate min-h-[100dvh] overflow-x-hidden">
      <div aria-hidden="true" className="hidden h-16 md:block" />
      <div className="mx-auto w-full max-w-5xl px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-8 md:pt-6" aria-label="Loading your patterns">
        <InsightsHeader days={days} />
        <div className="flex justify-center">
          <h1 className="insights-title mt-4 text-center text-[40px] leading-none md:text-[52px]">Your Patterns</h1>
        </div>
        <div className="mt-[150px] space-y-4 md:space-y-5">
          <div className={cn(CARD, 'h-[236px] rounded-[28px] motion-safe:animate-pulse md:h-[168px]')} />
          <div className={cn(CARD, 'h-[86px] motion-safe:animate-pulse')} />
          <div className={cn(CARD, 'h-[236px] motion-safe:animate-pulse')} />
        </div>
        <p className="sr-only" aria-live="polite">Loading your patterns…</p>
      </div>
    </div>
  );
}

function InsightsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto grid min-h-[100dvh] max-w-none place-items-center bg-background px-5 text-center">
      <div>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <CircleAlert className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-xl font-black text-foreground">Your patterns need another moment</h1>
        <p className="mt-2 text-sm font-medium text-muted-foreground">Check your connection, then try loading them again.</p>
        <button type="button" onClick={onRetry} className="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-black text-primary-foreground shadow-[0_3px_0_0_#34631f] transition-[transform,box-shadow] active:translate-y-[3px] active:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    </div>
  );
}
