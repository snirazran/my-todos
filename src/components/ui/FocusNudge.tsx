'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { hapticSelect, hapticTick } from '@/lib/haptics';
import { cn } from '@/lib/utils';

export const FOCUS_NUDGE_MINUTES = 5;

const MIN_MISSED_RUN = 2;
const SNOOZE_DAYS = 3;
const STORAGE_KEY = 'frogress.focusNudge';

type NudgeTask = {
  id: string;
  completed: boolean;
  isStarter?: boolean;
  repeatGroupId?: string;
  missedRun?: number;
};

type NudgeMemory = {
  dismissed: string[];
  snoozeUntil: string | null;
  shown: string | null;
};

const EMPTY_MEMORY: NudgeMemory = { dismissed: [], snoozeUntil: null, shown: null };

function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA').format(d);
}

function nudgeKey(task: NudgeTask) {
  return task.repeatGroupId ?? task.id;
}

function readMemory(): NudgeMemory {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_MEMORY;
    const parsed = JSON.parse(raw) as Partial<NudgeMemory>;
    return {
      dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed : [],
      snoozeUntil: typeof parsed.snoozeUntil === 'string' ? parsed.snoozeUntil : null,
      shown: typeof parsed.shown === 'string' ? parsed.shown : null,
    };
  } catch {
    return EMPTY_MEMORY;
  }
}

function writeMemory(memory: NudgeMemory) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {}
}

export function useFocusNudge(tasks: NudgeTask[], enabled: boolean) {
  const [memory, setMemory] = useState<NudgeMemory | null>(null);
  useEffect(() => {
    setMemory(readMemory());
  }, []);
  const timerActive = useFrogodoroStore((s) => s.timerActive);
  const today = localDate();

  const candidate = useMemo(() => {
    if (!enabled || !memory || timerActive) return null;
    if (memory.snoozeUntil && today < memory.snoozeUntil) return null;
    let best: NudgeTask | null = null;
    for (const task of tasks) {
      if (task.completed || task.isStarter) continue;
      const run = task.missedRun ?? 0;
      if (run < MIN_MISSED_RUN) continue;
      if (memory.dismissed.includes(nudgeKey(task))) continue;
      if (!best || run > (best.missedRun ?? 0)) best = task;
    }
    return best;
  }, [enabled, memory, timerActive, today, tasks]);

  const candidateKey = candidate ? nudgeKey(candidate) : null;
  const candidateRun = candidate?.missedRun ?? 0;

  useEffect(() => {
    if (!candidateKey) return;
    const stamp = `${today}:${candidateKey}`;
    setMemory((current) => {
      if (!current || current.shown === stamp) return current;
      trackAnalyticsEvent('focus_nudge_shown', { missed_run: candidateRun });
      const next = { ...current, shown: stamp };
      writeMemory(next);
      return next;
    });
  }, [candidateKey, candidateRun, today]);

  const accept = useCallback(() => {
    trackAnalyticsEvent('focus_nudge_accepted', { missed_run: candidateRun });
  }, [candidateRun]);

  const dismiss = useCallback(() => {
    if (!candidateKey) return;
    trackAnalyticsEvent('focus_nudge_dismissed', { missed_run: candidateRun });
    setMemory((current) => {
      const base = current ?? EMPTY_MEMORY;
      const next = {
        ...base,
        dismissed: base.dismissed.includes(candidateKey)
          ? base.dismissed
          : [...base.dismissed, candidateKey].slice(-50),
        snoozeUntil: localDate(SNOOZE_DAYS),
      };
      writeMemory(next);
      return next;
    });
  }, [candidateKey, candidateRun]);

  return { taskId: candidate?.id ?? null, accept, dismiss };
}

export function FocusNudge({
  onAccept,
  onDismiss,
  className,
}: Readonly<{
  onAccept: () => void;
  onDismiss: () => void;
  className?: string;
}>) {
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return (
    <span className={cn('flex h-7 min-w-0 items-center gap-1', className)}>
      <button
        type="button"
        data-hint="focus-nudge"
        onPointerDown={stop}
        onMouseDown={stop}
        onTouchStart={stop}
        onClick={(event) => {
          event.stopPropagation();
          hapticSelect();
          onAccept();
        }}
        className="flex h-7 min-w-0 items-center gap-2 rounded-full pr-2.5 text-[13px] font-bold text-[#3d7a38] transition-[transform,background-color] active:scale-[0.97] dark:text-emerald-400 [@media(hover:hover)]:hover:bg-primary/10"
      >
        <Icon name="clock" className="h-[22px] w-[22px] shrink-0" />
        <span className="truncate">
          Stuck? Try {FOCUS_NUDGE_MINUTES} minutes
        </span>
      </button>
      <button
        type="button"
        aria-label="Hide this suggestion"
        onPointerDown={stop}
        onMouseDown={stop}
        onTouchStart={stop}
        onClick={(event) => {
          event.stopPropagation();
          hapticTick();
          onDismiss();
        }}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground/50 transition-colors active:scale-95 [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.75} />
      </button>
    </span>
  );
}
