'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import { Circle, Loader2 } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { hapticSelect, hapticTick } from '@/lib/haptics';
import type { FocusSubjectKind } from '@/lib/focusSubject';

export type TimerTask = {
  id: string;
  text: string;
  completed: boolean;
  tags?: string[];
  frogodoroSettings?: Record<string, unknown>;
  frogodoroSession?: { date: string; focusTime: number; breakTime: number } | null;
  subjectKind?: FocusSubjectKind;
};

type Area = { id: string; name: string; accent: string; coverImageUrl?: string };
type Tag = { id: string; name: string; color: string };

type TasksResponse = { tasks?: TimerTask[] };
type SubjectsResponse = { areas?: Area[]; tags?: Tag[] };

// Enough of each group to choose from without scrolling past it; the rest is
// one tap away; the lane chips do the rest of the narrowing.
const TASK_CAP = 5;
const AREA_CAP = 4;
const TAG_CAP = 8;
// Filter chips over one list, not tabs between three. Material 3 reserves the
// connected-track control for mutually exclusive views; these are facets of a
// single question, so "All" is the default and nothing is hidden until the user
// chooses to narrow — which is what made the first tabbed version cost taps.
type Lane = 'all' | 'tasks' | 'areas' | 'tags';

export interface FocusSubjectPickerProps {
  active: boolean;
  onPick: (task: TimerTask) => void;
  currentSubjectId?: string;
  bindScroll?: (el: HTMLElement | null) => void;
}

