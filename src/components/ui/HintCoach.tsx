'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { useUIStore } from '@/lib/uiStore';
import { useFrogodoroStore } from '@/lib/frogodoroStore';
import { hapticTick } from '@/lib/haptics';
import {
  formatHintLabel,
  guideById,
  type HintGuideContext,
  type HintTagMatch,
} from '@/lib/hints/guides';
import {
  ANCHOR_FIND_TIMEOUT_MS,
  isUsableAnchor,
  measure,
  useAnchorTracker,
} from '@/lib/hints/useAnchorTracker';

const HOLE_PADDING = 6;
const CARD_WIDTH = 272;
const CARD_GAP = 14;
const EDGE_MARGIN = 12;
const NAV_MARGIN_TOUCH = 92;
const NAV_MARGIN_DESKTOP = 24;
const CARD_MIN_ROOM = 92;
const PRESENCE_POLL_MS = 160;
const COVER_POLL_MS = 300;
// How long the target may stay buried before the guide accepts it is done.
const COVER_GIVE_UP_MS = 1000;
const FADE_IN_MS = 90;
// A press that travels further or lasts longer than this was a scroll or a
// swipe, not a tap on the lit control.
const TAP_SLOP_PX = 12;
const TAP_MAX_MS = 800;

const BLOCKED_EVENTS = ['mousedown', 'mouseup', 'click', 'dblclick'] as const;

function elementTagIds(el: HTMLElement): string[] {
  const raw = el.dataset.tagIds ?? el.dataset.tagId ?? '';
  return raw.split(',').filter(Boolean);
}

function tagCondition(
  el: HTMLElement,
  contextTagIds: string[],
  match: HintTagMatch,
): boolean {
  const overlap = elementTagIds(el).some((id) => contextTagIds.includes(id));
  return match === 'hit' ? overlap : !overlap;
}

function anyVisible(
  selector: string,
  tagIds: string[],
  match: HintTagMatch | undefined,
  requireOnTop = false,
): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).some(
    (candidate) => {
      if (match && !tagCondition(candidate, tagIds, match)) return false;
      const rect = measure(candidate);
      if (rect.width < 1 || rect.height < 1) return false;
      return requireOnTop ? isUsableAnchor(candidate, rect, true) : true;
    },
  );
}

/** Highest z-index among the element's positioned ancestors — the layer it
 *  lives in. A control inside a sheet sits above that sheet's own backdrop. */
function layerDepth(el: HTMLElement): number {
  let depth = 0;
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (style.position !== 'static') {
      const z = Number.parseInt(style.zIndex || '', 10);
      if (Number.isFinite(z) && z > depth) depth = z;
    }
    node = node.parentElement;
  }
  return depth;
}

