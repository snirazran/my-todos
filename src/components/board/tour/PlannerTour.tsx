'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';

import { ArrowLeftRight, CalendarDays, ListChecks } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { hapticTick } from '@/lib/haptics';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import {
  measure,
  useAnchorTracker,
  type AnchorRect,
} from '@/lib/hints/useAnchorTracker';
import { usePlannerTour } from '@/hooks/usePlannerTour';
import {
  TOUR_BEAT_COUNT,
  PLANNER_TOUR_GIFT_ID,
  PLANNER_TOUR_GIFT_RIVE,
} from '@/lib/tour/plannerTour';
import GiftBoxOpening from '@/components/ui/gift-box/GiftBoxOpening';
import GhostHand, {
  DragEdgeArrows,
  PointerArrow,
  TapPulse,
  TAP_PULSE_MAX_EXTENT,
} from './GhostHand';
import TourRewardOverlay from './TourRewardOverlay';
import TourSpotlight, {
  radiusValue,
  type SpotlightHole,
} from './TourSpotlight';

const RING_PADDING = 6;
const BEAT_REACQUIRE_MS = 60_000;
const MISSED_PRESS_MS = 4000;
/** Above this width a target is a row, and gets a tint rather than a halo. */
const WIDE_TARGET = 200;

const OPENER_MOVES = [
  {
    icon: <ArrowLeftRight className="h-4 w-4" strokeWidth={2.75} />,
    text: 'Move to any day',
  },
  {
    icon: <Icon name="saved" className="h-5 w-5" />,
    text: 'Save for later',
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
  const [nudge, setNudge] = useState(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const shake = useAnimationControls();

  useEffect(() => {
    setMounted(true);
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const read = () =>
      setViewport((prev) =>
        prev.width === window.innerWidth && prev.height === window.innerHeight
          ? prev
          : { width: window.innerWidth, height: window.innerHeight },
      );
    read();
    window.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
    return () => {
      window.removeEventListener('resize', read);
      window.removeEventListener('orientationchange', read);
    };
  }, []);

  useEffect(() => {
    if (nudge === 0) return;
    hapticTick();
    void shake.start({
      x: [0, -7, 7, -4, 4, 0],
      transition: { duration: 0.34, ease: 'easeInOut' },
    });
  }, [nudge, shake]);

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

  // The keep-going arrows have done their job once the board has actually
  // travelled a column — past that they are pointing at a day the card has
  // already reached.
  const [pannedAway, setPannedAway] = useState(false);
  useEffect(() => {
    if (!dragging) {
      setPannedAway(false);
      return;
    }
    const scroller = document.querySelector<HTMLElement>(
      '[data-role="board-scroller"]',
    );
    if (!scroller) return;
    const from = scroller.scrollLeft;
    const column = document.querySelector<HTMLElement>('[data-col="true"]');
    const travelled = (column?.offsetWidth ?? 320) * 0.55;
    const check = () => {
      if (Math.abs(scroller.scrollLeft - from) >= travelled) {
        setPannedAway(true);
      }
    };
    const interval = window.setInterval(check, 100);
    scroller.addEventListener('scroll', check, { passive: true });
    return () => {
      window.clearInterval(interval);
      scroller.removeEventListener('scroll', check);
    };
  }, [dragging]);

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

  const holesRef = useRef<SpotlightHole[]>([]);
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

  // The control that opened the state this beat lives in. It is cut out of the
  // dim only while that state is off — the way back in after multi-select
  // drops itself, never a second highlight beside the real target.
  const escapeAnchor = useMemo(() => {
    if (!running || !tour.chapter || !beat) return null;
    const beats = tour.chapter.beats;
    const index = beats.findIndex((b) => b.id === beat.id);
    for (let i = index - 1; i >= 0; i--) {
      if (beats[i].onPress) return beats[i].anchor;
    }
    return null;
  }, [running, tour.chapter, beat]);

  const { rect: escapeRect } = useAnchorTracker({
    selector: escapeAnchor ? `[data-hint="${escapeAnchor}"]` : null,
    resetKey: escapeAnchor && beat ? `${beat.id}:escape` : null,
    // Only while the mode it opens is off. Once multi-select is on, its button
    // is neither a target nor a way out, so it goes back under the dim.
    gate: () => {
      if (!escapeAnchor) return false;
      const node = document.querySelector(`[data-hint="${escapeAnchor}"]`);
      if (!node) return false;
      return (
        node.getAttribute('aria-pressed') !== 'true' &&
        node.getAttribute('aria-expanded') !== 'true'
      );
    },
    // Keep watching for the whole step: the way back in has to reappear the
    // moment multi-select drops itself, not only in the first seconds.
    timeoutMs: BEAT_REACQUIRE_MS,
    reacquireTimeoutMs: BEAT_REACQUIRE_MS,
    scrollIntoView: false,
  });

  // The Saved box turns into a full-width drop strip the moment a card is
  // lifted, so the strip — not the box — is what the hint has to point at.
  const dropZoneSelector =
    running && dragging && beat?.dragTo === 'saved-tasks'
      ? '[data-hint="saved-drop-zone"]'
      : null;
  const { rect: dropZoneRect } = useAnchorTracker({
    selector: dropZoneSelector,
    resetKey: dropZoneSelector && beat ? `${beat.id}:drop` : null,
    coverCheck: false,
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

  // Tap beats have no event to replay, so the last press on a hinted control is
  // remembered and credited if the beat asking for it arms just afterwards.
  const lastPressRef = useRef<{ anchor: string; at: number } | null>(null);
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const hinted = event.target.closest<HTMLElement>('[data-hint]');
      if (hinted?.dataset.hint) {
        lastPressRef.current = { anchor: hinted.dataset.hint, at: Date.now() };
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, []);

  useEffect(() => {
    if (!running || !beat?.onPress) return;
    const last = lastPressRef.current;
    if (!last || last.anchor !== beat.anchor) return;
    if (Date.now() - last.at > MISSED_PRESS_MS) return;
    lastPressRef.current = null;
    completeRef.current();
  }, [running, beat]);

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
  const isCelebrating = phase === 'payoff';
  // The step's own target(s) only. A drag beat's destination stays under the
  // dim — the trail already points at it, and a second cutout out there reads
  // as a competing target.
  const liveHoles: SpotlightHole[] = running
    ? [
        ...allRects.map((r) => ({
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
          radius: radiusValue(r.radius),
        })),
        ...(escapeRect ? [{ ...escapeRect, radius: 20 }] : []),
      ]
    : [];
  // A beat completes on pointerdown, so the cutout would otherwise move out
  // from under a finger that is still pressing — the release then lands on the
  // scrim and the browser drops the click entirely.
  if (liveHoles.length > 0 && settled && !interacting) {
    holesRef.current = liveHoles;
  }
  const frozen = interacting && holesRef.current.length > 0;
  // Between two beats — the celebration, and the card seeding behind it — the
  // dim closes over the whole board instead of holding the finished step's
  // cutout open on a row that has already moved or gone.
  const scrimHoles = !running
    ? []
    : frozen
      ? holesRef.current
      : settled
        ? liveHoles
        : [];
  // Where the card was picked up from, so the keep-going arrows sit level with
  // it rather than at some fixed height the card has already left.
  const grabbedFrom = holesRef.current[0] ?? rect;
  const showDragArrows =
    running &&
    dragging &&
    !pannedAway &&
    beat?.dragTo === 'tour-next-day' &&
    !!grabbedFrom;
  const showDropArrows =
    running && dragging && beat?.dragTo === 'saved-tasks' && !!dropZoneRect;
  // The dim steps out of the way for the whole drag: the card is already the
  // focus once it is in the air, and dimming the board it is being dropped on
  // fights the drop zones instead of guiding them.
  const showScrim =
    viewport.width > 0 &&
    !dragging &&
    (phase === 'opener' || running || isCelebrating);
  // The finale hands over to the reward card, which is its own full-screen
  // moment — the coach bar would just compete with it.
  const showCoachBar = (running || isCelebrating) && !dragging;
  const coachText = isCelebrating ? tour.payoff : label;
  // Keyed on the text, not the beat: the next chapter's beat is already staged
  // while its payoff is still showing, and keying on it would re-animate the
  // same line mid-celebration.
  const coachKey = `${phase}:${coachText ?? ''}`;

  if (phase === 'finale') {
    return <TourRewardOverlay claiming={tour.claiming} onClaim={tour.claimReward} />;
  }

  if (phase === 'opening') {
    return (
      <GiftBoxOpening
        giftBoxId={PLANNER_TOUR_GIFT_ID}
        onClose={tour.closeGift}
      />
    );
  }

  return createPortal(
    <>
      <AnimatePresence>
        {showScrim && (
          <TourSpotlight
            key="scrim"
            holes={phase === 'opener' ? [] : scrimHoles}
            blocking={
              running && !dragging && !interacting && scrimHoles.length > 0
            }
            viewport={viewport}
            onBlockedPress={() => setNudge((n) => n + 1)}
          />
        )}
      </AnimatePresence>

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
            <div className="pointer-events-auto w-full max-w-sm rounded-3xl border border-border/60 bg-card p-5 pt-0 shadow-2xl dark:border-primary/30 dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]">
              {/* The quest page's reward tile, at opener size — a gift the
                  user has seen there reads as the same object here. */}
              <div className="-mt-10 mb-2 flex justify-center">
                <div className="relative flex h-20 w-20 items-center justify-center overflow-visible rounded-[24px] border-2 border-slate-300 bg-gradient-to-br from-slate-200 to-slate-100 shadow-sm shadow-slate-900/10 dark:border-slate-600 dark:from-slate-800 dark:to-slate-900">
                  <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <div className="h-[124%] w-[124%] -translate-y-[13%] drop-shadow-lg">
                      <GiftRive
                        className="h-full w-full"
                        color={PLANNER_TOUR_GIFT_RIVE}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <h2 className="text-center text-[19px] font-black leading-tight text-foreground">
                Finish the tour, get a free gift
              </h2>
              <p className="mt-1 text-center text-[12.5px] font-bold text-muted-foreground">
                Learn these four moves · about a minute
              </p>

              <ul className="mt-3.5 grid gap-1.5">
                {OPENER_MOVES.map(({ icon, text }) => (
                  <li key={text} className="flex items-center gap-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary dark:bg-primary/20 dark:text-white dark:ring-1 dark:ring-primary/40">
                      {icon}
                    </span>
                    <span className="text-[13px] font-bold text-foreground">
                      {text}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={tour.start}
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-primary text-[15px] font-black text-primary-foreground shadow-[0_4px_0_0_#34631f] transition-all hover:brightness-105 active:translate-y-[2px] active:shadow-none dark:shadow-[0_4px_0_0_#1b4a16]"
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

      {showDragArrows && grabbedFrom && (
        <DragEdgeArrows
          direction="right"
          at={{ x: 0, y: grabbedFrom.top + grabbedFrom.height / 2 }}
        />
      )}

      {showDropArrows && dropZoneRect && (
        <DragEdgeArrows
          direction="down"
          at={{
            x: dropZoneRect.left + dropZoneRect.width / 2,
            y: dropZoneRect.top,
          }}
        />
      )}

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
                : 'ring-primary shadow-[0_0_18px_5px_hsl(var(--primary)/0.35)] dark:shadow-[0_0_22px_6px_hsl(var(--primary)/0.45)]'
            }`}
          />
        </div>
        ))}

      {showCoachBar && (
        <motion.div
          animate={shake}
          className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+176px)] z-[2002] flex justify-center px-4 md:bottom-[calc(env(safe-area-inset-bottom)+124px)]"
        >
          <motion.div
            layout
            className="pointer-events-auto w-full max-w-sm rounded-2xl border border-primary/35 bg-card px-4 py-3 shadow-xl dark:border-primary/50 dark:shadow-[0_18px_44px_-16px_rgba(0,0,0,0.95)]"
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
        </motion.div>
      )}
    </>,
    document.body,
  );
}
