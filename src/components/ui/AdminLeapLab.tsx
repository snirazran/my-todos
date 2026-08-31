'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { SWRConfig } from 'swr';
import { ArrowLeft, Loader2, RotateCcw } from 'lucide-react';
import { PactCard } from '@/components/pact/PactCard';
import { PactChangeSheet } from '@/components/pact/PactChangeSheet';
import { PactPickSheet } from '@/components/pact/PactPickSheet';
import { PactWeekResultSheet } from '@/components/pact/PactWeekResultSheet';
import { NextQuestStrip } from '@/components/ui/NextQuestStrip';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import { openShieldSheet } from '@/hooks/useShields';
import { pactViewKey } from '@/lib/pact/viewKey';
import {
  LEAP_LAB_SCENARIOS,
  type LeapLabGroup,
  type LeapLabScenario,
} from '@/lib/pact/labScenarios';
import type { PactView, PactWeekResult } from '@/lib/pact/types';
import { cn } from '@/lib/utils';

const GROUPS: LeapLabGroup[] = ['Access', 'Week', 'Streak', 'Settlement'];

type WriteLog = { at: string; method: string; url: string };

function useSafeWrites(viewRef: React.RefObject<PactView | null>) {
  const [log, setLog] = useState<WriteLog[]>([]);

  useEffect(() => {
    const real = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = (
        init?.method ??
        (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();

      if (method === 'GET' || !url.includes('/api/')) {
        return real(input, init);
      }

      setLog((prev) =>
        [
          {
            at: new Date().toLocaleTimeString(),
            method,
            url: url.replace(/^https?:\/\/[^/]+/, ''),
          },
          ...prev,
        ].slice(0, 12),
      );

      const view = viewRef.current;
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      if (!view) return json({ ok: true });
      if (url.includes('/api/pact/claim') && view.active) {
        return json({
          ...view,
          active: { ...view.active, claimed: true, claimable: false },
        });
      }
      if (url.includes('/api/pact/retro')) {
        return json({ ...view, forgoneFlies: 0 });
      }
      if (url.includes('/api/pact')) return json(view);
      return json({ ok: true });
    };

    return () => {
      window.fetch = real;
    };
  }, [viewRef]);

  return { log, clearLog: () => setLog([]) };
}

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold',
        on
          ? 'bg-lime-500/15 text-lime-700 dark:text-lime-400'
          : 'bg-red-500/10 text-red-600 dark:text-red-400',
      )}
    >
      <span className="font-mono">{on ? 'true' : 'false'}</span>
      {label}
    </span>
  );
}

function Stage({
  title,
  width,
  children,
}: {
  title: string;
  width: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div
        className="rounded-3xl border border-border/60 bg-muted/40 p-3"
        style={{ width, maxWidth: '100%' }}
      >
        {children}
      </div>
    </div>
  );
}

