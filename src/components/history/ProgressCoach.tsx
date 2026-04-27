'use client';

import React from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
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
    label: 'Keep',
    className: 'border-emerald-500/20 bg-emerald-500/5',
    iconClassName: 'text-emerald-500 bg-emerald-500/10',
  },
  weakness: {
    icon: AlertTriangle,
    label: 'Fix',
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
            focusMinutes: task.frogodoroSession?.timeSpent ?? 0,
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
          nextWeekPlan: ['Complete a few tasks or habits, then check this view again.'],
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
    <section className="rounded-[28px] border border-primary/15 bg-primary/[0.03] p-4 sm:p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
            <Brain className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
                Progress Coach
              </h3>
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary">
                Pro
              </span>
            </div>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-muted-foreground">
              {loading && !hasInsightContent ? 'Reading your recent patterns...' : data.summary}
            </p>
          </div>
        </div>

        <button
          onClick={() => setRefreshIndex((value) => value + 1)}
          disabled={loading}
          className="shrink-0 rounded-xl border border-border/60 bg-background/60 p-2 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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

      {error ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
          {error}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <QuickRead
                icon={ShieldCheck}
                label="Keep"
                value={data.strongestPattern || 'No clear strength yet.'}
                iconClassName="text-emerald-500 bg-emerald-500/10"
              />
              <QuickRead
                icon={AlertTriangle}
                label="Fix"
                value={data.biggestRisk || 'No clear risk yet.'}
                iconClassName="text-amber-500 bg-amber-500/10"
              />
            </div>
          </div>

          {data.nextWeekPlan.length > 0 && (
            <div className="rounded-2xl border border-primary/15 bg-primary/[0.04] p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
                <Target className="h-4 w-4 text-primary" />
                Do next
              </div>
              <div className="space-y-2">
                {data.nextWeekPlan.map((step, index) => (
                  <div key={`${step}-${index}`} className="flex items-start gap-2.5">
                    <div className="mt-0.5 rounded-full bg-primary/10 p-1 text-primary">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </div>
                    <p className="text-sm font-semibold leading-relaxed text-foreground">
                      {step}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.insights.length > 0 ? (
            <div className="space-y-2">
              {data.insights.map((insight, index) => (
                <InsightCard key={`${insight.title}-${index}`} insight={insight} />
              ))}
            </div>
          ) : (
            !loading && (
              <div className="rounded-2xl border border-border/60 bg-background/50 p-4 text-center text-xs font-semibold text-muted-foreground">
                Complete more tasks in this range to get pattern-level coaching.
              </div>
            )
          )}

          {loading && hasInsightContent && (
            <div className="flex items-center justify-center gap-2 py-1 text-xs font-bold text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Updating coach read
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function QuickRead({
  icon: Icon,
  label,
  value,
  iconClassName,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  iconClassName: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={cn('shrink-0 rounded-xl p-2', iconClassName)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="mb-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <p className="text-sm font-black leading-snug text-foreground">
          {value}
        </p>
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: AnalyticsCoachInsight }) {
  const style = insightStyles[insight.type] ?? insightStyles.experiment;
  const Icon = style.icon;

  return (
    <article className={cn('rounded-2xl border p-3.5', style.className)}>
      <div className="flex items-start gap-3">
        <div className={cn('shrink-0 rounded-xl p-2', style.iconClassName)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-background/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
              {style.label}
            </span>
            <h4 className="text-sm font-black leading-snug text-foreground">
              {insight.title}
            </h4>
          </div>
          {insight.body && (
            <p className="text-xs font-medium leading-snug text-muted-foreground">
              {insight.body}
            </p>
          )}
          {insight.action && (
            <p className="mt-2 text-xs font-black leading-snug text-foreground">
              {insight.action}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
