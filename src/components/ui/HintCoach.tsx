'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { useUIStore } from '@/lib/uiStore';
import { formatHintLabel, guideById } from '@/lib/hints/guides';

const FIND_TIMEOUT_MS = 12_000;
// Grace window for re-acquiring a lost anchor (list re-renders) before the
// loss is treated as the user abandoning the guide.
const REACQUIRE_TIMEOUT_MS = 1600;
const RING_PADDING = 5;

type Rect = { top: number; left: number; width: number; height: number };

function rectsEqual(a: Rect | null, b: Rect | null) {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1
  );
}

function measure(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

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

// True when the element is genuinely on screen for the user: rendered,
// non-hidden, and (only when acquiring — checkCover) the top-most content at
// its center. The cover check keeps the finder from latching onto a closed
// sheet's still-mounted, painted-over controls, but must NOT run during
// tracking: open sheets legitimately float transparent gesture layers over
// their content, which would read as "covered" and kill a valid highlight.
function isUsableAnchor(
  el: HTMLElement,
  rect: Rect,
  checkCover: boolean,
): boolean {
  if (!el.isConnected || rect.width < 1 || rect.height < 1) return false;
  const hidden =
    typeof (el as any).checkVisibility === 'function'
      ? !(el as any).checkVisibility({
          checkOpacity: true,
          checkVisibilityCSS: true,
        })
      : false;
  if (hidden) return false;
  if (!checkCover) return true;
  // Probe several points, not just the center: decorative layers (the frog's
  // oversized transparent canvas) can overlap part of an anchor without
  // actually obscuring it. A genuinely buried anchor fails every probe.
  const cy = rect.top + rect.height / 2;
  const probes = [0.5, 0.2, 0.8].map(
    (fraction) => [rect.left + rect.width * fraction, cy] as const,
  );
  let sawInViewportProbe = false;
  for (const [px, py] of probes) {
    if (px < 0 || py < 0 || px >= window.innerWidth || py >= window.innerHeight) {
      continue;
    }
    sawInViewportProbe = true;
    const hit = document.elementFromPoint(px, py);
    if (!hit || hit === el || el.contains(hit) || hit.contains(el)) {
      return true;
    }
  }
  return !sawInViewportProbe;
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
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  // Bumped when a tracked anchor is lost so the search effect runs again
  // (with its timeout) instead of leaving a zombie guide with no anchor.
  const [searchNonce, setSearchNonce] = useState(0);
  // Hide the overlay while the anchor is animating (sheet opening/closing) —
  // a ring chasing a sliding control reads as a glitch.
  const [settled, setSettled] = useState(true);
  // While the user scrolls, position updates must be instant — the glide
  // transition (meant for slow layout drifts) reads as the ring lagging
  // behind its target.
  const [scrolling, setScrolling] = useState(false);
  const scrollQuietTimerRef = useRef<number | null>(null);
  const lastRectRef = useRef<Rect | null>(null);
  const stepNavRef = useRef<{
    key: string | null;
    pushed: boolean;
    arrived: boolean;
    startPath: string;
  }>({ key: null, pushed: false, arrived: false, startPath: '' });
  const scrolledRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarsePointer(query.matches);
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

  // Once a step has shown its target, losing it means the user backed out of
  // the surface it lived on (closed the sheet without acting). A short grace
  // window lets list re-renders re-attach; past that, the guide cancels
  // instead of lying in wait to re-appear on the next open.
  const hadAnchorRef = useRef(false);
  useEffect(() => {
    hadAnchorRef.current = false;
  }, [stepKey]);

  // Find the anchor element; give up quietly if it never shows.
  useEffect(() => {
    setEl(null);
    setRect(null);
    if (!step || !stepKey) return;
    if (step.href && pathname !== step.href) return;

    if (!hadAnchorRef.current && step.skipWhenPresent) {
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
      if (alreadyPresent) {
        advanceHintStep();
        return;
      }
    }

    const selector = step.selector ?? `[data-hint="${step.anchor}"]`;
    const timeoutMs = hadAnchorRef.current
      ? REACQUIRE_TIMEOUT_MS
      : step.timeoutMs ?? FIND_TIMEOUT_MS;
    const startedAt = Date.now();
    const find = () => {
      if (step.requirePresent) {
        const requireTagIds = activeHint?.context?.tagIds ?? [];
        const present = Array.from(
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
        if (!present) return false;
      }
      const contextTagIds = activeHint?.context?.tagIds ?? [];
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      );
      for (const candidate of candidates) {
        if (
          step.matchTagIds &&
          !tagCondition(candidate, contextTagIds, 'hit')
        ) {
          continue;
        }
        const r = measure(candidate);
        if (isUsableAnchor(candidate, r, step.coverCheck !== false)) {
          hadAnchorRef.current = true;
          lastRectRef.current = r;
          // Start hidden: if the anchor is inside an opening sheet the next
          // measurements still move, and the ring must not paint mid-slide.
          // A static anchor settles on the first tracker tick (~150ms).
          setSettled(false);
          setEl(candidate);
          setRect(r);
          return true;
        }
      }
      return false;
    };

    if (find()) return;
    const interval = window.setInterval(() => {
      if (find()) {
        window.clearInterval(interval);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        window.clearInterval(interval);
        dismissHintGuide();
      }
    }, 200);
    return () => window.clearInterval(interval);
  }, [stepKey, step, pathname, searchNonce, dismissHintGuide, advanceHintStep]);

  // Keep the spotlight glued to the element; restart the search if it leaves
  // the DOM (sheet closed, list re-rendered).
  useEffect(() => {
    if (!el) return;

    if (scrolledRef.current !== stepKey) {
      scrolledRef.current = stepKey;
      // Only scroll when the anchor isn't comfortably in view — a smooth
      // scroll while the user is already reaching for a visible target makes
      // their tap land on whatever slides under the finger.
      const r = el.getBoundingClientRect();
      const comfortablyVisible =
        r.top >= 72 && r.bottom <= window.innerHeight - 96;
      if (!comfortablyVisible) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }

    const update = () => {
      const next = measure(el);
      const requiredGone =
        !!step?.requirePresent &&
        !Array.from(
          document.querySelectorAll<HTMLElement>(step.requirePresent),
        ).some((candidate) => {
          if (
            step.requirePresentTagMatch &&
            !tagCondition(
              candidate,
              activeHint?.context?.tagIds ?? [],
              step.requirePresentTagMatch,
            )
          ) {
            return false;
          }
          const r = candidate.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
      if (requiredGone || !isUsableAnchor(el, next, false)) {
        setEl(null);
        setRect(null);
        setSearchNonce((n) => n + 1);
        return;
      }
      const previous = lastRectRef.current;
      lastRectRef.current = next;
      // Small drifts (a toolbar lifting for a toast) are followed with a CSS
      // glide on the overlay; only big jumps — sheets sliding, page scrolls —
      // hide it until the anchor comes to rest.
      const moved =
        !!previous &&
        Math.abs(previous.top - next.top) + Math.abs(previous.left - next.left) >
          120;
      setSettled(!moved);
      setRect((prev) => (rectsEqual(prev, next) ? prev : next));
    };
    const onScroll = () => {
      setScrolling(true);
      if (scrollQuietTimerRef.current) {
        window.clearTimeout(scrollQuietTimerRef.current);
      }
      scrollQuietTimerRef.current = window.setTimeout(
        () => setScrolling(false),
        160,
      );
      update();
    };
    const interval = window.setInterval(update, 150);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', update);
    return () => {
      window.clearInterval(interval);
      if (scrollQuietTimerRef.current) {
        window.clearTimeout(scrollQuietTimerRef.current);
      }
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', update);
    };
  }, [el, stepKey, step]);

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

  const rawLabel = coarsePointer && step.labelCoarse ? step.labelCoarse : step.label;
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
                    className="inline-flex max-w-[7rem] items-center rounded-md border px-1.5 py-px text-[10px] font-black uppercase tracking-wide"
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
  const showGesture = coarsePointer && !!step.gesture;

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
