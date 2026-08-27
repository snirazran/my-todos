'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

import { ArrowLeftRight, CalendarDays, ListChecks } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { Icon } from '@/components/ui/Icon';
import {
  measure,
  useAnchorTracker,
  type AnchorRect,
} from '@/lib/hints/useAnchorTracker';
import { usePlannerTour } from '@/hooks/usePlannerTour';
import { TOUR_BEAT_COUNT } from '@/lib/tour/plannerTour';
import GhostHand, {
  PointerArrow,
  TapPulse,
  TAP_PULSE_MAX_EXTENT,
} from './GhostHand';

const RING_PADDING = 6;
const BEAT_REACQUIRE_MS = 60_000;
/** Above this width a target is a row, and gets a tint rather than a halo. */
const WIDE_TARGET = 200;

const OPENER_MOVES = [
  {
    icon: <ArrowLeftRight className="h-4 w-4" strokeWidth={2.75} />,
    text: 'Move a task to any day',
  },
  {
    icon: <Icon name="saved" className="h-5 w-5" />,
    text: 'Save one for later',
  },
  {
    icon: <ListChecks className="h-4 w-4" strokeWidth={2.75} />,
    text: 'Grab a few at once',
  },
  {
    icon: <CalendarDays className="h-4 w-4" strokeWidth={2.75} />,
    text: 'Jump to any date',
  },
];

type TourTarget = AnchorRect & { selected: boolean; radius: string };

function radiusOf(node: HTMLElement) {
  const value = window.getComputedStyle(node).borderRadius;
  return value && value !== '0px' ? value : '16px';
}

/** A selected row already draws its own inset ring; a second one is noise. */
function hasOwnHighlight(node: HTMLElement) {
  return node.getAttribute('aria-selected') === 'true';
}

function edgeFallback(from: AnchorRect, target: string): AnchorRect | null {
  if (typeof window === 'undefined') return null;
  if (target === 'tour-next-day') {
    // Just to the right of the card itself, which is the next column on a wide
    // board and the auto-panning screen edge on a narrow one. Aiming at the
    // viewport edge instead sent the trail across the whole desktop board.
    return {
      top: from.top,
      left: Math.min(from.left + from.width + 28, window.innerWidth - 76),
      width: 52,
      height: Math.max(48, from.height),
    };
  }
  if (target === 'tour-day-column') {
    // The saved tray opens at top-[38vh]; aim into the column body above it,
    // clear of both the tray edge and the date strip at the top.
    return {
      top: Math.max(96, window.innerHeight * 0.24),
      left: window.innerWidth / 2 - 60,
      width: 120,
      height: 72,
    };
  }
  return null;
}

