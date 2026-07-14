'use client';

import { useFrogodoroStore } from '@/lib/frogodoroStore';
import type { PomodoroPhase } from '@/lib/frogodoroStore';

export function useTaskTimerPhase(taskId: string): PomodoroPhase | null {
  return useFrogodoroStore((s) =>
    s.timerActive && s.selectedTaskId === taskId ? s.phase : null,
  );
}
