'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Check, ChevronRight, ListTodo, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { BaseSheet } from '@/components/ui/BaseSheet';
import FrogodoroSheet from '@/components/ui/FrogodoroSheet';
import { Icon } from '@/components/ui/Icon';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';

type TimerTask = {
  id: string;
  text: string;
  completed: boolean;
  tags?: string[];
  frogodoroSettings?: Record<string, unknown>;
  frogodoroSession?: { date: string; focusTime: number; breakTime: number } | null;
};

type TasksResponse = {
  tasks?: TimerTask[];
};

export function FocusTimerLauncher() {
  const launcherOpen = useFrogodoroUiStore((state) => state.focusLauncherOpen);
  const closeLauncher = useFrogodoroUiStore((state) => state.closeFocusLauncher);
  const [timerOpen, setTimerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TimerTask | null>(null);
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );
  const today = format(new Date(), 'yyyy-MM-dd');
  const taskKey = launcherOpen
    ? `/api/tasks?date=${today}&timezone=${encodeURIComponent(timezone)}`
    : null;
  const { data: taskData, isLoading: tasksLoading } = useSWR<TasksResponse>(
    taskKey,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const todayTasks = useMemo(
    () => (taskData?.tasks ?? []).filter((task) => !task.completed),
    [taskData?.tasks],
  );

  useEffect(() => {
    if (!launcherOpen) return;
    const store = useFrogodoroStore.getState();
    if (!store.timerActive || !store.selectedTaskId) return;
    setSelectedTask({
      id: store.selectedTaskId,
      text: store.selectedTaskName || 'Focus session',
      completed: false,
    });
    closeLauncher();
    window.setTimeout(() => setTimerOpen(true), 120);
  }, [launcherOpen, closeLauncher]);

  const openForTask = (task: TimerTask) => {
    setSelectedTask(task);
    closeLauncher();
    window.setTimeout(() => setTimerOpen(true), 160);
  };

  return (
    <>
      <BaseSheet
        open={launcherOpen}
        onOpenChange={(open) => {
          if (!open) closeLauncher();
        }}
        zIndex={1400}
        className="max-h-[88dvh] rounded-t-[28px] bg-background sm:max-w-lg sm:rounded-[28px]"
        closeAriaLabel="Close focus timer picker"
      >
        {({ bindScroll, dragControls, isDesktop }) => (
          <div className="flex max-h-[88dvh] flex-col">
            <div
              className="shrink-0 px-5 pb-4 pt-2 sm:px-6 sm:pt-5"
              onPointerDown={isDesktop ? undefined : (event) => dragControls.start(event)}
            >
              <div className="flex items-center gap-3 pr-10">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                  <Icon name="clock" className="h-10 w-10" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
                    Focus Timer
                  </p>
                  <h2 className="text-balance text-xl font-black tracking-[-0.03em] text-foreground">
                    What are you focusing on?
                  </h2>
                </div>
              </div>
              <p className="mt-3 text-pretty text-sm font-medium leading-relaxed text-muted-foreground">
                Pick a task from today. Your focus time stays attached to it.
              </p>
            </div>

            <div ref={bindScroll} className="min-h-0 flex-1 scroll-pb-32 overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+8rem)] sm:px-6 sm:pb-8">
              <PickerSection
                icon={<ListTodo className="h-4 w-4" aria-hidden="true" />}
                title="Today’s Tasks"
                description="Focus time stays attached to the task."
              >
                {tasksLoading ? (
                  <PickerLoading />
                ) : todayTasks.length ? (
                  todayTasks.map((task) => (
                    <PickerRow
                      key={task.id}
                      title={task.text}
                      detail={task.frogodoroSession?.focusTime ? 'Continue focusing' : 'Start a focus session'}
                      onClick={() => openForTask(task)}
                    />
                  ))
                ) : (
                  <PickerEmpty icon={<Check className="h-5 w-5" aria-hidden="true" />} text="No open tasks for today" />
                )}
              </PickerSection>
            </div>
          </div>
        )}
      </BaseSheet>

      <FrogodoroSheet
        open={timerOpen}
        onOpenChange={setTimerOpen}
        task={selectedTask}
        onMutateToday={() => {
          if (taskKey) void mutate(taskKey);
        }}
      />
    </>
  );
}

function PickerSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-emerald-600 dark:text-emerald-400">{icon}</span>
        <div className="min-w-0">
          <h3 className="text-sm font-black text-foreground">{title}</h3>
          <p className="text-[11px] font-semibold text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        {children}
      </div>
    </section>
  );
}

function PickerRow({
  title,
  detail,
  onClick,
}: {
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <Icon name="clock" className="h-7 w-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-black text-foreground">{title}</span>
        <span className="block truncate text-[11px] font-semibold text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

function PickerLoading() {
  return (
    <div className="flex h-20 items-center justify-center gap-2 text-sm font-bold text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      Loading…
    </div>
  );
}

function PickerEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex min-h-20 items-center justify-center gap-2 px-4 text-center text-sm font-bold text-muted-foreground">
      {icon}
      {text}
    </div>
  );
}
