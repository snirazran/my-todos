'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { hapticSuccess, hapticTick } from '@/lib/haptics';
import { morphPop, slideFollowers } from '@/lib/taskEntrance';

export type QuestTrackAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

type Stage = 'bar' | 'primed' | 'filling' | 'charged' | 'button';

type MorphFrom = {
  rect: DOMRect;
  rowHeight: number;
  siblings: [HTMLElement, number][];
};

const FILL_MS = 1400;
const STEP_MS = 800;
const CHARGE_MS = 650;

export function QuestTrack({
  progress,
  target,
  action,
  entrance = false,
  notch,
  size = 'md',
}: {
  progress: number;
  target: number;
  action?: QuestTrackAction | null;
  entrance?: boolean;
  notch?: number;
  size?: 'md' | 'lg';
}) {
  const reduceMotion = useReducedMotion();
  const safeTarget = Math.max(1, target);
  const clamped = Math.min(Math.max(0, progress), safeTarget);
  const hasAction = !!action;
  const [stage, setStage] = useState<Stage>(
    hasAction ? (entrance && !reduceMotion ? 'primed' : 'button') : 'bar',
  );
  const trackRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const shineRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const morphFrom = useRef<MorphFrom | null>(null);
  const needsFill = useRef(false);
  const lastFill = useRef<number | null>(null);
  const prevFill = useRef<number | null>(null);
  const fillChangedAt = useRef(0);
  const prevProgress = useRef(progress);

  useEffect(() => {
    const prev = prevProgress.current;
    prevProgress.current = progress;
    if (progress > prev) hapticTick();
  }, [progress]);

  useEffect(() => {
    if (!hasAction) {
      setStage('bar');
      return;
    }
    needsFill.current = (prevFill.current ?? 100) < 99.5;
    setStage((current) =>
      current === 'button' || current === 'primed'
        ? current
        : reduceMotion
          ? 'button'
          : 'filling',
    );
  }, [hasAction, reduceMotion]);

  useEffect(() => {
    if (stage !== 'primed') return;
    const timer = window.setTimeout(() => {
      needsFill.current = true;
      setStage('filling');
    }, 80);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'filling') return;
    const sinceFill = performance.now() - fillChangedAt.current;
    const timer = window.setTimeout(
      () => setStage('charged'),
      needsFill.current
        ? FILL_MS + 120
        : Math.max(320, FILL_MS - sinceFill + 120),
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    if (stage !== 'charged') return;
    hapticSuccess();
    const track = trackRef.current;
    if (track && typeof track.animate === 'function') {
      track.animate(
        [
          { transform: 'scale(1, 1)' },
          { transform: 'scale(1.015, 1.5)', offset: 0.35 },
          { transform: 'scale(1, 1)' },
        ],
        { duration: 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
      );
      shineRef.current?.animate(
        [
          { transform: 'translate3d(-100%, 0, 0)', opacity: 0 },
          { opacity: 1, offset: 0.2 },
          { transform: 'translate3d(420%, 0, 0)', opacity: 0 },
        ],
        { duration: 520, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      );
    }
    const timer = window.setTimeout(() => {
      const el = trackRef.current;
      const row = el?.closest<HTMLElement>('[data-dock-row]');
      if (el) {
        morphFrom.current = {
          rect: el.getBoundingClientRect(),
          rowHeight: row?.offsetHeight ?? 0,
          siblings: row
            ? Array.from(row.children)
                .filter((c): c is HTMLElement => c instanceof HTMLElement)
                .map((c) => [c, c.getBoundingClientRect().top])
            : [],
        };
      }
      setStage('button');
    }, CHARGE_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useLayoutEffect(() => {
    if (stage !== 'button') return;
    const from = morphFrom.current;
    morphFrom.current = null;
    const button = buttonRef.current;
    if (!from || !button || typeof button.animate !== 'function') return;
    const to = button.getBoundingClientRect();
    if (to.width === 0 || to.height === 0) return;
    const pop = morphPop();
    const dx = from.rect.left + from.rect.width / 2 - (to.left + to.width / 2);
    const dy = from.rect.top + from.rect.height / 2 - (to.top + to.height / 2);
    button.animate(
      [
        {
          transform: `translate3d(${dx}px, ${dy}px, 0) scale(${from.rect.width / to.width}, ${from.rect.height / to.height})`,
        },
        { transform: 'translate3d(0, 0, 0) scale(1, 1)' },
      ],
      { duration: pop.duration, easing: pop.easing },
    );
    labelRef.current?.animate(
      [
        { opacity: 0, transform: 'translate3d(0, 6px, 0) scale(0.9)' },
        { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
      ],
      {
        duration: 320,
        delay: 110,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
        fill: 'backwards',
      },
    );
    const row = button.closest<HTMLElement>('[data-dock-row]');
    if (!row) return;
    from.siblings.forEach(([el, top], i) => {
      const shift = top - el.getBoundingClientRect().top;
      if (Math.abs(shift) >= 0.5) {
        el.animate(
          [
            { transform: `translate3d(0, ${shift}px, 0)` },
            { transform: 'translate3d(0, 0, 0)' },
          ],
          { duration: pop.duration, easing: pop.easing, composite: 'add' },
        );
      }
      if (i === 0) {
        el.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.14) rotate(-4deg)', offset: 0.35 },
            { transform: 'scale(1)' },
          ],
          {
            duration: 520,
            delay: 60,
            easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
            composite: 'add',
          },
        );
      }
    });
    slideFollowers(row, row.offsetHeight - from.rowHeight);
  }, [stage]);

  const showBar = stage !== 'button';
  const fillPct =
    stage === 'primed'
      ? 8
      : stage === 'bar'
        ? Math.max((clamped / safeTarget) * 100, 8)
        : 100;
  const charged = stage === 'charged';
  const notchPct =
    notch !== undefined && notch > 0 && notch < safeTarget
      ? (notch / safeTarget) * 100
      : null;
  const large = size === 'lg';
  const countLabel = `${hasAction ? safeTarget : clamped} / ${safeTarget}`;
  const fillTransition = `transform ${fillPct >= 100 ? FILL_MS : STEP_MS}ms cubic-bezier(0.45,0.05,0.2,1)`;

  useLayoutEffect(() => {
    const next = showBar ? fillPct : 100;
    if (lastFill.current !== null && Math.abs(next - lastFill.current) > 0.5) {
      fillChangedAt.current = performance.now();
    }
    prevFill.current = lastFill.current;
    lastFill.current = next;
  });

  return (
    <span className="mt-0.5 flex items-center gap-2">
      {showBar ? (
        <span
          ref={trackRef}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={safeTarget}
          aria-valuenow={hasAction ? safeTarget : clamped}
          className={`relative flex flex-1 overflow-hidden rounded-full bg-foreground/[0.07] shadow-[inset_0_1px_2px_rgba(0,0,0,0.10)] ${
            large ? 'h-[22px]' : 'h-2.5'
          }`}
        >
          {large && (
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center text-[11.5px] font-black tabular-nums text-foreground/55"
            >
              {countLabel}
            </span>
          )}
          {notchPct !== null && (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-rose-500/20 dark:bg-rose-400/25"
              style={{ width: `${notchPct}%` }}
            />
          )}
          <span
            ref={fillRef}
            className="absolute inset-0 overflow-hidden rounded-full transition-transform ease-[cubic-bezier(0.45,0.05,0.2,1)] will-change-transform"
            style={{
              transform: `translate3d(${fillPct - 100}%, 0, 0)`,
              transitionDuration: `${fillPct >= 100 ? FILL_MS : STEP_MS}ms`,
            }}
          >
            <span className="absolute inset-0 bg-gradient-to-b from-amber-300 to-amber-400" />
            <span
              className={`absolute inset-0 bg-amber-500 transition-opacity duration-200 ${
                charged ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <span className="absolute inset-x-[3px] top-px h-[35%] rounded-full bg-white/50" />
            {large && (
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center text-[11.5px] font-black tabular-nums text-amber-950/80 will-change-transform"
                style={{
                  transform: `translate3d(${100 - fillPct}%, 0, 0)`,
                  transition: fillTransition,
                }}
              >
                {countLabel}
              </span>
            )}
            <span
              ref={shineRef}
              className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-0"
            />
          </span>
          {notchPct !== null && (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-white dark:bg-white/85"
              style={{ left: `${notchPct}%` }}
            />
          )}
        </span>
      ) : (
        <span
          className={
            action && !action.disabled ? 'claim-nudge flex flex-1' : 'flex flex-1'
          }
        >
          <span
            ref={buttonRef}
            role="button"
            tabIndex={0}
            aria-disabled={!!action?.disabled}
            onClick={(event) => {
              event.stopPropagation();
              if (action && !action.disabled) action.onPress();
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              event.stopPropagation();
              if (action && !action.disabled) action.onPress();
            }}
            className={`relative flex h-9 flex-1 cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-amber-500 shadow-[0_3px_0_0_#b45309] transition-[transform,box-shadow,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-2 ${
              action?.disabled
                ? 'opacity-60'
                : 'hover:-translate-y-px hover:shadow-[0_4px_0_0_#b45309] active:translate-y-[2px] active:shadow-none'
            }`}
          >
            <span
              ref={labelRef}
              className="relative text-[13px] font-black text-white"
            >
              {action?.label ?? ''}
            </span>
          </span>
        </span>
      )}
      {!large && safeTarget > 1 && showBar && !hasAction && (
        <span
          className={`shrink-0 text-[11px] font-black tabular-nums transition-colors duration-200 ${
            charged ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
          }`}
        >
          {hasAction ? safeTarget : clamped}/{safeTarget}
        </span>
      )}
    </span>
  );
}