/** Renders {tags} as real tag chips when the guide carries colored tag data. */
function withTagChips(text: string, context: HintGuideContext | undefined) {
  const chips = context?.tags?.filter((tag) => tag.name);
  if (!chips?.length || !text.includes('{tags}')) {
    return formatHintLabel(text, context);
  }
  const parts = text.split('{tags}');
  return parts.flatMap((part, index) => {
    const nodes: React.ReactNode[] = [
      <span key={`t-${index}`}>{formatHintLabel(part, context)}</span>,
    ];
    if (index < parts.length - 1) {
      nodes.push(
        <span
          key={`chips-${index}`}
          className="mx-0.5 inline-flex flex-wrap items-center gap-1 align-middle"
        >
          {chips.map((tag) => (
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
  });
}

export function HintCoach() {
  const router = useRouter();
  const pathname = usePathname();
  const activeHint = useUIStore((s) => s.activeHint);
  const advanceHintBeat = useUIStore((s) => s.advanceHintBeat);
  const dismissHintGuide = useUIStore((s) => s.dismissHintGuide);

  const guide = guideById(activeHint?.guideId);
  const context = activeHint?.context;
  const beatIndex = activeHint?.beatIndex ?? 0;
  const beat = guide?.beats[beatIndex] ?? null;
  const isLastBeat = !!guide && beatIndex >= guide.beats.length - 1;
  const beatKey = activeHint
    ? `${activeHint.runId}:${activeHint.guideId}:${beatIndex}`
    : null;
  const tagIds = useMemo(() => context?.tagIds ?? [], [context?.tagIds]);

  const [mounted, setMounted] = useState(false);
  const [touch, setTouch] = useState(false);
  const [faded, setFaded] = useState(false);
  const [nudging, setNudging] = useState(false);

  useEffect(() => {
    setMounted(true);
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setTouch(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (activeHint && !guide) dismissHintGuide();
  }, [activeHint, guide, dismissHintGuide]);

  // Running past the last beat means the guide has shown everything it had.
  useEffect(() => {
    if (guide && beatIndex >= guide.beats.length) dismissHintGuide();
  }, [guide, beatIndex, dismissHintGuide]);

  useEffect(() => {
    if (!activeHint) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissHintGuide();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeHint, dismissHintGuide]);

  // Navigate to the beat's route at most once; a navigation the guide did not
  // ask for means the user is doing something else, so it gets out of the way.
  const navRef = useRef<{ key: string | null; arrived: boolean; from: string }>({
    key: null,
    arrived: false,
    from: '',
  });
  useEffect(() => {
    if (!beat || !beatKey) return;
    const nav = navRef.current;
    if (nav.key !== beatKey) {
      navRef.current = {
        key: beatKey,
        arrived: !beat.href || pathname === beat.href,
        from: pathname,
      };
      if (beat.href && pathname !== beat.href) router.push(beat.href);
      return;
    }
    if (beat.href) {
      if (pathname === beat.href) {
        nav.arrived = true;
        return;
      }
      if (nav.arrived || pathname !== nav.from) dismissHintGuide();
      return;
    }
    if (pathname !== nav.from) dismissHintGuide();
  }, [beatKey, beat, pathname, router, dismissHintGuide]);

  // A beat whose work is already visibly done is not worth showing.
  const skipCheckedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!beat || !beatKey || !beat.satisfiedWhen) return;
    if (skipCheckedRef.current === beatKey) return;
    if (beat.href && pathname !== beat.href) return;
    skipCheckedRef.current = beatKey;
    if (anyVisible(beat.satisfiedWhen, tagIds, beat.satisfiedWhenTagMatch)) {
      advanceHintBeat();
    }
  }, [beatKey, beat, pathname, tagIds, advanceHintBeat]);

  useEffect(() => {
    if (!beat?.advanceOnEvent || !beatKey) return;
    const event = beat.advanceOnEvent;
    const onEvent = () => advanceHintBeat();
    window.addEventListener(event, onEvent);
    return () => window.removeEventListener(event, onEvent);
  }, [beatKey, beat, advanceHintBeat]);

  useEffect(() => {
    if (!beat?.advanceWhenPresent || !beatKey) return;
    const selector = beat.advanceWhenPresent;
    const match = beat.advanceWhenPresentTagMatch;
    const interval = window.setInterval(() => {
      if (anyVisible(selector, tagIds, match, true)) advanceHintBeat();
    }, PRESENCE_POLL_MS);
    return () => window.clearInterval(interval);
  }, [beatKey, beat, tagIds, advanceHintBeat]);

  const { el, rect, settled, scrolling } = useAnchorTracker({
    selector: beat ? (beat.selector ?? `[data-hint="${beat.anchor}"]`) : null,
    resetKey: beatKey,
    enabled: !!beat && (!beat.href || pathname === beat.href),
    coverCheck: beat?.coverCheck !== false,
    timeoutMs: beat?.timeoutMs ?? ANCHOR_FIND_TIMEOUT_MS,
    filter: (candidate) =>
      !beat?.matchTagIds || tagCondition(candidate, tagIds, 'hit'),
    onTimeout: dismissHintGuide,
  });

  // An anchor a sheet has opened over is not something to point at. Tapping the
  // lit control to open something IS the user following the hint, so once the
  // target is buried the guide has done its job and closes.
  const [covered, setCovered] = useState(false);
  const coveredRef = useRef(false);
  coveredRef.current = covered;
  useEffect(() => {
    setCovered(false);
    if (!el) return;
    const bowsOutWhenBuried = !beat?.advanceWhenPresent && !beat?.advanceOnEvent;
    let buriedSince = 0;

    const buried = () => {
      const box = measure(el);
      if (box.width < 1 || box.height < 1) return true;
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
        return true;
      }
      // A full-bleed layer stacked higher than the anchor's own layer is a
      // sheet or modal the user would have to get through first. Comparing
      // depths is what lets a guide still point at a control inside one.
      const mine = layerDepth(el);
      for (const layer of Array.from(
        document.querySelectorAll<HTMLElement>('.fixed.inset-0'),
      )) {
        if (layer.contains(el) || el.contains(layer)) continue;
        const style = window.getComputedStyle(layer);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        if (Number.parseFloat(style.opacity || '1') < 0.05) continue;
        const depth = Number.parseInt(style.zIndex || '0', 10);
        if (Number.isFinite(depth) && depth >= 1000 && depth > mine) return true;
      }
      // Anchors that opt out of the hit test live under oversized transparent
      // art (the frog's full-width canvas) that would read as cover forever.
      // The sheet check above still applies to them.
      if (beat?.coverCheck === false) return false;
      const stack = document
        .elementsFromPoint(x, y)
        .filter((node) => !node.closest('[data-hint-coach]'));
      const own = stack.findIndex((node) => node === el || el.contains(node));
      if (own === -1) return true;
      // Ancestors legitimately paint around their child; anything else above
      // the anchor is a layer the user would have to get through first.
      return stack.slice(0, own).some((node) => !node.contains(el));
    };

    const check = () => {
      if (document.hidden) return;
      if (!buried()) {
        buriedSince = 0;
        setCovered(false);
        return;
      }
      setCovered(true);
      // A beat that is waiting for a surface to appear expects to be buried —
      // opening that surface is the step. Any other beat has been left behind.
      if (bowsOutWhenBuried) {
        if (!buriedSince) buriedSince = Date.now();
        else if (Date.now() - buriedSince > COVER_GIVE_UP_MS) dismissHintGuide();
      }
    };

    check();
    const interval = window.setInterval(check, COVER_POLL_MS);
    return () => window.clearInterval(interval);
  }, [el, beatKey, beat, dismissHintGuide]);

  // Geometry is never animated — moving a full-screen dim repaints every
  // frame. Beats cross-fade instead, which the compositor handles alone.
  useEffect(() => {
    setFaded(false);
    if (!rect || !settled) return;
    const timer = window.setTimeout(() => setFaded(true), FADE_IN_MS);
    return () => window.clearTimeout(timer);
  }, [beatKey, rect, settled]);

  const lastTickedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!el || !beatKey || lastTickedRef.current === beatKey) return;
    lastTickedRef.current = beatKey;
    hapticTick();
  }, [el, beatKey]);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const nudgeTimerRef = useRef<number | null>(null);
  const gestureRef = useRef<{
    id: number;
    x: number;
    y: number;
    at: number;
    blocked: boolean;
    onAnchor: boolean;
  } | null>(null);
  // The click that follows the tap which ends a guide must still land, even
  // though the overlay is already tearing down around it.
  const passThroughUntilRef = useRef(0);

  // A running focus session means the user already did the thing — including
  // via the swipe shortcut, which never touches the timer button at all.
  const focusRunning = useFrogodoroStore((s) => s.isRunning);
  useEffect(() => {
    if (guide?.endWhen === 'focus-running' && focusRunning) dismissHintGuide();
  }, [guide, focusRunning, dismissHintGuide]);

  useEffect(() => {
    if (!guide?.endOnEvent) return;
    const event = guide.endOnEvent;
    const onEvent = () => dismissHintGuide();
    window.addEventListener(event, onEvent);
    return () => window.removeEventListener(event, onEvent);
  }, [guide, dismissHintGuide]);

  // Taps outside the lit control are swallowed in the capture phase, so the
  // rest of the page cannot be operated. Nothing calls preventDefault on the
  // pointer stream, so scrolling and the page's own gestures stay untouched —
  // and a press that turns into a scroll never counts as doing the step.
  useEffect(() => {
    if (!el || !beat) return;

    const onCard = (target: EventTarget | null) =>
      target instanceof Node && !!cardRef.current?.contains(target);

    const onExtra = (target: EventTarget | null) =>
      !!beat.alsoAdvanceOn &&
      target instanceof Element &&
      !!target.closest(beat.alsoAdvanceOn);

    const onAnchor = (target: EventTarget | null) =>
      target instanceof Node && el.contains(target);

    const allowed = (target: EventTarget | null) =>
      onCard(target) || onAnchor(target) || onExtra(target);

    const nudge = () => {
      setNudging(true);
      if (nudgeTimerRef.current) window.clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = window.setTimeout(() => setNudging(false), 460);
    };

    const onPointerDown = (event: PointerEvent) => {
      const blocked = !coveredRef.current && !allowed(event.target);
      gestureRef.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        at: Date.now(),
        blocked,
        onAnchor: !onCard(event.target) && onAnchor(event.target),
      };
      if (blocked) event.stopPropagation();
      else passThroughUntilRef.current = Date.now() + 1200;
    };

    const onPointerUp = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (!gesture || gesture.id !== event.pointerId) {
        if (!coveredRef.current && !allowed(event.target)) {
          event.stopPropagation();
        }
        return;
      }
      if (gesture.blocked) {
        event.stopPropagation();
        return;
      }
      if (event.type === 'pointercancel' || onCard(event.target)) return;

      const travelled = Math.hypot(
        event.clientX - gesture.x,
        event.clientY - gesture.y,
      );
      if (travelled > TAP_SLOP_PX) return;
      if (Date.now() - gesture.at > TAP_MAX_MS) return;

      const viaExtra = onExtra(event.target);
      if (!viaExtra && (!gesture.onAnchor || beat.advanceOnTap === false)) {
        return;
      }
      if (isLastBeat) dismissHintGuide();
      else advanceHintBeat();
    };

    // Everything after the press follows the press: a gesture that began on the
    // lit control keeps its whole event stream, even when the control unmounts
    // under the finger and the release lands somewhere else entirely.
    const onBlockedEvent = (event: Event) => {
      if (Date.now() < passThroughUntilRef.current) return;
      const gesture = gestureRef.current;
      const blocked = gesture
        ? gesture.blocked
        : !coveredRef.current && !allowed(event.target);
      if (!blocked) return;
      event.stopPropagation();
      if (event.type === 'click') {
        event.preventDefault();
        nudge();
      }
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);
    for (const type of BLOCKED_EVENTS) {
      document.addEventListener(type, onBlockedEvent, true);
    }
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerUp, true);
      for (const type of BLOCKED_EVENTS) {
        document.removeEventListener(type, onBlockedEvent, true);
      }
      if (nudgeTimerRef.current) window.clearTimeout(nudgeTimerRef.current);
      gestureRef.current = null;
    };
  }, [el, beat, isLastBeat, advanceHintBeat, dismissHintGuide]);

  const borderRadius = useMemo(() => {
    if (!el) return '18px';
    const radius = window.getComputedStyle(el).borderRadius;
    return radius && radius !== '0px' ? radius : '18px';
  }, [el]);

  if (!mounted || !activeHint || !beat || !rect) return null;

  const hole = {
    top: rect.top - HOLE_PADDING,
    left: rect.left - HOLE_PADDING,
    width: rect.width + HOLE_PADDING * 2,
    height: rect.height + HOLE_PADDING * 2,
  };
  const holeBottom = hole.top + hole.height;
  const holeCenterX = hole.left + hole.width / 2;

  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const navMargin = touch ? NAV_MARGIN_TOUCH : NAV_MARGIN_DESKTOP;
  const roomBelow = viewportHeight - holeBottom - navMargin;
  const roomAbove = hole.top - EDGE_MARGIN;
  const placement =
    roomBelow > CARD_MIN_ROOM
      ? 'below'
      : roomAbove > CARD_MIN_ROOM
        ? 'above'
        : 'docked';
  const cardLeft = Math.min(
    Math.max(holeCenterX - CARD_WIDTH / 2, EDGE_MARGIN),
    Math.max(EDGE_MARGIN, viewportWidth - CARD_WIDTH - EDGE_MARGIN),
  );
  const cardStyle =
    placement === 'below'
      ? { top: holeBottom + CARD_GAP }
      : placement === 'above'
        ? { bottom: viewportHeight - hole.top + CARD_GAP }
        : { bottom: navMargin };
  const caretLeft = Math.min(
    Math.max(holeCenterX - cardLeft, 22),
    CARD_WIDTH - 22,
  );
  const opacity = settled && faded && !covered ? 1 : 0;
  const fade = scrolling ? '' : 'transition-opacity duration-200 ease-out';

  return createPortal(
    <>
      <div
        aria-hidden
        className={`hint-spotlight pointer-events-none fixed z-[1998] ${fade}`}
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
          borderRadius,
          opacity,
        }}
      />
      <div
        aria-hidden
        className={`pointer-events-none fixed z-[1999] ${fade} ${
          nudging ? 'animate-[hint-nudge_0.46s_ease-out]' : ''
        }`}
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
          borderRadius,
          opacity,
          border: '2px solid hsl(var(--primary))',
        }}
      >
        <span
          className="hint-ring-glow absolute inset-0 motion-safe:animate-[hint-breathe_2.6s_ease-in-out_infinite]"
          style={{ borderRadius: 'inherit' }}
        />
        {touch && beat.gesture && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span
              className={`text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] motion-reduce:hidden ${
                beat.gesture === 'swipe-left'
                  ? 'animate-[hint-swipe-left_1.6s_ease-in-out_infinite]'
                  : 'animate-[hint-swipe-right_1.6s_ease-in-out_infinite]'
              }`}
            >
              {beat.gesture === 'swipe-left' ? (
                <ChevronsLeft className="h-8 w-8" strokeWidth={3} />
              ) : (
                <ChevronsRight className="h-8 w-8" strokeWidth={3} />
              )}
            </span>
          </span>
        )}
      </div>

      <div
        ref={cardRef}
        data-hint-coach
        className={`fixed z-[2000] ${fade}`}
        style={{ width: CARD_WIDTH, left: cardLeft, opacity, ...cardStyle }}
      >
        <div className="relative rounded-2xl border border-border bg-card px-3.5 py-3 text-card-foreground shadow-[0_4px_0_0_rgba(15,23,42,0.10)] ring-1 ring-black/5">
          {placement !== 'docked' && (
            <span
              aria-hidden
              className="absolute h-3 w-3 rotate-45 rounded-[3px] border-border bg-card"
              style={{
                left: caretLeft - 6,
                ...(placement === 'below'
                  ? { top: -7, borderTopWidth: 1, borderLeftWidth: 1 }
                  : { bottom: -7, borderBottomWidth: 1, borderRightWidth: 1 }),
              }}
            />
          )}
          <div className="relative flex items-start gap-2">
            <p
              role="status"
              aria-live="polite"
              className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-foreground"
            >
              {withTagChips(
                touch && beat.sayTouch ? beat.sayTouch : beat.say,
                context,
              )}
            </p>
            <button
              type="button"
              aria-label="Close hint"
              onClick={dismissHintGuide}
              className="-mr-1 -mt-1 shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={3} />
            </button>
          </div>
          {beat.informational && (
            <button
              type="button"
              onClick={dismissHintGuide}
              className="mt-2.5 inline-flex h-9 w-full items-center justify-center rounded-xl bg-primary px-3 text-[13px] font-black tracking-wide text-primary-foreground shadow-[0_3px_0_0_hsl(var(--primary)/0.55)] transition-all active:translate-y-[2px] active:shadow-none"
            >
              Got it
            </button>
          )}
          {guide && guide.beats.length > 1 && (
            <div className="mt-2.5 flex items-center gap-1.5" aria-hidden>
              {guide.beats.map((_, index) => (
                <span
                  key={index}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    index <= beatIndex ? 'bg-primary' : 'bg-primary/20'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
