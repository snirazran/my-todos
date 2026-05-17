'use client';

import React from 'react';
import {
  AlertTriangle,
  Brain,
  Check,
  FlaskConical,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  AnalyticsCoachInsight,
  AnalyticsCoachResponse,
} from '@/app/api/analytics/insights/route';

type ProgressCoachProps = {
  historyData: any[];
  dateRange: any;
  selectedTags: string[];
  availableTags: { id: string; name: string; color: string }[];
};

const EMPTY_RESPONSE: AnalyticsCoachResponse = {
  summary: '',
  strongestPattern: '',
  biggestRisk: '',
  nextWeekPlan: [],
  insights: [],
};

const insightStyles: Record<
  AnalyticsCoachInsight['type'],
  {
    icon: React.ElementType;
    label: string;
    className: string;
    iconClassName: string;
  }
> = {
  strength: {
    icon: ShieldCheck,
    label: 'Works',
    className: 'border-emerald-500/20 bg-emerald-500/5',
    iconClassName: 'text-emerald-500 bg-emerald-500/10',
  },
  weakness: {
    icon: AlertTriangle,
    label: 'Adjust',
    className: 'border-amber-500/20 bg-amber-500/5',
    iconClassName: 'text-amber-500 bg-amber-500/10',
  },
  experiment: {
    icon: FlaskConical,
    label: 'Try',
    className: 'border-blue-500/20 bg-blue-500/5',
    iconClassName: 'text-blue-500 bg-blue-500/10',
  },
};

export default function ProgressCoach({
  historyData,
  dateRange,
  selectedTags,
  availableTags,
}: ProgressCoachProps) {
  const [data, setData] = React.useState<AnalyticsCoachResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = React.useState(0);

  const requestKey = React.useMemo(
    () =>
      JSON.stringify({
        dateRange,
        selectedTags,
        days: historyData.map((day) => ({
          date: day.date,
          tasks: (day.tasks ?? []).map((task: any) => ({
            text: task.text,
            type: task.type,
            completed: task.completed,
            tags: task.tags,
            focusMinutes: task.frogodoroSession?.focusTime ?? 0,
          })),
        })),
      }),
    [dateRange, historyData, selectedTags],
  );

  React.useEffect(() => {
    const controller = new AbortController();

    async function loadInsights() {
      if (historyData.length === 0) {
        setData({
          ...EMPTY_RESPONSE,
          summary: 'No task history is available for this range yet.',
          biggestRisk: 'There is not enough activity here to find a reliable pattern.',
          nextWeekPlan: ['Complete a few tasks, then check this view again.'],
        });
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/analytics/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            historyData,
            dateRange,
            selectedTags,
            availableTags,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to load coach insights');
        }

        const nextData = (await res.json()) as AnalyticsCoachResponse;
        setData({
          ...EMPTY_RESPONSE,
          ...nextData,
          nextWeekPlan: nextData.nextWeekPlan ?? [],
          insights: nextData.insights ?? [],
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setError(err?.message ?? 'Failed to load coach insights');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadInsights();

    return () => controller.abort();
  }, [requestKey, refreshIndex, historyData, dateRange, selectedTags, availableTags]);

  const hasInsightContent =
    data.summary ||
    data.strongestPattern ||
    data.biggestRisk ||
    data.nextWeekPlan.length > 0 ||
    data.insights.length > 0;

  return (
    <section className="space-y-3">
      {error ? (
        <div className="rounded-[24px] border border-destructive/20 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
          {error}
        </div>
      ) : (
        <>
          <div className="rounded-[24px] border border-border/50 bg-card/70 p-4 shadow-sm backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Brain className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                      Main insight
                    </span>
                  </div>
                  <p className="text-sm font-black leading-snug text-foreground">
                    {loading && !hasInsightContent
                      ? 'Reading your recent patterns...'
                      : data.summary || 'Your plan will appear here.'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setRefreshIndex((value) => value + 1)}
                disabled={loading}
                className="shrink-0 rounded-xl border border-border/60 bg-background/70 p-2 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Refresh progress coach"
                title="Refresh progress coach"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <QuickRead
              icon={ShieldCheck}
              label="Works"
              value={data.strongestPattern || 'No clear strength yet.'}
              className="border-emerald-500/20 bg-emerald-500/[0.04]"
              iconClassName="text-emerald-500 bg-emerald-500/10"
            />
            <QuickRead
              icon={AlertTriangle}
              label="Adjust"
              value={data.biggestRisk || 'No clear risk yet.'}
              className="border-amber-500/20 bg-amber-500/[0.05]"
              iconClassName="text-amber-500 bg-amber-500/10"
            />
          </div>

          {data.nextWeekPlan.length > 0 && (
            <div className="rounded-[24px] border border-primary/20 bg-primary/[0.04] p-4 shadow-sm">
              <SectionTitle icon={Target} label="Do next" />
              <div className="mt-3 space-y-2">
                {data.nextWeekPlan.map((step, index) => (
                  <div
                    key={`${step}-${index}`}
                    className="flex items-start gap-3 rounded-2xl bg-background/55 px-3 py-2.5"
                  >
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <span className="text-[11px] font-black">{index + 1}</span>
                    </div>
                    <p className="text-sm font-bold leading-snug text-foreground">
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.insights.length > 0 && (
            <div className="space-y-2">
              {data.insights.map((insight, index) => (
                <InsightCard key={`${insight.title}-${index}`} insight={insight} />
              ))}
            </div>
          )}

          {loading && hasInsightContent && (
            <div className="flex items-center justify-center gap-2 py-1 text-xs font-bold text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Updating coach read
            </div>
          )}
        </>
      )}
    </section>
  );
}

function QuickRead({
  icon: Icon,
  label,
  value,
  className,
  iconClassName,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  className: string;
  iconClassName: string;
}) {
  return (
    <div className={cn('rounded-[22px] border p-4 shadow-sm', className)}>
      <div className="mb-3 flex items-center gap-2">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', iconClassName)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
      </div>
      <p className="text-sm font-black leading-snug text-foreground">{value}</p>
    </div>
  );
}

function InsightCard({ insight }: { insight: AnalyticsCoachInsight }) {
  const style = insightStyles[insight.type] ?? insightStyles.experiment;
  const Icon = style.icon;

  return (
    <article className={cn('rounded-[24px] border p-4 shadow-sm', style.className)}>
      <SectionTitle icon={Icon} label={style.label} />
      <div className="mt-3 flex items-start gap-3">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', style.iconClassName)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-black leading-snug text-foreground">
            {insight.title}
          </h4>
          {insight.body && (
            <p className="mt-1 text-xs font-semibold leading-snug text-muted-foreground">
              {insight.body}
            </p>
          )}
          {insight.action && (
            <div className="mt-3 flex items-start gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <p className="text-xs font-black leading-snug text-foreground">
                {insight.action}
              </p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function SectionTitle({
  icon: Icon,
  label,
}: {
  icon: React.ElementType;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
      <Icon className="h-4 w-4 text-primary" />
      {label}
    </div>
  );
}
