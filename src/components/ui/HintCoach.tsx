'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { useUIStore } from '@/lib/uiStore';
import { formatHintLabel, guideById } from '@/lib/hints/guides';
import {
  ANCHOR_FIND_TIMEOUT_MS,
  isUsableAnchor,
  measure,
  useAnchorTracker,
  type AnchorRect as Rect,
} from '@/lib/hints/useAnchorTracker';

const RING_PADDING = 5;

function elementTagIds(el: HTMLElement): string[] {
  const raw = el.dataset.tagIds ?? el.dataset.tagId ?? '';
  return raw.split(',').filter(Boolean);
}

function tagCondition(
  el: HTMLElement,
  contextTagIds: string[],
  match: 'hit' | 'miss',
): boolean {
  const overlap = elementTagIds(el).some((id) => contextTagIds.includes(id));
  return match === 'hit' ? overlap : !overlap;
}

export function HintCoach() {
  const router = useRouter();
  const pathname = usePathname();
  const activeHint = useUIStore((s) => s.activeHint);
  const advanceHintStep = useUIStore((s) => s.advanceHintStep);
  const goToHintStep = useUIStore((s) => s.goToHintStep);
  const dismissHintGuide = useUIStore((s) => s.dismissHintGuide);

  const guide = guideById(activeHint?.guideId);
  const step = guide?.steps[activeHint?.stepIndex ?? 0] ?? null;
  const isLastStep =
    !!guide && (activeHint?.stepIndex ?? 0) >= guide.steps.length - 1;
  const stepKey = activeHint
    ? `${activeHint.runId}:${activeHint.guideId}:${activeHint.stepIndex}`
    : null;

  const [mounted, setMounted] = useState(false);
  const [mobileWidth, setMobileWidth] = useState(false);
  const stepNavRef = useRef<{
    key: string | null;
    pushed: boolean;
    arrived: boolean;
    startPath: string;
  }>({ key: null, pushed: false, arrived: false, startPath: '' });

  // Swipe availability is gated by viewport width (TaskList disables the
  // drag at >=768px), so the swipe copy and gestures must key off the same
  // width — not the pointer type.
  useEffect(() => {
    setMounted(true);
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setMobileWidth(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // A guide pointing past its last step means the final anchor was activated.
  useEffect(() => {
    if (activeHint && guide && activeHint.stepIndex >= guide.steps.length) {
      dismissHintGuide();
    }
  }, [activeHint, guide, dismissHintGuide]);

  useEffect(() => {
    if (!activeHint) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissHintGuide();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeHint, dismissHintGuide]);

  // Navigate to the step's route at most once per step. The guide must never
  // fight the user for control: any navigation they make themselves simply
  // closes the guide.
  useEffect(() => {
    if (!step || !guide || !stepKey) {
      if (activeHint && !guide) dismissHintGuide();
      return;
    }
    const nav = stepNavRef.current;
    if (nav.key !== stepKey) {
      stepNavRef.current = {
        key: stepKey,
        pushed: false,
        arrived: !step.href || pathname === step.href,
        startPath: pathname,
      };
      if (step.href && pathname !== step.href) {
        stepNavRef.current.pushed = true;
        router.push(step.href);
      }
      return;
    }
    if (step.href) {
      if (pathname === step.href) {
        nav.arrived = true;
        return;
      }
      if (nav.arrived || pathname !== nav.startPath) dismissHintGuide();
      return;
    }
    if (pathname !== nav.startPath) dismissHintGuide();
  }, [stepKey, step, guide, activeHint, pathname, router, dismissHintGuide]);

  // Event-driven jumps (e.g. the task actually got saved) work even while
  // the anchor is still being searched for.
  useEffect(() => {
    if (!step?.advanceOnEvent || !stepKey) return;
    const { event, goTo } = step.advanceOnEvent;
    const onEvent = () => goToHintStep(goTo);
    window.addEventListener(event, onEvent);
    return () => window.removeEventListener(event, onEvent);
  }, [stepKey, step, goToHintStep]);

  // Presence-driven branches: jump when a surface the user opened (task
  // sheet, quick-add) shows a matching element. Delayed slightly so a sheet
  // that is merely mounted-but-closing can't trigger it.
  useEffect(() => {
    if (!step?.presentJumps?.length || !stepKey) return;
    const contextTagIds = activeHint?.context?.tagIds ?? [];
    const check = () => {
      for (const jump of step.presentJumps!) {
        const found = Array.from(
          document.querySelectorAll<HTMLElement>(jump.selector),
        ).some((candidate) => {
          if (
            jump.tagMatch &&
            !tagCondition(candidate, contextTagIds, jump.tagMatch)
          ) {
            return false;
          }
          // Cover-checked: a surface that is merely mounted behind another
          // sheet (task sheet under the tags popup) must not trigger jumps.
          return isUsableAnchor(candidate, measure(candidate), true);
        });
        if (found) {
          goToHintStep(jump.goTo);
          return;
        }
      }
    };
    const interval = window.setInterval(check, 300);
    return () => window.clearInterval(interval);
  }, [stepKey, step, activeHint?.context, goToHintStep]);

  // Steps that only apply to an empty list ("add a task first") skip
  // themselves when a matching element is already on screen. Evaluated once
  // per step, before the anchor has ever been acquired.
  const skipCheckedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!step || !stepKey || !step.skipWhenPresent) return;
    if (skipCheckedRef.current === stepKey) return;
    skipCheckedRef.current = stepKey;
    if (step.href && pathname !== step.href) return;
    const skipTagIds = activeHint?.context?.tagIds ?? [];
    const alreadyPresent = Array.from(
      document.querySelectorAll<HTMLElement>(step.skipWhenPresent),
    ).some((candidate) => {
      if (
        step.skipWhenPresentTagMatch &&
        !tagCondition(candidate, skipTagIds, step.skipWhenPresentTagMatch)
      ) {
        return false;
      }
      const r = candidate.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (alreadyPresent) advanceHintStep();
  }, [stepKey, step, pathname, activeHint?.context, advanceHintStep]);

  // requirePresent holds a step's highlight until its companion element is on
  // screen, and releases the anchor again if that element disappears.
  const requireSatisfied = () => {
    if (!step?.requirePresent) return true;
    const requireTagIds = activeHint?.context?.tagIds ?? [];
    return Array.from(
      document.querySelectorAll<HTMLElement>(step.requirePresent),
    ).some((candidate) => {
      if (
        step.requirePresentTagMatch &&
        !tagCondition(candidate, requireTagIds, step.requirePresentTagMatch)
      ) {
        return false;
      }
      const r = candidate.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  };

  // Losing an acquired anchor means the user backed out of the surface it
  // lived on; the tracker re-acquires within its grace window and otherwise
  // times out into dismissHintGuide.
  const { el, rect, settled, scrolling } = useAnchorTracker({
    selector: step ? step.selector ?? `[data-hint="${step.anchor}"]` : null,
    resetKey: stepKey,
    enabled: !!step && (!step.href || pathname === step.href),
    coverCheck: step?.coverCheck !== false,
    timeoutMs: step?.timeoutMs ?? ANCHOR_FIND_TIMEOUT_MS,
    filter: (candidate) =>
      !step?.matchTagIds ||
      tagCondition(candidate, activeHint?.context?.tagIds ?? [], 'hit'),
    gate: requireSatisfied,
    onTimeout: dismissHintGuide,
  });

  // Fly-glow steps light up every matching task fly (class-based so the glow
  // rides the elements through scroll/re-renders) instead of ringing the
  // anchor container.
  useEffect(() => {
    if (!el || !step?.flyGlow) return;
    const contextTagIds = activeHint?.context?.tagIds ?? [];
    const apply = () => {
      const flies = Array.from(
        document.querySelectorAll<HTMLElement>('[data-hint="task-fly"]'),
      );
      for (const fly of flies) {
        const matches =
          step.flyGlow === 'all' ||
          (contextTagIds.length > 0 &&
            (fly.dataset.tagIds ?? '')
              .split(',')
              .some((id) => id && contextTagIds.includes(id)));
        fly.classList.toggle('hint-fly-glow', matches);
      }
    };
    apply();
    const interval = window.setInterval(apply, 400);
    return () => {
      window.clearInterval(interval);
      document
        .querySelectorAll<HTMLElement>('.hint-fly-glow')
        .forEach((glowing) => glowing.classList.remove('hint-fly-glow'));
    };
  }, [el, step, activeHint?.context]);

  // Touching the anchor advances the guide (or finishes it on the last step).
  // Outside taps: single-step hints close on any of them; multi-step
  // walkthroughs close only when the tap lands on an unrelated interactive
  // control (a button that isn't part of the flow signals the user is doing
  // something else), so plain taps and scrolls don't kill them mid-flow.
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const isSingleStep = (guide?.steps.length ?? 0) === 1;
  useEffect(() => {
    if (!el) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // Fly-glow steps: only the glowing flies advance; other taps inside the
      // anchor (opening a row to finish it from the sheet) neither advance
      // nor cancel.
      if (step?.flyGlow) {
        const inGlowingFly =
          target instanceof Element && !!target.closest('.hint-fly-glow');
        if (inGlowingFly) {
          if (isLastStep) dismissHintGuide();
          else advanceHintStep();
          return;
        }
        if (el.contains(target)) return;
      }
      const inAnchor =
        (!step?.flyGlow && el.contains(target)) ||
        (step?.alsoAdvanceOn &&
          target instanceof Element &&
          !!target.closest(step.alsoAdvanceOn));
      if (inAnchor) {
        if (step?.dismissOnAnchorDown) {
          dismissHintGuide();
          return;
        }
        if (step?.advanceOnAnchorDown === false) return;
        if (typeof step?.goToOnAnchorDown === 'number') {
          goToHintStep(step.goToOnAnchorDown);
          return;
        }
        if (isLastStep) dismissHintGuide();
        else advanceHintStep();
        return;
      }
      if (labelRef.current?.contains(target)) return;
      if (isSingleStep) {
        dismissHintGuide();
        return;
      }
      if (step?.outsideInteractionCancels === false) return;
      const interactive =
        target instanceof Element &&
        !!target.closest(
          'button, [role="button"], a, input, textarea, select, [data-hint]',
        );
      if (interactive) dismissHintGuide();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true);
  }, [
    el,
    step,
    isLastStep,
    isSingleStep,
    advanceHintStep,
    goToHintStep,
    dismissHintGuide,
  ]);

  const borderRadius = useMemo(() => {
    if (!el) return '16px';
    const radius = window.getComputedStyle(el).borderRadius;
    return radius && radius !== '0px' ? radius : '16px';
  }, [el]);

  if (!mounted || !activeHint || !step) return null;

  const rawLabel = mobileWidth && step.labelCoarse ? step.labelCoarse : step.label;
  const contextTags = activeHint.context?.tags?.filter((tag) => tag.name);
  // With colored tag data available, {tags} renders as real chips; otherwise
  // it falls back to quoted names via formatHintLabel.
  const label =
    contextTags?.length && rawLabel.includes('{tags}')
      ? rawLabel.split('{tags}').flatMap((part, index, parts) => {
          const nodes: React.ReactNode[] = [
            <span key={`t-${index}`}>
              {formatHintLabel(part, activeHint.context)}
            </span>,
          ];
          if (index < parts.length - 1) {
            nodes.push(
              <span
                key={`chips-${index}`}
                className="mx-0.5 inline-flex flex-wrap items-center gap-1 align-middle"
              >
                {contextTags.map((tag) => (
                  <span
                    key={tag.id ?? tag.name}
                    className="inline-flex max-w-[7rem] items-center rounded-md border px-1.5 py-px text-[12px] font-black tracking-wide"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      borderColor: `${tag.color}55`,
                      color: tag.color,
                    }}
                  >
                    <span className="truncate">{tag.name}</span>
                  </span>
                ))}
              </span>,
            );
          }
          return nodes;
        })
      : formatHintLabel(rawLabel, activeHint.context);
  const showGesture = mobileWidth && !!step.gesture;

  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const labelBelow = rect
    ? rect.top + rect.height + 72 < viewportHeight
    : false;
  const labelCenter = rect
    ? Math.min(Math.max(rect.left + rect.width / 2, 130), viewportWidth - 130)
    : 0;

  return createPortal(
    <>
      {rect && settled && (
        <>
          {/* Above BaseSheet (backdrop 1050 / sheet 1051) so guides can point
              at controls inside open sheets; below the reward reveal (9999). */}
          <div
            aria-hidden
            className={`pointer-events-none fixed z-[2000] ${
              scrolling
                ? ''
                : 'transition-[top,left,width,height] duration-200 ease-out'
            }`}
            style={{
              top: rect.top - RING_PADDING,
              left: rect.left - RING_PADDING,
              width: rect.width + RING_PADDING * 2,
              height: rect.height + RING_PADDING * 2,
            }}
          >
            {/* Steady glow — the sonar pulse stays exclusive to the very
                first onboarding fly coach. */}
            {!step.hideRing && !step.flyGlow && (
              <span
                className="absolute inset-0 ring-[3px] ring-amber-400/90 shadow-[0_0_16px_4px_rgba(251,191,36,0.55)]"
                style={{ borderRadius }}
              />
            )}
            {showGesture && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span
                  className={`text-amber-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] motion-reduce:hidden ${
                    step.gesture === 'swipe-left'
                      ? 'animate-[hint-swipe-left_1.6s_ease-in-out_infinite]'
                      : 'animate-[hint-swipe-right_1.6s_ease-in-out_infinite]'
                  }`}
                >
                  {step.gesture === 'swipe-left' ? (
                    <ChevronsLeft className="h-8 w-8" strokeWidth={3} />
                  ) : (
                    <ChevronsRight className="h-8 w-8" strokeWidth={3} />
                  )}
                </span>
              </span>
            )}
          </div>
          <div
            className={`pointer-events-none fixed z-[2000] flex w-[260px] -translate-x-1/2 justify-center ${
              scrolling ? '' : 'transition-[top,left,bottom] duration-200 ease-out'
            }`}
            style={{
              left: labelCenter,
              top: labelBelow
                ? rect.top + rect.height + RING_PADDING + 10
                : undefined,
              bottom: labelBelow
                ? undefined
                : viewportHeight - rect.top + RING_PADDING + 10,
            }}
          >
            <span
              ref={labelRef}
              className="pointer-events-auto inline-flex max-w-full items-start gap-1.5 rounded-xl border border-amber-400/50 bg-background/95 px-3 py-2 text-[12px] font-bold leading-snug text-amber-600 shadow-lg backdrop-blur-sm dark:text-amber-400"
            >
              <span className="min-w-0">{label}</span>
              <button
                type="button"
                aria-label="Dismiss hint"
                onClick={dismissHintGuide}
                className="-mr-1 -mt-0.5 shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" strokeWidth={3} />
              </button>
            </span>
          </div>
        </>
      )}
    </>,
    document.body,
  );
}