export function AdminLeapLab() {
  const [base, setBase] = useState<PactView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState('missed-catchable');
  const [nonce, setNonce] = useState(0);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickIntro, setPickIntro] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [sheetResult, setSheetResult] = useState<PactWeekResult | null>(null);
  // The hop plays once per mount, so replaying it means a new sheet.
  const [sheetRun, setSheetRun] = useState(0);

  const viewRef = useRef<PactView | null>(null);
  const { log, clearLog } = useSafeWrites(viewRef);

  useEffect(() => {
    let alive = true;
    fetch(pactViewKey())
      .then((res) => res.json())
      .then((data) => {
        if (!alive) return;
        if (!data || typeof data !== 'object' || !('weekKey' in data)) {
          setError('The pact view came back in an unexpected shape.');
          return;
        }
        setBase(data as PactView);
      })
      .catch(() => alive && setError('Could not load the baseline pact view.'));
    return () => {
      alive = false;
    };
  }, []);

  const scenario: LeapLabScenario | null = useMemo(
    () => LEAP_LAB_SCENARIOS.find((entry) => entry.id === scenarioId) ?? null,
    [scenarioId],
  );

  const view = useMemo(
    () => (base && scenario ? scenario.apply(base) : null),
    [base, scenario],
  );

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const selectScenario = (next: LeapLabScenario) => {
    setScenarioId(next.id);
    setSheetResult(null);
    setNonce((value) => value + 1);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <p className="text-sm font-bold text-red-600">{error}</p>
      </div>
    );
  }

  if (!base || !view || !scenario) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const active = view.active;

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
        <header className="flex flex-col gap-2">
          <Link
            href="/admin"
            className="inline-flex w-fit items-center gap-1.5 text-[13px] font-bold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Admin
          </Link>
          <h1 className="text-2xl font-black tracking-tight">Leap lab</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every Leap state, rendered by the real card. The baseline is your
            own live pact view, so config, prices and the reward catalog are
            whatever is deployed. Nothing here can write to your account: every
            non-GET request is intercepted and logged instead of sent.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <nav className="flex flex-col gap-4">
            {GROUPS.map((group) => {
              const entries = LEAP_LAB_SCENARIOS.filter(
                (entry) => entry.group === group,
              );
              if (!entries.length) return null;
              return (
                <div key={group} className="flex flex-col gap-1.5">
                  <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                    {group}
                  </p>
                  {entries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => selectScenario(entry)}
                      className={cn(
                        'rounded-xl px-3 py-2 text-left text-[13px] font-bold transition-colors',
                        entry.id === scenarioId
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/60 text-foreground hover:bg-muted',
                      )}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>

          <div className="flex min-w-0 flex-col gap-5">
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
              <p className="text-[15px] font-black">{scenario.label}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {scenario.note}
              </p>
              {active && (
                <>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Flag label="canStillFinish" on={active.canStillFinish} />
                    <Flag label="canHoldStreak" on={active.canHoldStreak} />
                    <Flag label="claimable" on={active.claimable} />
                    <Flag label="openToday" on={active.openToday} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-4">
                    {[
                      ['progress / target', `${active.progress} / ${active.target}`],
                      ['missed', String(active.missedSessions)],
                      ['nearMissTarget', String(active.nearMissTarget)],
                      ['streak weeks', String(view.streak.weeks)],
                      ['full week', String(active.rewardFlies)],
                      ['settles now', String(active.payoutFlies)],
                      ['Lily Pads', String(view.streak.shields)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="font-mono font-bold tabular-nums">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setPickIntro(false);
                  setPickOpen(true);
                }}
                className="rounded-xl bg-muted px-3 py-2 text-[13px] font-bold hover:bg-muted/70"
              >
                Pick sheet
              </button>
              <button
                type="button"
                onClick={() => {
                  setPickIntro(true);
                  setPickOpen(true);
                }}
                className="rounded-xl bg-muted px-3 py-2 text-[13px] font-bold hover:bg-muted/70"
              >
                Pick sheet (intro)
              </button>
              <button
                type="button"
                onClick={() => setChangeOpen(true)}
                className="rounded-xl bg-muted px-3 py-2 text-[13px] font-bold hover:bg-muted/70"
              >
                Change sheet
              </button>
              <button
                type="button"
                onClick={() => setPlusOpen(true)}
                className="rounded-xl bg-muted px-3 py-2 text-[13px] font-bold hover:bg-muted/70"
              >
                Plus modal
              </button>
              <button
                type="button"
                onClick={() =>
                  openShieldSheet({
                    reason: 'at_risk',
                    system: 'pact',
                    atStake: view.streak.weeks,
                  })
                }
                className="rounded-xl bg-muted px-3 py-2 text-[13px] font-bold hover:bg-muted/70"
              >
                Lily Pad offer (at risk)
              </button>
              <button
                type="button"
                onClick={() =>
                  openShieldSheet({
                    reason: 'missed',
                    system: 'pact',
                    atStake: view.streak.weeks,
                  })
                }
                className="rounded-xl bg-muted px-3 py-2 text-[13px] font-bold hover:bg-muted/70"
              >
                Lily Pad offer (missed)
              </button>
              {scenario.result && (
                <button
                  type="button"
                  onClick={() => {
                    setSheetResult(scenario.result!(view));
                    setSheetRun((run) => run + 1);
                  }}
                  className="rounded-xl bg-amber-500 px-3 py-2 text-[13px] font-black text-white hover:bg-amber-600"
                >
                  Open settlement sheet
                </button>
              )}

              <button
                type="button"
                onClick={() => setNonce((value) => value + 1)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2 text-[13px] font-bold hover:bg-muted/70"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Remount
              </button>
            </div>

            <SWRConfig
              key={`${scenarioId}-${nonce}`}
              value={{
                provider: () => new Map(),
                fallback: { [pactViewKey()]: view },
                revalidateOnMount: false,
                revalidateIfStale: false,
                revalidateOnFocus: false,
                revalidateOnReconnect: false,
              }}
            >
              <div className="flex flex-col gap-6">
                <Stage title="Home banner" width={420}>
                  <PactCard variant="home" />
                </Stage>
                <Stage title="Quests panel" width={520}>
                  <PactCard variant="panel" />
                </Stage>
                {/* The third Leap surface. Rendered as the real strip rather
                    than as PactStripRow directly, so the slot contest against
                    the daily quests is part of what is on screen: a Leap that
                    loses the slot is a state worth seeing too. */}
                <Stage title="Home strip (Next up)" width={420}>
                  <NextQuestStrip />
                </Stage>
              </div>
            </SWRConfig>

            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-black">
                  Blocked writes ({log.length})
                </p>
                <button
                  type="button"
                  onClick={clearLog}
                  className="text-[12px] font-bold text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
              {log.length === 0 ? (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  Nothing yet. Claim, change or commit from the card above and
                  the request that would have been sent shows up here.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1">
                  {log.map((entry, index) => (
                    <li
                      key={`${entry.at}-${index}`}
                      className="font-mono text-[11px] text-muted-foreground"
                    >
                      <span className="font-bold text-foreground">
                        {entry.method}
                      </span>{' '}
                      {entry.url}{' '}
                      <span className="opacity-60">{entry.at}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      <PactPickSheet
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        view={view}
        forceIntro={pickIntro}
        onCommitted={() => setPickOpen(false)}
        onUpgrade={() => {
          setPickOpen(false);
          setPlusOpen(true);
        }}
      />

      <PactChangeSheet
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        view={view}
        changing={false}
        error={null}
        onConfirm={() => setChangeOpen(false)}
        onUpgrade={() => {
          setChangeOpen(false);
          setPlusOpen(true);
        }}
      />

      {/* Above the sheet's own stacking context (z 1500), so the hop can be
          replayed while it is on screen instead of only after closing it. */}
      {sheetResult && (
        <button
          type="button"
          onClick={() => setSheetRun((run) => run + 1)}
          className="fixed left-1/2 top-4 z-[1600] inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-[13px] font-black text-background shadow-lg"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Replay the hop
        </button>
      )}
      {sheetResult && (
        <PactWeekResultSheet
          key={`${sheetResult.weekKey}-${sheetRun}`}
          view={view}
          result={sheetResult}
          onClose={() => setSheetResult(null)}
          onGetShield={() => {
            setSheetResult(null);
            openShieldSheet({
              reason: 'missed',
              system: 'pact',
              atStake: view.streak.weeks,
            });
          }}
          onStartLeap={() => {
            setSheetResult(null);
            setPickIntro(false);
            setPickOpen(true);
          }}
        />
      )}

      <PlusUpgradeModal
        open={plusOpen}
        onClose={() => setPlusOpen(false)}
        placement="pact_write_own"
      />
    </div>
  );
}
