'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { SWRConfig } from 'swr';
import { useTheme } from 'next-themes';
import { ArrowLeft, Play } from 'lucide-react';
import {
  TOAST_SURFACE_STYLE,
  useNotification,
} from '@/components/providers/NotificationProvider';
import { StatusDock } from '@/components/home/StatusDock';
import TaskCard from '@/components/board/TaskCard';
import type { Task } from '@/components/board/helpers';
import { LeapStripRow } from '@/components/leap/LeapStripRow';
import { LeapLeagueCard } from '@/components/leap/LeapLeagueCard';
import { LeapDayContent, LeapDaySheet } from '@/components/leap/LeapDaySheet';
import { announceLeapHop, buildLeapHopToast } from '@/components/leap/leapHopToast';
import {
  LEAP_LAB_RESULTS,
  LEAP_LAB_SCENARIOS,
  labHop,
} from '@/lib/leap/labScenarios';
import { leapViewKey } from '@/lib/leap/viewKey';
import type { LeapView, LeapWeekResult } from '@/lib/leap/types';
import { cn } from '@/lib/utils';

const HOP_KINDS = [
  ['Plain hop', 'hop'],
  ['Comeback', 'comeback'],
  ['Lucky flies', 'lucky'],
  ['First hop ever', 'first'],
  ['Out of the demotion zone', 'hold'],
  ['Promotion zone', 'leap'],
] as const;

const SAMPLE_TAGS = [
  { id: 'lab-fitness', name: 'Fitness', color: '#8b5cf6' },
  { id: 'lab-mind', name: 'Mindfulness', color: '#ec4899' },
  { id: 'lab-home', name: 'Home', color: '#3b82f6' },
];

const SAMPLE_TASKS: Array<{ label: string; task: Task; repeating: boolean }> = [
  {
    label: 'Repeating, with a streak',
    repeating: true,
    task: { id: 'lab-walk', text: 'Morning walk', order: 0, type: 'weekly', streak: 6, startTime: '07:30', tags: ['lab-fitness'] },
  },
  {
    label: 'Repeating, done today',
    repeating: true,
    task: { id: 'lab-read', text: 'Read 10 pages', order: 1, type: 'weekly', completed: true, tags: ['lab-mind', 'lab-home'] },
  },
  {
    label: 'One-off task (no lily)',
    repeating: false,
    task: { id: 'lab-call', text: 'Call the dentist', order: 2, type: 'regular', startTime: '10:00', tags: ['lab-home'] },
  },
];

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex w-[390px] max-w-full shrink-0 flex-col gap-2">
      <p className="px-1 text-[12px] font-black uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </p>
      <div className="rounded-[28px] border border-border/70 bg-background p-3 shadow-sm">
        {children}
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[18px] font-black text-foreground">{title}</h2>
        {note && <p className="text-[13px] font-semibold text-muted-foreground">{note}</p>}
      </div>
      <div className="flex flex-wrap gap-5">{children}</div>
    </section>
  );
}

function ScenarioData({ view, children }: { view: LeapView; children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        provider: () => new Map(),
        fallback: { [leapViewKey()]: view },
        revalidateOnMount: false,
        revalidateIfStale: false,
        revalidateOnFocus: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}

export function AdminLeapLab() {
  const { showNotification } = useNotification();
  const { resolvedTheme, setTheme } = useTheme();
  const [catalog, setCatalog] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<LeapWeekResult | null>(null);

  useEffect(() => {
    void fetch('/api/admin/leap')
      .then((res) => res.json())
      .then((payload) => {
        const entries = (payload.catalog ?? []).map((item: { id: string }) => [item.id, item]);
        setCatalog(Object.fromEntries(entries));
      })
      .catch(() => {});
  }, []);

  const scenarios = useMemo(
    () =>
      LEAP_LAB_SCENARIOS.map((entry) => ({
        ...entry,
        view: { ...entry.view, rewardCatalog: catalog },
      })),
    [catalog],
  );
  const resultView = scenarios[2]?.view;

  return (
    <div className="mx-auto max-w-[1300px] space-y-10 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="grid h-9 w-9 place-items-center rounded-full bg-muted text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-foreground">Leap Lab</h1>
            <p className="text-sm text-muted-foreground">
              Every Leap surface, in every state, with sample data. Nothing here touches your account.
            </p>
          </div>
        </div>
        <div className="flex gap-1 rounded-xl bg-muted/60 p-1">
          {(['light', 'dark'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTheme(mode)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[13px] font-black capitalize transition',
                resolvedTheme === mode
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground',
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <Section title="Quests page card" note="The Leap card under Today's quests.">
        {scenarios.map((entry) => (
          <Frame key={entry.id} label={entry.label}>
            <ScenarioData view={entry.view}>
              <LeapLeagueCard />
            </ScenarioData>
          </Frame>
        ))}
      </Section>

      <Section
        title="Home quest strip"
        note="Shown in the home strip right after a habit tick, or when the goal can still be hit today."
      >
        {scenarios.map((entry) => (
          <Frame key={entry.id} label={entry.label}>
            <StatusDock>
              <div className="min-w-0 md:flex-1">
                <LeapStripRow view={entry.view} />
              </div>
            </StatusDock>
          </Frame>
        ))}
      </Section>

      <Section title="Task rows" note="Repeating tasks lead their detail line with your current Lily stage; one-off tasks don't.">
        {SAMPLE_TASKS.map((entry) => (
          <Frame key={entry.task.id} label={entry.label}>
            <TaskCard
              dragId={entry.task.id}
              task={entry.task}
              menuOpen={false}
              onToggleMenu={() => {}}
              onGrab={() => {}}
              userTags={SAMPLE_TAGS}
              isRepeating={entry.repeating}
              showStreak
              isToday
              disableDrag
            />
          </Frame>
        ))}
      </Section>

      <Section title="Hop toasts" note="What appears when a habit is ticked. Play shows the real toast.">
        {HOP_KINDS.map(([label, kind]) => {
          const hop = { ...labHop(kind), catalog };
          const spec = buildLeapHopToast(hop);
          return (
            <Frame key={kind} label={label}>
              <div
                style={TOAST_SURFACE_STYLE}
                className="dark flex min-h-12 w-full items-center gap-3 rounded-[18px] px-3.5 py-2 text-foreground"
              >
                <div className="min-w-0 flex-1 text-sm font-semibold">{spec?.content}</div>
                {spec?.gifts.length ? (
                  <span className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-black text-primary">
                    Open
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => announceLeapHop(hop, showNotification)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12px] font-black text-foreground"
              >
                <Play className="h-3 w-3 fill-current" />
                Play
              </button>
            </Frame>
          );
        })}
      </Section>

      <Section title="Monday results" note="Shown once, the first time the app opens in a new week.">
        {LEAP_LAB_RESULTS.map((entry) => (
          <Frame key={entry.label} label={entry.label}>
            <div className="rounded-[24px] bg-card px-4 pb-4 pt-5">
              <LeapDayContent
                result={entry.result}
                view={resultView}
                active
                quiet
                onClose={() => setResult(entry.result)}
              />
            </div>
            <button
              type="button"
              onClick={() => setResult(entry.result)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12px] font-black text-foreground"
            >
              <Play className="h-3 w-3 fill-current" />
              Open as sheet
            </button>
          </Frame>
        ))}
      </Section>

      {result && (
        <LeapDaySheet
          result={result}
          view={resultView}
          open={!!result}
          onClose={() => setResult(null)}
        />
      )}
    </div>
  );
}
