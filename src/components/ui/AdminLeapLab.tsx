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
import { LeapJoinContent, LeapJoinSheet } from '@/components/leap/LeapJoinSheet';
import { announceLeapHop, buildLeapHopToast } from '@/components/leap/leapHopToast';
import { LeapZoneContent, LeapZoneSheet } from '@/components/leap/LeapZoneSheet';
import {
  LEAP_LAB_JOINS,
  LEAP_LAB_RESULTS,
  LEAP_LAB_SCENARIOS,
  labHop,
  type LeapLabHopKind,
} from '@/lib/leap/labScenarios';
import { leapViewKey } from '@/lib/leap/viewKey';
import type { LeapView, LeapWeekResult } from '@/lib/leap/types';
import { cn } from '@/lib/utils';

const HOP_KINDS: Array<[string, LeapLabHopKind]> = [
  ['Early in the week', 'early'],
  ['Past halfway', 'hop'],
  ['Below the stay line', 'stay'],
  ['Comeback', 'comeback'],
  ['Lucky flies', 'lucky'],
  ['Out of the demotion zone', 'hold'],
];

type MomentPick =
  | { kind: 'join'; index: number }
  | { kind: 'zone'; hop: 'leap' | 'top' }
  | { kind: 'result'; index: number };

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-[780px] w-[390px] max-w-full shrink-0 flex-col overflow-hidden rounded-[40px] border-[6px] border-foreground/85 bg-background shadow-xl">
      {children}
    </div>
  );
}

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
  const [joinIndex, setJoinIndex] = useState<number | null>(null);
  const [zoneHop, setZoneHop] = useState<'leap' | 'top' | null>(null);
  const [pick, setPick] = useState<MomentPick>({ kind: 'join', index: 0 });
  const [pickKey, setPickKey] = useState(0);

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
  const joins = useMemo(
    () =>
      LEAP_LAB_JOINS.map((entry) => ({
        ...entry,
        view: { ...entry.view, rewardCatalog: catalog },
      })),
    [catalog],
  );
  const openJoin = joinIndex === null ? null : joins[joinIndex];
  const zoneResult = (hop: 'leap' | 'top') => ({ ...labHop(hop), catalog });
  const choose = (next: MomentPick) => {
    setPick(next);
    setPickKey((key) => key + 1);
  };
  const playPick = () => {
    if (pick.kind === 'join') setJoinIndex(pick.index);
    else if (pick.kind === 'zone') setZoneHop(pick.hop);
    else setResult(LEAP_LAB_RESULTS[pick.index]?.result ?? null);
  };
  const moments: Array<{ label: string; value: MomentPick }> = [
    ...joins.map((entry, index) => ({
      label: `Join: ${entry.label}`,
      value: { kind: 'join' as const, index },
    })),
    { label: 'Promotion zone reached', value: { kind: 'zone', hop: 'leap' } },
    { label: 'Top prize reached', value: { kind: 'zone', hop: 'top' } },
    ...LEAP_LAB_RESULTS.map((entry, index) => ({
      label: `Results: ${entry.label}`,
      value: { kind: 'result' as const, index },
    })),
  ];
  const samePick = (a: MomentPick, b: MomentPick) => JSON.stringify(a) === JSON.stringify(b);
  const renderMoment = (wide: boolean) => {
    const key = `${pickKey}-${wide ? 'web' : 'phone'}`;
    if (pick.kind === 'join' && joins[pick.index]) {
      return (
        <LeapJoinContent
          key={key}
          join={joins[pick.index].join}
          view={joins[pick.index].view}
          active
          quiet
          wide={wide}
          onClose={() => {}}
        />
      );
    }
    if (pick.kind === 'zone') {
      return (
        <LeapZoneContent
          key={key}
          result={zoneResult(pick.hop)}
          view={resultView}
          active
          quiet
          wide={wide}
          onClose={() => {}}
        />
      );
    }
    if (pick.kind === 'result' && LEAP_LAB_RESULTS[pick.index]) {
      return (
        <LeapDayContent
          key={key}
          result={LEAP_LAB_RESULTS[pick.index].result}
          view={resultView}
          active
          quiet
          wide={wide}
          onClose={() => {}}
        />
      );
    }
    return null;
  };

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
        note="Shown in the home strip right after a habit tick, or when the goal can still be hit today. Only weeks with a promotion line reach the strip; the other states here are card-only."
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

      <Section
        title="Hop toasts"
        note="What appears when a habit is ticked. The first habit, the promotion zone and the top prize open full-screen moments instead. Play shows the real toast."
      >
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
                  <span className="flex h-8 shrink-0 items-center rounded-full bg-white/20 px-3.5 text-sm font-black text-primary">
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

      <section className="space-y-3">
        <div>
          <h2 className="text-[18px] font-black text-foreground">Full-screen moments</h2>
          <p className="text-[13px] font-semibold text-muted-foreground">
            Joining the league (once, first habit), reaching the promotion zone or top prize (once a week), and the
            Monday results (once a week). Play opens the real full-screen version.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-6">
          <PhoneFrame>{renderMoment(false)}</PhoneFrame>
          <div className="flex max-w-[360px] flex-col gap-2">
            {moments.map((moment) => (
              <button
                key={moment.label}
                type="button"
                onClick={() => choose(moment.value)}
                className={cn(
                  'rounded-xl px-3 py-2 text-left text-[13px] font-black transition',
                  samePick(pick, moment.value)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/70 text-foreground hover:bg-muted',
                )}
              >
                {moment.label}
              </button>
            ))}
            <button
              type="button"
              onClick={playPick}
              className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-[12.5px] font-black text-background"
            >
              <Play className="h-3 w-3 fill-current" />
              Play full screen
            </button>
          </div>
        </div>
        <p className="pt-2 text-[12px] font-black uppercase tracking-[0.06em] text-muted-foreground">
          Web (1024px and wider)
        </p>
        <div className="relative flex h-[640px] w-full max-w-[1180px] flex-col overflow-hidden rounded-[20px] border-[6px] border-foreground/85 bg-background shadow-xl">
          {renderMoment(true)}
        </div>
      </section>

      {openJoin && (
        <LeapJoinSheet
          join={openJoin.join}
          view={openJoin.view}
          open={!!openJoin}
          onClose={() => setJoinIndex(null)}
        />
      )}

      {zoneHop && (
        <LeapZoneSheet
          result={zoneResult(zoneHop)}
          view={resultView}
          open={!!zoneHop}
          onClose={() => setZoneHop(null)}
        />
      )}

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
