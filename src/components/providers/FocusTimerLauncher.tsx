'use client';

import { useEffect, useMemo, useState } from 'react';
import { mutate } from 'swr';
import { format } from 'date-fns';
import { BaseSheet } from '@/components/ui/BaseSheet';
import FrogodoroSheet from '@/components/ui/FrogodoroSheet';
import { BuddyFrogFace } from '@/components/ui/BuddyBadge';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import {
  FocusSubjectPicker,
  type TimerTask,
} from '@/components/ui/FocusSubjectPicker';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
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
  const { indices: frogIndices } = useWardrobeIndices(launcherOpen);
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );
  const today = format(new Date(), 'yyyy-MM-dd');
  const taskKey = `/api/tasks?date=${today}&timezone=${encodeURIComponent(timezone)}`;

  // The picker is a whole decision long, and the timer sheet that follows is
  // the app's heaviest Rive surface. Warm the runtime and its art now, while
  // the user is reading a list, instead of at the moment the sheet opens.
  useEffect(() => {
    if (!launcherOpen) return;
    warmRiveRuntime();
    void preloadRiveAsset('/frog_idle.riv');
    void preloadRiveAsset(FLY_RIVE_ASSET_URL);
  }, [launcherOpen]);

  useEffect(() => {
    if (!launcherOpen) return;
    const store = useFrogodoroStore.getState();
    if (!store.timerActive || !store.selectedTaskId) return;
    setSelectedTask({
      id: store.selectedTaskId,
      text: store.selectedTaskName || 'Focus session',
      completed: false,
      subjectKind: store.subjectKind,
    });
    closeLauncher();
    window.setTimeout(() => setTimerOpen(true), 120);
  }, [launcherOpen, closeLauncher]);

  const openForSubject = (task: TimerTask) => {
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
        // The sheet's own handle sits on the card background, which put a white
        // strip above the green band and squared off its top corners. Hidden
        // here and redrawn on the green itself, the way the timer sheet does.
        hideHandle
        className="max-h-[88dvh] overflow-hidden rounded-t-[24px] bg-background sm:max-w-lg sm:rounded-[34px]"
        closeAriaLabel="Close focus timer picker"
      >
        {({ bindScroll, dragControls, isDesktop }) => (
          <div className="flex h-[74dvh] max-h-[88dvh] flex-col sm:h-[560px]">
            {/* The green band and the frog carry over from the timer itself, so
                picking a subject reads as the first beat of that screen rather
                than a separate, colourless list. A static stamp, never Rive —
                this sheet is on the path to the timer and must not spend the
                main thread the timer is about to need. */}
            {/* A colour slab and a cropped frog were carrying no information
                and crowding the one thing that matters — the list. The frog
                stays as a face-cropped avatar, which is how it appears
                everywhere else, and the green moves to where it means
                something: the primary action below. */}
            <div
              className="relative shrink-0 px-4 pb-2 pt-2 sm:px-5"
              onPointerDown={isDesktop ? undefined : (event) => dragControls.start(event)}
            >
              {!isDesktop && (
                <div className="flex h-5 items-center justify-center">
                  <div className="h-1.5 w-12 rounded-full bg-border/60" />
                </div>
              )}
              <div className="flex items-center gap-2.5 pr-10">
                <BuddyFrogFace indices={frogIndices} size={34} />
                <h2 className="text-balance text-[19px] font-black tracking-[-0.03em] text-foreground">
                  Focus on
                </h2>
              </div>
            </div>

            <FocusSubjectPicker
              active={launcherOpen}
              onPick={openForSubject}
              bindScroll={bindScroll}
            />
          </div>
        )}
      </BaseSheet>

      <FrogodoroSheet
        open={timerOpen}
        onOpenChange={setTimerOpen}
        task={selectedTask}
        onMutateToday={() => {
          void mutate(taskKey);
        }}
      />
    </>
  );
}
