'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import { Check, Loader2, Play, X } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { hapticSelect, hapticTick } from '@/lib/haptics';
import {
  AREA_PREFIX,
  OPEN_FOCUS_ID,
  TAG_PREFIX,
  type FocusSubjectKind,
} from '@/lib/focusSubject';

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

const TASK_CAP = 6;

export async function openFocusContainer(
  kind: FocusSubjectKind,
  id: string,
): Promise<TimerTask | null> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  try {
    const res = await fetch('/api/frogodoro/subject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id, timezone }),
    });
    const json = await res.json();
    if (!res.ok || !json?.task) return null;
    return { ...json.task, subjectKind: kind };
  } catch {
    return null;
  }
}

export function FocusSubjectPanel({
  active,
  currentSubjectId,
  onPick,
  onClose,
  onHeaderPointerDown,
}: Readonly<{
  active: boolean;
  currentSubjectId?: string;
  onPick: (task: TimerTask) => void;
  onClose: () => void;
  onHeaderPointerDown?: (event: React.PointerEvent) => void;
}>) {
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
  const { data: subjectData } = useSWR<SubjectsResponse>(
    active ? '/api/frogodoro/subject' : null,
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false },
  );

  const tasks = useMemo(
    () => (taskData?.tasks ?? []).filter((task) => !task.completed),
    [taskData?.tasks],
  );
  const areas = subjectData?.areas ?? [];
  const tags = subjectData?.tags ?? [];
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const shownTasks = showAllTasks ? tasks : tasks.slice(0, TASK_CAP);

  const pickContainer = async (kind: FocusSubjectKind, id: string, key: string) => {
    if (pendingId) return;
    hapticSelect();
    setPendingId(key);
    const task = await openFocusContainer(kind, id);
    setPendingId(null);
    if (task) onPick(task);
  };

  const openSelected = currentSubjectId === OPEN_FOCUS_ID;

  return (
    <div className="flex h-full flex-col text-foreground">
      <div
        onPointerDown={onHeaderPointerDown}
        className="shrink-0 touch-none px-4 pb-2 pt-2"
      >
        <div className="mx-auto mb-1.5 h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[19px] font-black tracking-tight">Focus on</h3>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              hapticTick();
              onClose();
            }}
            aria-label="Back to timer"
            className="grid h-9 w-9 place-items-center rounded-full bg-muted/70 text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-95"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={2.75} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5">
        <button
          type="button"
          data-hint="focus-subject"
          onClick={() =>
            openSelected ? onClose() : void pickContainer('open', '', 'open')
          }
          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
            openSelected
              ? 'bg-primary/[0.14] ring-1 ring-inset ring-primary/30'
              : 'bg-muted/50 active:bg-muted [@media(hover:hover)]:hover:bg-muted/80'
          }`}
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card ring-1 ring-border/60"
          >
            {pendingId === 'open' ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
            ) : (
              <Icon name="clock" className="h-6 w-6" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-black leading-tight">
              Just focus
            </span>
            <span className="block text-[12px] font-semibold leading-tight text-muted-foreground">
              Tick off what you finished after
            </span>
          </span>
          {openSelected && (
            <Check className="h-5 w-5 shrink-0 text-primary" strokeWidth={3} />
          )}
        </button>

        {tasksLoading ? (
          <div className="flex h-24 items-center justify-center" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : (
          tasks.length > 0 && (
            <section className="mt-4">
              <h4 className="mb-1.5 px-1 text-[13px] font-black text-muted-foreground">
                Today
              </h4>
              <div className="overflow-hidden rounded-2xl bg-muted/40 ring-1 ring-inset ring-border/50">
                {shownTasks.map((task, index) => {
                  const selected = currentSubjectId === task.id;
                  const tag = (task.tags ?? [])
                    .map((id) => tagById.get(id))
                    .find(Boolean);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      data-hint="focus-subject"
                      onClick={() => {
                        hapticSelect();
                        if (selected) onClose();
                        else onPick({ ...task, subjectKind: 'task' });
                      }}
                      className={`flex min-h-[48px] w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
                        index > 0 ? 'border-t border-border/50' : ''
                      } ${
                        selected
                          ? 'bg-primary/[0.14]'
                          : 'active:bg-muted [@media(hover:hover)]:hover:bg-muted/70'
                      }`}
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor:
                            tag?.color ?? 'hsl(var(--muted-foreground) / 0.4)',
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
                        {task.text}
                      </span>
                      {selected ? (
                        <Check className="h-5 w-5 shrink-0 text-primary" strokeWidth={3} />
                      ) : (
                        <Play
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0 fill-current text-muted-foreground/50"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              {tasks.length > shownTasks.length && (
                <button
                  type="button"
                  onClick={() => {
                    hapticTick();
                    setShowAllTasks(true);
                  }}
                  className="mt-1.5 w-full rounded-xl py-2 text-[12px] font-black text-muted-foreground transition-colors hover:text-foreground"
                >
                  Show {tasks.length - shownTasks.length} more
                </button>
              )}
            </section>
          )
        )}

        {(areas.length > 0 || tags.length > 0) && (
          <section className="mt-4">
            <h4 className="mb-1.5 px-1 text-[13px] font-black text-muted-foreground">
              Count it toward
            </h4>
            <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {areas.map((area) => {
                const key = `area:${area.id}`;
                const selected = currentSubjectId === `${AREA_PREFIX}${area.id}`;
                return (
                  <button
                    key={area.id}
                    type="button"
                    data-hint="focus-subject"
                    onClick={() =>
                      selected ? onClose() : void pickContainer('area', area.id, key)
                    }
                    className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-[13px] font-black transition-[transform,background-color] active:scale-95 ${
                      selected
                        ? 'bg-primary/[0.14] ring-1 ring-inset ring-primary/30'
                        : 'bg-muted/60'
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
                      {pendingId === key && (
                        <span className="absolute inset-0 grid place-items-center bg-black/40">
                          <Loader2 className="h-4 w-4 animate-spin text-white" aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    {area.name}
                  </button>
                );
              })}
              {tags.map((tag) => {
                const key = `tag:${tag.id}`;
                const selected = currentSubjectId === `${TAG_PREFIX}${tag.id}`;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    data-hint="focus-subject-tag"
                    data-tag-id={tag.id}
                    onClick={() =>
                      selected ? onClose() : void pickContainer('tag', tag.id, key)
                    }
                    className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-black transition-[transform,background-color] active:scale-95 ${
                      selected
                        ? 'bg-primary/[0.14] ring-1 ring-inset ring-primary/30'
                        : 'bg-muted/60'
                    }`}
                  >
                    {pendingId === key ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                    ) : (
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-border"
                        style={{ backgroundColor: tag.color }}
                      />
                    )}
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