function minutesLabel(seconds?: number) {
  if (!seconds || seconds < 60) return null;
  const minutes = Math.round(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m today`
    : `${minutes}m today`;
}

export function FocusSubjectPicker({
  active,
  onPick,
  currentSubjectId,
  bindScroll,
}: Readonly<FocusSubjectPickerProps>) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [lane, setLane] = useState<Lane>('all');
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: taskData, isLoading: tasksLoading } = useSWR<TasksResponse>(
    active ? `/api/tasks?date=${today}&timezone=${encodeURIComponent(timezone)}` : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const { data: subjectData, isLoading: subjectsLoading } = useSWR<SubjectsResponse>(
    active ? '/api/frogodoro/subject' : null,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false },
  );

  const loading = tasksLoading || subjectsLoading;

  const allTasks = useMemo(
    () => (taskData?.tasks ?? []).filter((task) => !task.completed),
    [taskData?.tasks],
  );
  const allAreas = subjectData?.areas ?? [];
  const allTags = subjectData?.tags ?? [];

  const inLane = (which: Exclude<Lane, 'all'>) => lane === 'all' || lane === which;

  const tasks = inLane('tasks') ? allTasks : [];
  const areas = inLane('areas') ? allAreas : [];
  const tags = inLane('tags') ? allTags : [];

  const totalOptions = allTasks.length + allAreas.length + allTags.length;

  const lanes = (
    [
      { id: 'all', label: 'All', count: totalOptions },
      { id: 'tasks', label: 'Tasks', count: allTasks.length },
      { id: 'areas', label: 'Areas', count: allAreas.length },
      { id: 'tags', label: 'Tags', count: allTags.length },
    ] satisfies Array<{ id: Lane; label: string; count: number }>
  ).filter((entry) => entry.id === 'all' || entry.count > 0);
  // With one group there is nothing to filter between.
  const showLanes = lanes.length > 2;

  // Picking a lane IS the narrowing, so it lifts the caps — asking someone who
  // just filtered to Tags to then "show 3 more" tags is the same job twice.
  const cap = (key: string, list: unknown[], limit: number) =>
    lane !== 'all' || expanded[key] ? list.length : Math.min(limit, list.length);

  const openContainer = async (kind: FocusSubjectKind, id: string, key: string) => {
    if (pendingId) return;
    hapticSelect();
    setPendingId(key);
    try {
      const res = await fetch('/api/frogodoro/subject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, timezone }),
      });
      const json = await res.json();
      if (!res.ok || !json?.task) return;
      onPick({ ...json.task, subjectKind: kind });
    } catch {
      // A failed open leaves the picker exactly as it was.
    } finally {
      setPendingId(null);
    }
  };

  const taskCount = cap('tasks', tasks, TASK_CAP);
  const areaCount = cap('areas', areas, AREA_CAP);
  const tagCount = cap('tags', tags, TAG_CAP);
  const nothingMatches =
    !loading && tasks.length === 0 && areas.length === 0 && tags.length === 0;

  return (
    <div
      ref={bindScroll}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:px-5"
    >
      {showLanes && (
        <div
          role="group"
          aria-label="Filter what to focus on"
          className="mb-3 flex flex-wrap gap-1.5"
        >
          {lanes.map((entry) => {
            const selected = lane === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  hapticTick();
                  setLane(entry.id);
                }}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-black transition-colors ${
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/60 bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                {entry.label}
                <span
                  className={`tabular-nums ${
                    selected ? 'text-primary-foreground/70' : 'text-muted-foreground/60'
                  }`}
                >
                  {entry.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* The fastest path out of this sheet, so it sits first and reads as the
          default rather than a footnote parked at the bottom. */}
      {lane === 'all' && (
        <button
          type="button"
          data-hint="focus-subject"
          onClick={() => void openContainer('open', '', 'open')}
          className="mb-5 flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.07] px-4 py-2.5 text-left transition-colors hover:bg-primary/[0.12] active:scale-[0.99]"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {pendingId === 'open' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Icon name="clock" className="h-7 w-7" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-black leading-tight text-foreground">
              Just focus
            </span>
            <span className="block text-[12px] font-semibold leading-tight text-muted-foreground">
              Start now, tick off what you finished after
            </span>
          </span>
        </button>
      )}

      {loading ? (
        <div
          className="flex h-28 items-center justify-center gap-2 text-sm font-bold text-muted-foreground"
          role="status"
        >
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Loading…
        </div>
      ) : (
        <>
          {/* Each group wears the shape it already has elsewhere in the app —
              tasks as task rows, areas as their artwork, tags as tag pills —
              so the list is scannable by form, not just by heading. */}
          <Section
            title="Today's tasks"
            show={tasks.length > 0}
            hidden={tasks.length - taskCount}
            onShowAll={() => {
              hapticTick();
              setExpanded((prev) => ({ ...prev, tasks: true }));
            }}
          >
            <div className="flex flex-col gap-1.5">
              {tasks.slice(0, taskCount).map((task) => {
                const selected = currentSubjectId === task.id;
                const meta = minutesLabel(task.frogodoroSession?.focusTime);
                return (
                  <button
                    key={task.id}
                    type="button"
                    data-hint="focus-subject"
                    onClick={() => {
                      hapticSelect();
                      onPick({ ...task, subjectKind: 'task' });
                    }}
                    className={`flex min-h-[56px] w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-[transform,box-shadow,background-color,color,opacity] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      selected
                        ? 'border-primary/60 bg-primary/5'
                        : 'border-border/60 bg-card hover:border-border hover:bg-muted/45'
                    }`}
                  >
                    <Circle
                      className="h-7 w-7 shrink-0 text-muted-foreground/45"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-foreground">
                        {task.text}
                      </span>
                      {meta && (
                        <span className="block truncate text-[12px] font-semibold text-muted-foreground">
                          {meta}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section
            title="Areas"
            show={areas.length > 0}
            hidden={areas.length - areaCount}
            onShowAll={() => {
              hapticTick();
              setExpanded((prev) => ({ ...prev, areas: true }));
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              {areas.slice(0, areaCount).map((area) => {
                const selected = currentSubjectId === `focus-area:${area.id}`;
                const busy = pendingId === `area:${area.id}`;
                return (
                  <button
                    key={area.id}
                    type="button"
                    data-hint="focus-subject"
                    onClick={() => void openContainer('area', area.id, `area:${area.id}`)}
                    className={`relative flex h-24 flex-col justify-end overflow-hidden rounded-2xl border p-2.5 text-left transition-[transform,box-shadow,background-color,color,opacity] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      selected ? 'border-primary' : 'border-border/60'
                    }`}
                    style={{ backgroundColor: area.accent }}
                  >
                    {area.coverImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={area.coverImageUrl}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent"
                    />
                    <span className="relative truncate text-[14px] font-black leading-tight text-white drop-shadow">
                      {area.name}
                    </span>
                    {busy && (
                      <span className="absolute inset-0 grid place-items-center bg-black/35">
                        <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section
            title="Tags"
            show={tags.length > 0}
            hidden={tags.length - tagCount}
            onShowAll={() => {
              hapticTick();
              setExpanded((prev) => ({ ...prev, tags: true }));
            }}
          >
            <div className="flex flex-wrap gap-2">
              {tags.slice(0, tagCount).map((tag) => {
                const selected = currentSubjectId === `focus-tag:${tag.id}`;
                const busy = pendingId === `tag:${tag.id}`;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    data-hint="focus-subject-tag"
                    data-tag-id={tag.id}
                    onClick={() => void openContainer('tag', tag.id, `tag:${tag.id}`)}
                    className={`inline-flex max-w-full select-none items-center gap-1.5 rounded-2xl border px-4 py-2.5 text-[13px] font-black shadow-sm transition-[transform,box-shadow,background-color,color,opacity] active:scale-95 ${
                      selected ? 'ring-2 ring-offset-1 ring-offset-background' : ''
                    }`}
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                      borderColor: `${tag.color}40`,
                      ...(selected
                        ? ({ ['--tw-ring-color' as never]: tag.color } as object)
                        : {}),
                    }}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                    ) : (
                      <span aria-hidden className="opacity-60">
                        #
                      </span>
                    )}
                    <span className="truncate">{tag.name}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          {nothingMatches && (
            <p className="py-8 text-center text-sm font-bold text-muted-foreground">
              {lane === 'all'
                ? 'Nothing to pick yet — just focus above.'
                : 'Nothing here yet.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  show,
  hidden,
  onShowAll,
  children,
}: Readonly<{
  title: string;
  show: boolean;
  hidden: number;
  onShowAll: () => void;
  children: React.ReactNode;
}>) {
  if (!show) return null;
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2 px-1 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
      {hidden > 0 && (
        <button
          type="button"
          onClick={onShowAll}
          className="mt-2 w-full rounded-xl py-2 text-[12px] font-black text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          Show {hidden} more
        </button>
      )}
    </section>
  );
}

export default FocusSubjectPicker;
