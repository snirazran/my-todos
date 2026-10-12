'use client';

import { useEffect, useMemo, useState } from 'react';
import { mutate } from 'swr';
import { format } from 'date-fns';
import FrogodoroSheet from '@/components/ui/FrogodoroSheet';
import {
  openFocusContainer,
  type TimerTask,
} from '@/components/ui/FocusSubjectPicker';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { OPEN_FOCUS_ID, OPEN_FOCUS_LABEL } from '@/lib/focusSubject';
import {
  FLY_RIVE_ASSET_URL,
  preloadRiveAsset,
  warmRiveRuntime,
} from '@/lib/riveLoader';

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
  const taskKey = `/api/tasks?date=${today}&timezone=${encodeURIComponent(timezone)}`;

  useEffect(() => {
    if (!launcherOpen) return;
    warmRiveRuntime();
    void preloadRiveAsset('/frog_idle.riv');
    void preloadRiveAsset(FLY_RIVE_ASSET_URL);
    closeLauncher();

    const store = useFrogodoroStore.getState();
    if (store.timerActive && store.selectedTaskId) {
      setSelectedTask({
        id: store.selectedTaskId,
        text: store.selectedTaskName || 'Focus session',
        completed: false,
        subjectKind: store.subjectKind,
      });
      setTimerOpen(true);
      return;
    }

    setSelectedTask({
      id: OPEN_FOCUS_ID,
      text: OPEN_FOCUS_LABEL,
      completed: false,
      subjectKind: 'open',
    });
    setTimerOpen(true);
    void openFocusContainer('open', '').then((task) => {
      if (!task) return;
      setSelectedTask((current) =>
        current?.id === OPEN_FOCUS_ID ? task : current,
      );
    });
  }, [launcherOpen, closeLauncher]);

  return (
    <FrogodoroSheet
      open={timerOpen}
      onOpenChange={setTimerOpen}
      task={selectedTask}
      onSubjectChange={setSelectedTask}
      onMutateToday={() => {
        void mutate(taskKey);
      }}
    />
  );
}