export default function PlannerTour({
  enabled,
  activeDateKey,
  timezone,
  onBoardChanged,
}: {
  enabled: boolean;
  activeDateKey: string;
  timezone: string;
  onBoardChanged: () => void | Promise<void>;
}) {
  const tour = usePlannerTour({
    enabled,
    activeDateKey,
    timezone,
    onBoardChanged,
  });
  const { beat, running, phase } = tour;

  const [mounted, setMounted] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setMounted(true);
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const scroller = document.querySelector('[data-role="board-scroller"]');
    if (!scroller) return;
    const sync = () => setDragging(scroller.getAttribute('data-drag') === '1');
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(scroller, {
      attributes: true,
      attributeFilter: ['data-drag'],
    });
    return () => observer.disconnect();
  }, [phase]);

  useEffect(() => {
    const down = () => setInteracting(true);
    const up = () => setInteracting(false);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
    };
  }, []);

  const anchorSelector = beat
    ? beat.selector ?? `[data-hint="${beat.anchor}"]`
    : null;

  const skipBeatRef = useRef(tour.skipBeat);
  skipBeatRef.current = tour.skipBeat;
  const everAcquiredRef = useRef(false);

  const { el, rect, settled } = useAnchorTracker({
    selector: running ? anchorSelector : null,
    resetKey: running && beat ? beat.id : null,
    coverCheck: beat?.coverCheck !== false,
    scrollIntoView: false,
    reacquireTimeoutMs: BEAT_REACQUIRE_MS,
    onTimeout: () => {
      if (!everAcquiredRef.current) skipBeatRef.current();
    },
  });

  useEffect(() => {
    everAcquiredRef.current = false;
  }, [beat?.id]);
  useEffect(() => {
    if (el) everAcquiredRef.current = true;
  }, [el]);

  const dragToSelector =
    running && beat?.dragTo ? `[data-hint="${beat.dragTo}"]` : null;
  const { rect: dragToRect } = useAnchorTracker({
    selector: dragToSelector,
    resetKey: running && beat?.dragTo ? `${beat.id}:to` : null,
    scrollIntoView: false,
  });

  const [siblingRects, setSiblingRects] = useState<TourTarget[]>([]);
  useEffect(() => {
    if (!running || !beat?.multi || !anchorSelector) {
      setSiblingRects([]);
      return;
    }
    const read = () => {
      const found = Array.from(
        document.querySelectorAll<HTMLElement>(anchorSelector),
      )
        .map((node) => ({
          ...measure(node),
          selected: hasOwnHighlight(node),
          radius: radiusOf(node),
        }))
        .filter((r) => r.width > 1 && r.height > 1);
      setSiblingRects((prev) =>
        prev.length === found.length &&
        prev.every(
          (p, i) =>
            Math.abs(p.top - found[i].top) < 1 &&
            Math.abs(p.left - found[i].left) < 1 &&
            p.selected === found[i].selected,
        )
          ? prev
          : found,
      );
    };
    read();
    const interval = window.setInterval(read, 150);
    return () => window.clearInterval(interval);
  }, [running, beat?.multi, anchorSelector]);

  useEffect(() => {
    const clear = () =>
      document
        .querySelectorAll('.tour-target')
        .forEach((node) => node.classList.remove('tour-target'));
    if (!running || !anchorSelector || !settled) {
      clear();
      return;
    }
    const apply = () => {
      const nodes = beat?.multi
        ? Array.from(document.querySelectorAll<HTMLElement>(anchorSelector))
        : el
          ? [el]
          : [];
      // The saved tray hangs its data-hint on a transparent wrapper, so the
      // tint has to land on the card surface inside or it paints behind it.
      const surfaces = nodes.map(
        (node) => node.querySelector<HTMLElement>('[data-card-id]') ?? node,
      );
      document.querySelectorAll<HTMLElement>('.tour-target').forEach((node) => {
        if (!surfaces.includes(node)) node.classList.remove('tour-target');
      });
      for (const surface of surfaces) {
        const r = measure(surface);
        surface.classList.toggle(
          'tour-target',
          Math.max(r.width, r.height) > WIDE_TARGET && !hasOwnHighlight(surface),
        );
      }
    };
    apply();
    const interval = window.setInterval(apply, 300);
    return () => {
      window.clearInterval(interval);
      clear();
    };
  }, [running, settled, beat, el, anchorSelector]);

  const ghostTarget = useMemo(() => {
    if (!beat?.dragTo || !rect) return null;
    if (beat.dragTo === 'tour-next-day') {
      // A day column is full-height, so its centre sits far below the row being
      // dragged. Aim level with the card itself and only borrow the column's
      // horizontal position; without one, the auto-panning screen edge.
      const left = dragToRect
        ? dragToRect.left + Math.min(64, dragToRect.width / 2)
        : Math.min(rect.left + rect.width + 28, window.innerWidth - 76);
      return { top: rect.top, left, width: 52, height: rect.height };
    }
    return dragToRect ?? edgeFallback(rect, beat.dragTo);
  }, [beat?.dragTo, rect, dragToRect]);

  const completeRef = useRef(tour.completeBeat);
  completeRef.current = tour.completeBeat;
  useEffect(() => {
    if (!running || !beat?.onPress || !el) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (el.contains(target)) completeRef.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [running, beat, el]);

  if (!mounted || !enabled) return null;
  if (phase === 'idle' || phase === 'done') return null;

  const label = desktop && beat?.labelDesktop ? beat.labelDesktop : beat?.label;
  const showRing = running && !!rect && settled && !interacting;
  const showGhost = showRing && !!beat?.dragTo && !!ghostTarget;
  const showTap = showRing && !beat?.dragTo;
  const allRects: TourTarget[] =
    beat?.multi && siblingRects.length > 0
      ? siblingRects
      : rect
        ? [
            {
              ...rect,
              selected: el ? hasOwnHighlight(el) : false,
              radius: el ? radiusOf(el) : '16px',
            },
          ]
        : [];
  // One treatment per target, picked by its shape: rows get a tint (applied as
  // a class, see the .tour-target effect), buttons and pills get a halo that
  // matches their radius, and only a full panel gets an outline.
  const eligible = showRing ? allRects.filter((r) => !r.selected) : [];
  const pulseRects = eligible.filter(
    (r) =>
      Math.max(r.width, r.height) <= WIDE_TARGET &&
      Math.min(r.width, r.height) <= TAP_PULSE_MAX_EXTENT,
  );
  const ringRects = eligible.filter(
    (r) => Math.min(r.width, r.height) > TAP_PULSE_MAX_EXTENT,
  );
  const isCelebrating = phase === 'payoff' || phase === 'finale';
  const showCoachBar = (running || isCelebrating) && !dragging;
  const coachText =
    phase === 'finale'
      ? 'All yours now. Add a real one?'
      : phase === 'payoff'
        ? tour.payoff
        : label;
  // Keyed on the text, not the beat: the next chapter's beat is already staged
  // while its payoff is still showing, and keying on it would re-animate the
  // same line mid-celebration.
  const coachKey =
    phase === 'finale' ? 'finale' : `${phase}:${coachText ?? ''}`;

  return createPortal(
    <>
      <AnimatePresence>
        {phase === 'opener' && (
          <motion.div
            key="opener"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-[2002] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+76px+1rem)] md:pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
          >
            <div className="pointer-events-auto w-full max-w-sm rounded-3xl border border-border/60 bg-card/95 p-5 shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <span className="-mt-3 shrink-0">
                  <Fly size={46} alwaysPlay interactive={false} oversample={1.5} />
                </span>
                <h2 className="min-w-0 flex-1 text-[17px] font-black leading-tight text-foreground">
                  Your week, in four moves
                </h2>
                <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] font-black text-muted-foreground">
                  1 min
                </span>
              </div>

              <ul className="mt-4 grid gap-2">
                {OPENER_MOVES.map(({ icon, text }) => (
                  <li key={text} className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      {icon}
                    </span>
                    <span className="text-[13px] font-bold text-foreground">
                      {text}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={tour.start}
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-primary text-[15px] font-black text-primary-foreground shadow-[0_4px_0_0_#34631f] transition-all hover:brightness-105 active:translate-y-[2px] active:shadow-none"
                >
                  Show me how
                </button>
                <button
                  type="button"
                  onClick={tour.skip}
                  className="h-12 shrink-0 rounded-2xl px-3 text-[13px] font-bold text-muted-foreground transition-colors hover:text-foreground"
                >
                  Skip
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showGhost && rect && <GhostHand from={rect} to={ghostTarget} />}

      {pulseRects.map((r, i) => (
        <TapPulse key={`pulse-${i}`} at={r} />
      ))}

      {showRing && beat?.pointAt && rect && (
        <PointerArrow at={rect} direction={beat.pointAt} />
      )}

      {ringRects.map((r, i) => (
        <div
          key={`ring-${i}`}
          aria-hidden
          className="pointer-events-none fixed z-[2000] transition-[top,left,width,height] duration-200 ease-out"
          style={{
            top: r.top - RING_PADDING,
            left: r.left - RING_PADDING,
            width: r.width + RING_PADDING * 2,
            height: r.height + RING_PADDING * 2,
          }}
        >
          <span
            className={`absolute inset-0 rounded-2xl ring-[3px] ${
              tour.softened
                ? 'ring-primary/45'
                : 'ring-primary shadow-[0_0_18px_5px_rgba(122,183,66,0.35)]'
            }`}
          />
        </div>
        ))}

      {showCoachBar && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+176px)] z-[2002] flex justify-center px-4 md:bottom-[calc(env(safe-area-inset-bottom)+124px)]">
          <motion.div
            layout
            className="pointer-events-auto w-full max-w-sm rounded-2xl border border-primary/35 bg-card/95 px-4 py-3 shadow-xl backdrop-blur-xl"
          >
            <div className="flex items-start">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={coachKey}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className={`min-w-0 flex-1 text-[13.5px] font-bold leading-snug ${
                    isCelebrating ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  {coachText}
                </motion.p>
              </AnimatePresence>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                {Array.from({ length: TOUR_BEAT_COUNT }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i < tour.completedBeats
                        ? 'w-4 bg-primary'
                        : 'w-1.5 bg-primary/25'
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={tour.skip}
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground"
              >
                Skip
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>,
    document.body,
  );
}
