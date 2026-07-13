'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { useUIStore } from '@/lib/uiStore';
import { guideById } from '@/lib/hints/guides';

const FIND_TIMEOUT_MS = 12_000;
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

  // Find the anchor element; give up quietly if it never shows.
  useEffect(() => {
    setEl(null);
    setRect(null);
    if (!step || !stepKey) return;
    if (step.href && pathname !== step.href) return;

    const selector = step.selector ?? `[data-hint="${step.anchor}"]`;
    const timeoutMs = step.timeoutMs ?? FIND_TIMEOUT_MS;
    const startedAt = Date.now();
    const find = () => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(selector),
      );
      for (const candidate of candidates) {
        const r = candidate.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setEl(candidate);
          setRect(measure(candidate));
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
  }, [stepKey, step, pathname, dismissHintGuide]);

  // Keep the spotlight glued to the element; restart the search if it leaves
  // the DOM (sheet closed, list re-rendered).
  useEffect(() => {
    if (!el) return;

    if (scrolledRef.current !== stepKey) {
      scrolledRef.current = stepKey;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    const update = () => {
      if (!el.isConnected) {
        setEl(null);
        setRect(null);
        return;
      }
      const next = measure(el);
      setRect((prev) => (rectsEqual(prev, next) ? prev : next));
    };
    const interval = window.setInterval(update, 150);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [el, stepKey]);

  // Touching the anchor advances the guide (or finishes it on the last step);
  // touching anywhere else — outside the anchor and the label — closes it.
  const labelRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (el.contains(target)) {
        if (step?.advanceOnAnchorDown === false) return;
        if (isLastStep) dismissHintGuide();
        else advanceHintStep();
        return;
      }
      if (labelRef.current?.contains(target)) return;
      dismissHintGuide();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true);
  }, [el, step, isLastStep, advanceHintStep, dismissHintGuide]);

  const borderRadius = useMemo(() => {
    if (!el) return '16px';
    const radius = window.getComputedStyle(el).borderRadius;
    return radius && radius !== '0px' ? radius : '16px';
  }, [el]);

  if (!mounted || !activeHint || !step) return null;

  const label = coarsePointer && step.labelCoarse ? step.labelCoarse : step.label;
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
      {rect && (
        <>
          <div
            aria-hidden
            className="pointer-events-none fixed z-[80]"
            style={{
              top: rect.top - RING_PADDING,
              left: rect.left - RING_PADDING,
              width: rect.width + RING_PADDING * 2,
              height: rect.height + RING_PADDING * 2,
            }}
          >
            <span
              className="absolute inset-0 ring-[3px] ring-amber-400/90 animate-[demo-glow-breathe_2.4s_ease-in-out_infinite]"
              style={{ borderRadius }}
            />
            <span
              className="absolute inset-0 ring-[3px] ring-amber-400 animate-[demo-sonar_2.4s_cubic-bezier(0,0,0.2,1)_infinite] motion-reduce:hidden"
              style={{ borderRadius }}
            />
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
            className="pointer-events-none fixed z-[80] flex w-[260px] -translate-x-1/2 justify-center"
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
