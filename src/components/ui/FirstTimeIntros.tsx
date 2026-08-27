'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  animate,
  useMotionValue,
} from 'framer-motion';
import { Check, Clock, Plus } from 'lucide-react';
import { Icon as AppIcon } from '@/components/ui/Icon';
import { BaseSheet } from '@/components/ui/BaseSheet';
import Fly from '@/components/ui/fly';
import { cn } from '@/lib/utils';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import {
  HUNGER_SEGMENTS,
  getHungerState,
  segmentFill,
} from '@/lib/hungerDisplay';
import {
  FLIES_PER_PENALTY,
  MAX_HUNGER_MS,
  TASK_HUNGER_REWARD_MS,
} from '@/lib/hungerLogic';
import Frog, {
  FROG_TONGUE_MOUTH_OFFSET,
  type FrogHandle,
} from '@/components/ui/frog';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';

// Above the notification stack (z-1300): a one-time explainer must never be
// covered by a toast — an undo prompt was landing on top of the belly intro.
const INTRO_Z = 1310;
const INTRO_TONGUE_Z = INTRO_Z + 10;

function IntroShell({
  open,
  onClose,
  zIndex = INTRO_Z,
  scrollRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  zIndex?: number;
  /** The scroll container the tongue needs, to place its origin correctly. */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      zIndex={zIndex}
      className="md:max-w-md"
    >
      {() => (
        <div
          ref={scrollRef}
          className="max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2"
        >
          {children}
        </div>
      )}
    </BaseSheet>
  );
}

