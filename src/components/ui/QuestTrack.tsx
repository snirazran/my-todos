'use client';

import { useEffect, useRef } from 'react';
import { hapticTick } from '@/lib/haptics';

export type QuestTrackAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export function QuestTrack({
  progress,
  target,
  action,
}: {
  progress: number;
  target: number;
  action?: QuestTrackAction | null;
}) {
  const safeTarget = Math.max(1, target);
  const shown = action
    ? safeTarget
    : Math.min(Math.max(0, progress), safeTarget);
  const pct = (shown / safeTarget) * 100;
  const done = shown >= safeTarget;
  const prevProgress = useRef(progress);
  useEffect(() => {
    const prev = prevProgress.current;
    prevProgress.current = progress;
    if (progress > prev) hapticTick();
  }, [progress]);

  return (
    <span className="mt-0.5 flex items-center gap-2">
      <span
        role={action ? 'button' : 'progressbar'}
        tabIndex={action ? 0 : undefined}
        aria-disabled={action ? !!action.disabled : undefined}
        aria-valuemin={action ? undefined : 0}
        aria-valuemax={action ? undefined : safeTarget}
        aria-valuenow={action ? undefined : shown}
        onClick={
          action
            ? (event) => {
                event.stopPropagation();
                if (!action.disabled) action.onPress();
              }
            : undefined
        }
        onKeyDown={
          action
            ? (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                if (!action.disabled) action.onPress();
              }
            : undefined
        }
        className={`relative flex flex-1 items-center justify-center overflow-hidden transition-[height,border-radius,background-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          action
            ? `h-9 cursor-pointer rounded-xl bg-amber-500 shadow-[0_3px_0_0_#b45309] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-2 ${
                action.disabled
                  ? 'opacity-60'
                  : 'hover:-translate-y-px hover:shadow-[0_4px_0_0_#b45309] active:translate-y-[2px] active:shadow-none'
              }`
            : 'h-2.5 rounded-full bg-foreground/[0.07] shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)]'
        }`}
      >
        <span
          className={`absolute inset-y-0 left-0 overflow-hidden rounded-full bg-gradient-to-b transition-[width,opacity] duration-500 ${
            done && !action
              ? 'from-lime-400 to-lime-500'
              : 'from-amber-300 to-amber-400'
          } ${action ? 'opacity-0' : 'opacity-100'}`}
          style={{ width: `${Math.max(pct, 8)}%` }}
        >
          <span className="absolute inset-x-[3px] top-px h-[35%] rounded-full bg-white/50" />
        </span>
        <span
          aria-hidden={!action}
          className={`relative text-[13px] font-black text-white transition-[opacity,transform] duration-200 ${
            action
              ? 'translate-y-0 opacity-100 delay-150'
              : 'translate-y-1 opacity-0'
          }`}
        >
          {action?.label ?? ''}
        </span>
      </span>
      {safeTarget > 1 && !action && (
        <span className="shrink-0 text-[11px] font-black tabular-nums text-muted-foreground">
          {shown}/{safeTarget}
        </span>
      )}
    </span>
  );
}
