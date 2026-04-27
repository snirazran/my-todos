'use client';

import React from 'react';
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  GitCompare,
  ListChecks,
  Tags,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type HistoryTask = {
  id?: string;
  text?: string;
  completed?: boolean;
  type?: 'weekly' | 'regular' | 'habit';
  tags?: string[];
  frogodoroSession?: {
    timeSpent?: number;
    completedCycles?: number;
  };
};

type HistoryDay = {
  date: string;
  tasks: HistoryTask[];
};

type TagDef = {
  id: string;
  name: string;
  color: string;
};

type PatternInsightsProps = {
  historyData: HistoryDay[];
  previousHistoryData: HistoryDay[];
  availableTags: TagDef[];
};

type BasicStats = {
  taskTotal: number;
  taskDone: number;
  habitTotal: number;
  habitDone: number;
  activeDays: number;
  focusMinutes: number;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PatternInsights({
  historyData,
  previousHistoryData,
  availableTags,
}: PatternInsightsProps) {
  const stats = React.useMemo(() => getBasicStats(historyData), [historyData]);
  const previousStats = React.useMemo(
    () => getBasicStats(previousHistoryData),
    [previousHistoryData],
  );
  const planning = React.useMemo(() => getPlanningLoad(historyData), [historyData]);
  const tagStats = React.useMemo(
    () => getTagStats(historyData, availableTags),
    [historyData, availableTags],
  );
  const rhythm = React.useMemo(() => getDayRhythm(historyData), [historyData]);

  const hasData = stats.taskTotal + stats.habitTotal > 0;

  if (!hasData) {
    return (
      <div className="rounded-[24px] border border-dashed border-border/70 bg-muted/20 p-6 text-center">
        <p className="text-sm font-black text-foreground">No patterns yet</p>
        <p className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground">
          Complete a few tasks or habits in this range and insights will appear here.
        </p>
      </div>
    );
  }

  const taskRate = rate(stats.taskDone, stats.taskTotal);
  const habitRate = rate(stats.habitDone, stats.habitTotal);
  const previousTaskRate = rate(previousStats.taskDone, previousStats.taskTotal);
  const previousHabitRate = rate(previousStats.habitDone, previousStats.habitTotal);

  return (
    <div className="space-y-5">
      <section>
        <SectionHeader
          icon={Activity}
          title="Overview"
          subtitle="Tasks and habits are separated so the signal stays clear."
        />
        <div className="mt-3 grid grid-cols-3 gap-2 sm:gap-3">
          <MetricCard
            label="Tasks"
            value={`${Math.round(taskRate)}%`}
            detail={`${stats.taskDone} of ${stats.taskTotal} done`}
            tone="primary"
          />
          <MetricCard
            label="Habits"
            value={stats.habitTotal > 0 ? `${Math.round(habitRate)}%` : '-'}
            detail={stats.habitTotal > 0 ? `${stats.habitDone} of ${stats.habitTotal} done` : 'none tracked'}
            tone="emerald"
          />
          <MetricCard
            label="Active"
            value={`${stats.activeDays}`}
            detail="days with progress"
            tone="blue"
          />
        </div>
      </section>

      <section className="rounded-[24px] border border-border/60 bg-card/60 p-4 shadow-sm">
        <SectionHeader
          icon={ListChecks}
          title="Planning Load"
          subtitle="See how list size changes completion."
          compact
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <LoadCard label="Short lists" data={planning.short} />
          <LoadCard label="Long lists" data={planning.long} />
        </div>
        {planning.message && (
          <p className="mt-3 rounded-2xl bg-primary/[0.06] px-3 py-2 text-xs font-bold leading-relaxed text-foreground">
            {planning.message}
          </p>
        )}
      </section>

      <section className="rounded-[24px] border border-border/60 bg-card/60 p-4 shadow-sm">
        <SectionHeader
          icon={Tags}
          title="Areas"
          subtitle="Completion by tag shows what is getting attention."
          compact
        />
        <div className="mt-4 space-y-2">
          {tagStats.length > 0 ? (
            tagStats.slice(0, 5).map((tag) => (
              <TagRow key={tag.id} tag={tag} />
            ))
          ) : (
            <p className="rounded-2xl border border-dashed border-border/60 p-4 text-center text-xs font-semibold text-muted-foreground">
              Add tags to tasks to see area-level insights.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[24px] border border-border/60 bg-card/60 p-4 shadow-sm">
          <SectionHeader
            icon={CalendarDays}
            title="Rhythm"
            subtitle="Which days carry progress."
            compact
          />
          <div className="mt-4 space-y-3">
            <RhythmLine label="Strongest" item={rhythm.best} />
            <RhythmLine label="Weakest" item={rhythm.weakest} />
          </div>
        </div>

        <div className="rounded-[24px] border border-border/60 bg-card/60 p-4 shadow-sm">
          <SectionHeader
            icon={GitCompare}
            title="Compared"
            subtitle="This range vs the previous one."
            compact
          />
          <div className="mt-4 space-y-2">
            <CompareRow label="Tasks" current={taskRate} previous={previousTaskRate} />
            <CompareRow label="Habits" current={habitRate} previous={previousHabitRate} disabled={stats.habitTotal === 0 && previousStats.habitTotal === 0} />
            <CompareCount label="Active days" current={stats.activeDays} previous={previousStats.activeDays} />
          </div>
        </div>
      </section>
    </div>
  );
}

function getBasicStats(days: HistoryDay[]): BasicStats {
  const stats: BasicStats = {
    taskTotal: 0,
    taskDone: 0,
    habitTotal: 0,
    habitDone: 0,
    activeDays: 0,
    focusMinutes: 0,
  };

  for (const day of days) {
    let dayHadProgress = false;
    for (const task of day.tasks ?? []) {
      const isHabit = task.type === 'habit';
      const done = !!task.completed;
      if (isHabit) {
        stats.habitTotal += 1;
        if (done) stats.habitDone += 1;
      } else {
        stats.taskTotal += 1;
        if (done) stats.taskDone += 1;
      }
      if (done) dayHadProgress = true;
      stats.focusMinutes += Math.round((task.frogodoroSession?.timeSpent ?? 0) / 60000);
    }
    if (dayHadProgress) stats.activeDays += 1;
  }

  return stats;
}

function getPlanningLoad(days: HistoryDay[]) {
  const buckets = {
    short: { days: 0, done: 0, total: 0 },
    long: { days: 0, done: 0, total: 0 },
  };

  for (const day of days) {
    const tasks = (day.tasks ?? []).filter((task) => task.type !== 'habit');
    if (tasks.length === 0) continue;
    const bucket = tasks.length <= 3 ? buckets.short : buckets.long;
    bucket.days += 1;
    bucket.total += tasks.length;
    bucket.done += tasks.filter((task) => task.completed).length;
  }

  const shortRate = rate(buckets.short.done, buckets.short.total);
  const longRate = rate(buckets.long.done, buckets.long.total);
  const hasBoth = buckets.short.total > 0 && buckets.long.total > 0;

  return {
    ...buckets,
    message: hasBoth
      ? shortRate >= longRate
        ? `Short lists are ${Math.round(shortRate - longRate)} points easier to finish.`
        : `Longer lists are performing better in this range.`
      : '',
  };
}

function getTagStats(days: HistoryDay[], tags: TagDef[]) {
  const tagLookup = new Map(tags.map((tag) => [tag.id, tag]));
  const map = new Map<string, { id: string; name: string; color: string; done: number; total: number }>();

  for (const day of days) {
    for (const task of day.tasks ?? []) {
      for (const tagId of task.tags ?? []) {
        const tag = tagLookup.get(tagId);
        const current = map.get(tagId) ?? {
          id: tagId,
          name: tag?.name ?? tagId,
          color: tag?.color ?? '#10b981',
          done: 0,
          total: 0,
        };
        current.total += 1;
        if (task.completed) current.done += 1;
        map.set(tagId, current);
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function getDayRhythm(days: HistoryDay[]) {
  const buckets = WEEKDAYS.map((label) => ({ label, done: 0, total: 0 }));

  for (const day of days) {
    const dow = new Date(`${day.date}T12:00:00Z`).getUTCDay();
    const tasks = day.tasks ?? [];
    buckets[dow].total += tasks.length;
    buckets[dow].done += tasks.filter((task) => task.completed).length;
  }

  const active = buckets.filter((bucket) => bucket.total > 0);
  const sorted = [...active].sort((a, b) => rate(b.done, b.total) - rate(a.done, a.total));

  return {
    best: sorted[0] ?? null,
    weakest: sorted[sorted.length - 1] ?? null,
  };
}

function rate(done: number, total: number) {
  return total > 0 ? (done / total) * 100 : 0;
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  compact = false,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  compact?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={cn('flex shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary', compact ? 'h-9 w-9' : 'h-10 w-10')}>
        <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
          {title}
        </h3>
        <p className="mt-0.5 text-xs font-semibold leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'primary' | 'emerald' | 'blue';
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary border-primary/15',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/15',
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/15',
  }[tone];

  return (
    <div className={cn('rounded-[20px] border p-3 shadow-sm', toneClass)}>
      <div className="text-[9px] font-black uppercase tracking-wider opacity-75">{label}</div>
      <div className="mt-2 text-2xl font-black leading-none tracking-tight">{value}</div>
      <div className="mt-1 text-[10px] font-bold text-muted-foreground">{detail}</div>
    </div>
  );
}

function LoadCard({
  label,
  data,
}: {
  label: string;
  data: { days: number; done: number; total: number };
}) {
  const value = Math.round(rate(data.done, data.total));
  return (
    <div className="rounded-2xl border border-border/50 bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-sm font-black text-foreground">{data.total > 0 ? `${value}%` : '-'}</span>
      </div>
      <ProgressBar value={value} className="mt-3" />
      <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
        {data.days} days, {data.done} of {data.total} tasks done
      </p>
    </div>
  );
}

function TagRow({
  tag,
}: {
  tag: { id: string; name: string; color: string; done: number; total: number };
}) {
  const value = Math.round(rate(tag.done, tag.total));
  return (
    <div className="rounded-2xl border border-border/50 bg-background/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
          <span className="truncate text-sm font-black text-foreground">{tag.name}</span>
        </div>
        <span className="text-xs font-black text-muted-foreground">{value}%</span>
      </div>
      <ProgressBar value={value} color={tag.color} />
      <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
        {tag.done} of {tag.total} tagged items done
      </p>
    </div>
  );
}

function RhythmLine({
  label,
  item,
}: {
  label: string;
  item: { label: string; done: number; total: number } | null;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-background/60 px-3 py-2.5">
      <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-black text-foreground">
        {item ? `${item.label} · ${Math.round(rate(item.done, item.total))}%` : '-'}
      </span>
    </div>
  );
}

function CompareRow({
  label,
  current,
  previous,
  disabled = false,
}: {
  label: string;
  current: number;
  previous: number;
  disabled?: boolean;
}) {
  if (disabled) {
    return <CompareShell label={label} value="-" detail="no data" />;
  }
  const diff = Math.round(current - previous);
  return (
    <CompareShell
      label={label}
      value={`${Math.round(current)}%`}
      detail={`${diff >= 0 ? '+' : ''}${diff} pts`}
      positive={diff >= 0}
    />
  );
}

function CompareCount({
  label,
  current,
  previous,
}: {
  label: string;
  current: number;
  previous: number;
}) {
  const diff = current - previous;
  return (
    <CompareShell
      label={label}
      value={String(current)}
      detail={`${diff >= 0 ? '+' : ''}${diff}`}
      positive={diff >= 0}
    />
  );
}

function CompareShell({
  label,
  value,
  detail,
  positive,
}: {
  label: string;
  value: string;
  detail: string;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-background/60 px-3 py-2.5">
      <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-black text-foreground">{value}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black', positive === undefined ? 'bg-muted text-muted-foreground' : positive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400')}>
          {detail}
        </span>
      </div>
    </div>
  );
}

function ProgressBar({
  value,
  color,
  className,
}: {
  value: number;
  color?: string;
  className?: string;
}) {
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}