function IntroCta({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-[15px] font-black text-primary-foreground shadow-[0_4px_0_0_#34631f] transition-all hover:brightness-105 active:translate-y-[2px] active:shadow-none"
    >
      {label}
    </button>
  );
}

// The user's dressed frog perched on the first row card, fly at its shoulder
// — the shared visual signature of these one-time explainers.
function FrogPerch({ open }: { open: boolean }) {
  const { indices } = useWardrobeIndices(open);
  return (
    <div className="pointer-events-none relative z-10 -mb-[12px] -mt-3 flex justify-center">
      <div className="relative translate-y-[20px]">
        <Frog
          width={132}
          height={148}
          indices={indices}
          paused={!open}
          visualOffsetY={0}
        />
        <span className="absolute -left-7 top-9 animate-[fly-bob_2.2s_ease-in-out_infinite] motion-reduce:animate-none">
          <Fly size={34} alwaysPlay interactive={false} oversample={1.5} />
        </span>
      </div>
    </div>
  );
}

function IntroRows({
  rows,
  activeIndex = -1,
}: {
  rows: { icon: React.ReactNode; text: React.ReactNode }[];
  /** Highlights the row the stage above is currently acting out. */
  activeIndex?: number;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(({ icon, text }, index) => {
        const active = index === activeIndex;
        return (
          <motion.div
            key={index}
            animate={{ scale: active ? 1.015 : 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className={cn(
              'flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 transition-colors duration-300',
              active
                ? 'border-primary/50 bg-primary/10'
                : 'border-border/50 bg-muted/30',
              activeIndex >= 0 && !active && 'opacity-55',
            )}
          >
            <span
              className={cn(
                'grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors duration-300',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/10 text-primary',
              )}
            >
              {icon}
            </span>
            <p className="text-[13px] font-semibold leading-snug text-foreground [&>b]:font-black">
              {text}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}

const PIP_PERCENT = 100 / HUNGER_SEGMENTS;
/** One task's meal: the bar sits one pip short, so feeding lands it exactly on full. */
const DEMO_START_PERCENT = PIP_PERCENT * (HUNGER_SEGMENTS - 1);

const DEMO_BEATS = [
  // Long enough to wait out the grab, the bar filling, and then a real beat of
  // sitting at Full before the drain starts.
  { id: 'feed', holdMs: 4400 },
  { id: 'drain', holdMs: 3400 },
  { id: 'steal', holdMs: 3000 },
] as const;

/** The six belly pips, driven by a live value instead of the real belly. */
function DemoBellyBar({ percent }: { percent: number }) {
  const { bg, text, label } = getHungerState(percent);
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex flex-1 items-center gap-1.5" aria-hidden>
        {Array.from({ length: HUNGER_SEGMENTS }).map((_, i) => (
          <div
            key={i}
            className="relative flex-1 h-3 overflow-hidden rounded-full bg-foreground/10"
          >
            <div
              className={cn('absolute inset-y-0 left-0 rounded-full', bg)}
              style={{ width: `${segmentFill(percent, i) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <span
        className={cn(
          'w-[5.5rem] shrink-0 whitespace-nowrap text-right text-[12px] font-black',
          text,
        )}
      >
        {label}
      </span>
    </div>
  );
}

const BELLY_FLY_KEY = 'belly-intro-fly';
const BELLY_FLY_PX = 40;

/** The home frog's size, which is also what FROG_TONGUE_MOUTH_OFFSET is tuned for. */
const FROG_W = 240;
const FROG_H = Math.round((FROG_W * 144) / 128);
/**
 * The canvas is translated down by 17% of its height, so the art hangs that far
 * below the box. Pushing the bar down by the same amount (less a few pixels of
 * overlap) is what lands the frog *on* the bar instead of behind it.
 */
const FROG_VISUAL_OFFSET = Math.round(FROG_H * 0.17);
/** How far the frog's feet sink past the bar's top edge. Raise to seat it lower. */
const FROG_BAR_OVERLAP = 57;
const FROG_BAR_GAP = FROG_VISUAL_OFFSET - FROG_BAR_OVERLAP;
/** The art only starts ~77% down the box; the rest is the fly's airspace. */
const FROG_DEAD_SPACE = Math.round(FROG_H * 0.28);
const FLY_HOVER_TOP = Math.round(FROG_H * 0.22);

/**
 * The focus timer's drift choreography (FOCUS_DRIFTS): a slow, wide six-point
 * wander that dips toward the frog once per loop and returns to its anchor, so
 * the repeat is seamless. Far calmer than a tight buzz, and it gives
 * `trackMovingTarget` something worth tracking.
 */
const BELLY_FLY_BUZZ = {
  x: [0, 58, 22, 92, -46, -74, 0],
  y: [0, -16, 22, -30, 14, -22, 0],
  rotate: [0, 7, -6, 9, -7, 5, 0],
  transition: { duration: 14, ease: 'easeInOut', repeat: Infinity },
} as const;

/**
 * The belly rule acted out instead of listed, as one unbroken loop: the frog
 * tongues a fly in and the bar gains a pip, two days drain it, and an empty
 * belly spits that same fly back out to be caught again next time round.
 *
 * The catch runs on the real `useFrogTongue` — same curve, gulp, haptics and
 * squash as the welcome page and the task list, and `trackMovingTarget` keeps
 * it locked on the fly while it drifts.
 */
function BellyStage({
  open,
  beat,
  cycle,
  scrollRef,
}: {
  open: boolean;
  beat: number;
  /** Which time round the loop this is; the first pass waits longer. */
  cycle: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const firstRun = cycle === 0;
  const { indices } = useWardrobeIndices(open);
  const reduceMotion = useReducedMotion();
  const frogRef = useRef<FrogHandle>(null);
  const frogBoxRef = useRef<HTMLDivElement>(null);
  const flyRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const {
    vp,
    grab,
    tipGroupEl,
    tonguePathEl,
    worldGroupEl,
    fxGroupEl,
    triggerTongue,
    visuallyDone,
  } = useFrogTongue({
    frogRef,
    frogBoxRef,
    flyRefs,
    scrollContainerRef: scrollRef,
    trackMovingTarget: true,
    allowCameraFollow: false,
    durationMs: 1040,
    keepTargetHiddenUntilPersist: true,
  });

  const value = useMotionValue(DEMO_START_PERCENT);
  const [percent, setPercent] = useState(DEMO_START_PERCENT);
  useEffect(
    () => value.on('change', (v) => setPercent(Math.round(v))),
    [value],
  );

  const [flyOut, setFlyOut] = useState(true);
  const [emerging, setEmerging] = useState(false);
  const [showCost, setShowCost] = useState(false);

  // `triggerTongue` re-identifies as soon as a grab starts (it closes over
  // `grab`), so keeping it in the effect deps restarted the beat mid-flight and
  // fired a second tongue at the already-hidden fly.
  const triggerRef = useRef(triggerTongue);
  triggerRef.current = triggerTongue;
  const firedForBeat = useRef(-1);

  useEffect(() => {
    if (!open) return;
    setShowCost(false);

    if (reduceMotion) {
      value.set(beat === 0 ? 100 : beat === 1 ? PIP_PERCENT : 0);
      setFlyOut(beat !== 1);
      setEmerging(false);
      setShowCost(beat === 2);
      return;
    }

    let cancelled = false;

    if (beat === 1) {
      setFlyOut(false);
      setEmerging(false);
      value.set(100);
      const controls = animate(value, 0, { duration: 3, ease: 'linear' });
      return () => {
        cancelled = true;
        controls.stop();
      };
    }

    if (beat === 2) {
      value.set(0);
      // The fly the frog helps itself to leaves the mouth and stays out, so
      // beat one has something real to catch when the loop comes round.
      const timer = window.setTimeout(() => {
        if (cancelled) return;
        setEmerging(true);
        setFlyOut(true);
        window.setTimeout(() => !cancelled && setShowCost(true), 420);
      }, 480);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    // Beat 0 — the tongue grab. The first pass waits noticeably longer: the
    // sheet has just opened and the tongue is the one thing here nobody has
    // seen before, so it should not fire while the user is still arriving.
    value.set(DEMO_START_PERCENT);
    setFlyOut(true);
    setEmerging(false);
    const timer = window.setTimeout(
      () => {
        if (cancelled || firedForBeat.current === cycle) return;
        firedForBeat.current = cycle;
        void triggerRef.current({
          key: BELLY_FLY_KEY,
          completed: false,
          onPersist: () => {
            if (cancelled) return;
            setFlyOut(false);
            animate(value, 100, {
              duration: 0.5,
              ease: [0.22, 1, 0.36, 1],
            });
          },
        });
      },
      firstRun ? 1900 : 1150,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, beat, cycle, reduceMotion, value]);

  const hungry = percent <= 20;
  const frogIndices = useMemo(
    () => ({ ...indices, mood: hungry ? 1 : 0 }),
    [indices, hungry],
  );

  const flyVisible = flyOut && !visuallyDone.has(BELLY_FLY_KEY);

  return (
    <div className="relative mt-1 select-none">
      <div className="relative flex justify-center">
        {flyVisible && (
          <motion.div
            className="absolute z-20 -translate-x-1/2 pointer-events-none left-1/2"
            style={{ top: FLY_HOVER_TOP }}
            initial={
              emerging ? { y: FROG_H * 0.42, opacity: 0, scale: 0.6 } : false
            }
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              animate={reduceMotion ? undefined : (BELLY_FLY_BUZZ as any)}
              className="relative"
            >
              <div
                ref={(el) => {
                  flyRefs.current[BELLY_FLY_KEY] = el;
                }}
              >
                <Fly
                  size={BELLY_FLY_PX}
                  alwaysPlay
                  interactive={false}
                  oversample={1.5}
                />
              </div>
              <AnimatePresence>
                {showCost && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 20 }}
                    className="absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-black tabular-nums leading-none text-rose-500"
                  >
                    −{FLIES_PER_PENALTY} a day
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}

        <div
          ref={frogBoxRef}
          className="relative z-10"
          style={{ marginTop: -FROG_DEAD_SPACE, marginBottom: FROG_BAR_GAP }}
        >
          <Frog
            ref={frogRef}
            width={FROG_W}
            height={FROG_H}
            indices={frogIndices}
            paused={!open}
            mouthOpen={!!grab}
            mouthOffset={FROG_TONGUE_MOUTH_OFFSET}
          />
        </div>
      </div>

      <div className="relative z-0 rounded-2xl border border-border/50 bg-muted/30 px-3.5 py-3">
        <DemoBellyBar percent={percent} />
      </div>

      {/* Portalled to the body on purpose: BaseSheet's panel is a transformed
          motion.div, and a transformed ancestor becomes the containing block
          for `fixed` children — inside it the tongue would be laid out in panel
          space while the hook paints in viewport space. */}
      {grab &&
        createPortal(
          <svg
            key={grab.startAt}
            aria-hidden
            className="fixed inset-0 pointer-events-none"
            style={{ width: vp.w, height: vp.h, zIndex: INTRO_TONGUE_Z }}
            width={vp.w}
            height={vp.h}
            viewBox={`0 0 ${vp.w} ${vp.h}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient
                id="belly-tongue-grad"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop stopColor="#ff6b6b" />
                <stop offset="1" stopColor="#f43f5e" />
              </linearGradient>
            </defs>

            <g ref={worldGroupEl}>
              <path
                ref={tonguePathEl}
                d="M0 0 L0 0"
                fill="none"
                stroke="url(#belly-tongue-grad)"
                strokeWidth={TONGUE_STROKE}
                strokeLinecap="round"
              />

              <g ref={fxGroupEl} />

              <g ref={tipGroupEl} style={{ visibility: 'hidden' }}>
                <circle r={10} fill="transparent" />
                <image
                  href="/fly.svg"
                  x={-BELLY_FLY_PX / 2}
                  y={-BELLY_FLY_PX / 2}
                  width={BELLY_FLY_PX}
                  height={BELLY_FLY_PX}
                />
              </g>
            </g>
          </svg>,
          document.body,
        )}
    </div>
  );
}
const HUNGER_HOURS_PER_TASK = Math.round(TASK_HUNGER_REWARD_MS / 3_600_000);
const FULL_BELLY_DAYS = Math.round(MAX_HUNGER_MS / 86_400_000);

export function BellyFullIntroSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Same voice as the frog's notifications (frogVoice.ts): first person,
  // real numbers only, dry but not mean.
  const rows = [
    {
      icon: <Check className="w-5 h-5" strokeWidth={2.75} />,
      text: (
        <>
          <b>1 task</b> feeds me for {HUNGER_HOURS_PER_TASK} hours
        </>
      ),
    },
    {
      icon: <Clock className="w-5 h-5" strokeWidth={2.5} />,
      text: (
        <>
          Full to empty takes <b>{FULL_BELLY_DAYS} days</b>
        </>
      ),
    },
    {
      icon: <Fly size={24} alwaysPlay interactive={false} oversample={1.5} />,
      text: (
        <>
          Empty belly? I help myself —{' '}
          <b>
            {FLIES_PER_PENALTY} {FLIES_PER_PENALTY === 1 ? 'fly' : 'flies'} a
            day
          </b>{' '}
          from your stash
        </>
      ),
    },
  ];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [beat, setBeat] = useState(0);
  const [cycle, setCycle] = useState(0);
  // The opening beat holds longer the first time round, to cover the extra
  // pause the stage takes before the very first tongue grab.
  const firstRun = cycle === 0;
  useEffect(() => {
    if (!open) {
      setBeat(0);
      setCycle(0);
      return;
    }
    const extra = firstRun && beat === 0 ? 1200 : 0;
    const timer = window.setTimeout(() => {
      setBeat((b) => {
        const next = (b + 1) % DEMO_BEATS.length;
        if (next === 0) setCycle((c) => c + 1);
        return next;
      });
    }, DEMO_BEATS[beat].holdMs + extra);
    return () => window.clearTimeout(timer);
  }, [open, beat, firstRun]);

  return (
    <IntroShell open={open} onClose={onClose} scrollRef={scrollRef}>
      <h2 className="mt-2 text-xl font-black text-center text-foreground">
        Full belly. Happy me.
      </h2>
      <BellyStage open={open} beat={beat} cycle={cycle} scrollRef={scrollRef} />
      <div className="mt-3">
        <IntroRows rows={rows} activeIndex={beat} />
      </div>
      <IntroCta label="Got it" onClick={onClose} />
    </IntroShell>
  );
}

export function SavedTaskIntroSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const rows = [
    {
      icon: <AppIcon name="planner" label="Planner" className="w-6 h-6" />,
      text: (
        <>
          It’s waiting in <b>Saved Tasks</b> on the Planner — drag it onto any
          day
        </>
      ),
    },
    {
      icon: <Plus className="w-5 h-5" strokeWidth={2.75} />,
      text: (
        <>
          Or grab it while <b>adding a task</b> — your saved ones are right
          there
        </>
      ),
    },
  ];
  return (
    <IntroShell open={open} onClose={onClose}>
      <h2 className="mt-2 text-xl font-black text-center text-foreground">
        Saved. Not forgotten.
      </h2>
      <FrogPerch open={open} />
      <IntroRows rows={rows} />
      <IntroCta label="Got it" onClick={onClose} />
    </IntroShell>
  );
}
