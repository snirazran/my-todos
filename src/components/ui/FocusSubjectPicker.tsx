'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import { Loader2, Play } from 'lucide-react';
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

const TASK_CAP = 3;

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
  const [showAllTasks, setShowAllTasks] = useState(false);
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

  const tasks = allTasks;
  const areas = allAreas;
  const tags = allTags;

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

  const taskCount = showAllTasks ? tasks.length : Math.min(TASK_CAP, tasks.length);
  const hasTrackables = areas.length > 0 || tags.length > 0;
  const nothingMatches = !loading && tasks.length === 0 && !hasTrackables;

  return (
    <div
      ref={bindScroll}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:px-5"
    >
      {/* The fastest path out of this sheet, so it sits first and reads as the
          default rather than a footnote parked at the bottom. */}
        <button
          type="button"
          data-hint="focus-subject"
          onClick={() => void openContainer('open', '', 'open')}
          className="mb-5 flex min-h-[60px] w-full items-center gap-3 rounded-2xl bg-[#4f9149] px-4 py-2.5 text-left text-white shadow-[0_3px_0_0_#34631f] transition-all active:translate-y-0.5 active:shadow-none [@media(hover:hover)]:hover:brightness-105"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/90 text-[#4f9149]">
            {pendingId === 'open' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Icon name="clock" className="h-7 w-7" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-black leading-tight">
              Just focus
            </span>
            <span className="block text-[12px] font-semibold leading-tight text-white/80">
              Start now, tick off what you finished after
            </span>
          </span>
          <Play className="h-5 w-5 shrink-0 fill-current" aria-hidden="true" />
        </button>

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
            title="Or pick a task"
            show={tasks.length > 0}
            hidden={tasks.length - taskCount}
            onShowAll={() => {
              hapticTick();
              setShowAllTasks(true);
            }}
          >
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
              {tasks.slice(0, taskCount).map((task, index) => {
                const selected = currentSubjectId === task.id;
                const tagNames = (task.tags ?? [])
                  .map((id) => allTags.find((t) => t.id === id))
                  .filter((t): t is Tag => !!t);
                const minutes = minutesLabel(task.frogodoroSession?.focusTime);
                return (
                  <button
                    key={task.id}
                    type="button"
                    data-hint="focus-subject"
                    onClick={() => {
                      hapticSelect();
                      onPick({ ...task, subjectKind: 'task' });
                    }}
                    className={`flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                      index > 0 ? 'border-t border-border/50' : ''
                    } ${
                      selected
                        ? 'bg-primary/[0.06]'
                        : 'active:bg-muted/60 [@media(hover:hover)]:hover:bg-muted/40'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-foreground">
                        {task.text}
                      </span>
                      {(tagNames.length > 0 || minutes) && (
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
                          {tagNames.slice(0, 2).map((tag) => (
                            <span
                              key={tag.id}
                              className="inline-flex min-w-0 items-center gap-1"
                            >
                              <span
                                aria-hidden
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: tag.color }}
                              />
                              <span className="truncate">{tag.name}</span>
                            </span>
                          ))}
                          {minutes && (
                            <span className="shrink-0">
                              {tagNames.length > 0 ? '· ' : ''}
                              {minutes}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                    <Play
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 fill-current text-primary/70"
                    />
                  </button>
                );
              })}
            </div>
          </Section>

          <Section
            title="Or track time toward"
            show={hasTrackables}
            hidden={0}
            onShowAll={() => {}}
          >
            <div className="flex flex-wrap gap-1.5">
              {areas.map((area) => {
                const selected = currentSubjectId === `focus-area:${area.id}`;
                const busy = pendingId === `area:${area.id}`;
                return (
                  <button
                    key={area.id}
                    type="button"
                    data-hint="focus-subject"
                    onClick={() => void openContainer('area', area.id, `area:${area.id}`)}
                    className={`inline-flex h-10 max-w-full items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3.5 text-[13px] font-black text-foreground transition-[transform,background-color] active:scale-95 [@media(hover:hover)]:hover:bg-muted/50 ${
                      selected ? 'border-primary ring-1 ring-primary' : 'border-border/60'
                    }`}
                  >
                    <span
                      className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full"
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
                      {busy && (
                        <span className="absolute inset-0 grid place-items-center bg-black/40">
                          <Loader2 className="h-4 w-4 animate-spin text-white" aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <span className="truncate">{area.name}</span>
                  </button>
                );
              })}
              {tags.map((tag) => {
                const selected = currentSubjectId === `focus-tag:${tag.id}`;
                const busy = pendingId === `tag:${tag.id}`;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    data-hint="focus-subject-tag"
                    data-tag-id={tag.id}
                    onClick={() => void openContainer('tag', tag.id, `tag:${tag.id}`)}
                    className={`inline-flex h-10 max-w-full select-none items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-black transition-transform active:scale-95 ${
                      selected ? 'ring-2 ring-offset-1 ring-offset-background' : ''
                    }`}
                    style={{
                      backgroundColor: `${tag.color}1a`,
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
            <p className="mt-2 px-1 text-[12px] font-semibold text-muted-foreground">
              Your focus minutes count toward it, no task needed.
            </p>
          </Section>

          {nothingMatches && (
            <p className="py-8 text-center text-sm font-bold text-muted-foreground">
              Nothing to pick yet — just focus above.
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
