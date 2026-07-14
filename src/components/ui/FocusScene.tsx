'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import Fly from '@/components/ui/fly';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { useFrogTongue, TONGUE_STROKE } from '@/hooks/useFrogTongue';
import { DriftFly, FOCUS_DRIFTS } from '@/components/ui/FocusFlyLayer';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { sceneFlyCount } from '@/lib/focusFlies';
import { pickFrogLine } from '@/lib/frogSpeech';
import type { WardrobeSlot } from '@/lib/skins/catalog';

const FLY_PX = 34;

// Respawn/start entry: glide in from whichever screen edge is nearer to the
// fly's anchor, starting fully outside the card.
export function entrySideFor(drift: (typeof FOCUS_DRIFTS)[number]): number {
  const leftPct = parseFloat(String(drift.anchor.left));
  return leftPct < 50 ? -420 : 420;
}

/**
 * The live session scene: the user's frog perched on the PAUSE button while
 * flies drift around the card. The swarm grows with focused minutes. The frog
 * hunts with its real tongue: on a loose rhythm it lunges, aims just past a
 * fly, and comes back empty — the miss. Only when `caught` increments (one
 * per 5 focused minutes, mirroring the fly the server credited) does the
 * tongue actually land: fly snatched, love emote, "+1" pop.
 */
export function FocusScene({
  indices,
  running,
  showFlies,
  caught,
  focusSeconds = 0,
  frogWidth = 144,
  counterRef,
  onGainLand,
  suspended = false,
}: {
  indices?: Partial<Record<WardrobeSlot, number>>;
  running: boolean;
  showFlies: boolean;
  caught: number;
  focusSeconds?: number;
  frogWidth?: number;
  /** The caught-count chip a snatched fly flies into (currency-gain style). */
  counterRef?: React.RefObject<HTMLElement | null>;
  onGainLand?: () => void;
  /** An overlay is covering the scene (stop-confirm etc.) — no tongue fires;
   *  a real catch still rewards via the no-tongue fallback. */
  suspended?: boolean;
}) {
  const frogRef = useRef<FrogHandle | null>(null);
  const frogBoxRef = useRef<HTMLDivElement | null>(null);
  const flyRefs = useRef<Record<string, HTMLElement | null>>({});
  const [missMode, setMissMode] = useState(false);
  const [missPos, setMissPos] = useState<{ x: number; y: number } | null>(null);
  const [eaten, setEaten] = useState<Set<string>>(new Set());
  const [respawn, setRespawn] = useState<Record<string, number>>({});
  const [gain, setGain] = useState<{
    id: number;
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
  const [speech, setSpeech] = useState<string | null>(null);
  const speechTimerRef = useRef(0);
  const prevCaughtRef = useRef(caught);

  const speakLine = useCallback((line: string) => {
    setSpeech(line);
    window.clearTimeout(speechTimerRef.current);
    speechTimerRef.current = window.setTimeout(() => setSpeech(null), 4000);
  }, []);
  useEffect(() => () => window.clearTimeout(speechTimerRef.current), []);

  const launchGain = useCallback(() => {
    const rect = counterRef?.current?.getBoundingClientRect();
    if (!rect) return;
    const from =
      frogRef.current?.getMouthPoint() ??
      (() => {
        const box = frogBoxRef.current?.getBoundingClientRect();
        return box
          ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
          : null;
      })();
    if (!from) return;
    setGain({
      id: Date.now(),
      from,
      to: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    });
  }, [counterRef]);

  const { grab, vp, tonguePathEl, tipGroupEl, triggerTongue, visuallyDone } =
    useFrogTongue({
      frogRef,
      frogBoxRef,
      flyRefs,
      durationMs: 950,
    });

  const flyCount = sceneFlyCount(focusSeconds);

  const pickLiveIndex = useCallback(() => {
    const live: number[] = [];
    for (let i = 0; i < flyCount; i++) {
      const key = `scene-fly-${i}`;
      if (!eaten.has(key) && flyRefs.current[key]) live.push(i);
    }
    if (live.length === 0) return -1;
    return live[Math.floor(Math.random() * live.length)];
  }, [flyCount, eaten]);

  // Eat + respawn: hide the caught fly, then after a beat bump its epoch so
  // it remounts gliding in from off-screen (welcome-page style entry).
  const eatAndRespawn = useCallback((key: string) => {
    setEaten((prev) => new Set(prev).add(key));
    window.setTimeout(() => {
      setRespawn((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
      setEaten((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 4000);
  }, []);

  // Real catch: the tongue lands on an actual fly. The hook fires the love
  // emote at the end.
  useEffect(() => {
    if (caught <= prevCaughtRef.current) {
      prevCaughtRef.current = caught;
      return;
    }
    const caughtNow = caught;
    prevCaughtRef.current = caught;
    const index = pickLiveIndex();
    const line = pickFrogLine('catch', { done: caughtNow });
    speakLine(line);
    if (index < 0 || suspended) {
      frogRef.current?.fireEmote('love');
      launchGain();
      return;
    }
    const key = `scene-fly-${index}`;
    setMissMode(false);
    void triggerTongue({
      key,
      completed: false,
      onPersist: () => {
        launchGain();
        eatAndRespawn(key);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caught]);

  // Failed hunts: the tongue aims a bit past a fly — away from the frog —
  // and returns empty. First one early (teaches the mechanic once), then a
  // loose 45–90s rhythm: personality actions read as scripted when they
  // repeat often, and a focus surface must stay glanceable, not busy.
  useEffect(() => {
    if (!running || !showFlies || suspended) return;
    let timer = 0;
    const attempt = () => {
      const index = pickLiveIndex();
      const key = index >= 0 ? `scene-fly-${index}` : null;
      const el = key ? flyRefs.current[key] : null;
      const mouth = frogRef.current?.getMouthPoint();
      if (index < 0 || !el || !mouth) return;
      const overshoot = 44 + Math.random() * 26;
      const jitterX = Math.random() * 28 - 14;
      const rect = el.getBoundingClientRect();
      const fx = rect.left + rect.width / 2;
      const fy = rect.top + rect.height / 2;
      const dx = fx - mouth.x;
      const dy = fy - mouth.y;
      const len = Math.hypot(dx, dy) || 1;
      setMissPos({
        x: fx + (dx / len) * overshoot + jitterX,
        y: fy + (dy / len) * overshoot,
      });
      setMissMode(true);
      requestAnimationFrame(() => {
        void triggerTongue({
          key: 'scene-miss',
          completed: false,
          silent: true,
          onPersist: () => setMissMode(false),
        });
      });
    };
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        attempt();
        schedule(45000 + Math.random() * 45000);
      }, delay);
    };
    schedule(9000 + Math.random() * 5000);
    return () => window.clearTimeout(timer);
  }, [running, showFlies, suspended, pickLiveIndex, triggerTongue]);

  return (
    <div className="relative flex flex-col items-center">
      {/* Ambient flies — an absolute band above the frog */}
      {showFlies && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 inset-x-0 h-32"
        >
          {FOCUS_DRIFTS.slice(0, flyCount).map((drift, i) => {
            const key = `scene-fly-${i}`;
            const hidden = eaten.has(key) || visuallyDone.has(key);
            const epoch = respawn[key] ?? 0;
            return (
              <DriftFly
                key={`${key}-${epoch}`}
                drift={drift}
                running={running}
                hidden={hidden}
                alwaysPlay
                entryFromX={entrySideFor(drift)}
                forceEntry={epoch > 0}
                flyRef={(el) => {
                  flyRefs.current[key] = el;
                }}
              />
            );
          })}
        </div>
      )}


      {/* Invisible aim point for missed grabs — just past the fly, away from
          the frog. Portaled to body: the sheet's transformed container would
          re-anchor position:fixed and put it in the wrong spot. */}
      {missPos &&
        createPortal(
          <span
            ref={(el) => {
              flyRefs.current['scene-miss'] = el;
            }}
            aria-hidden
            style={{
              position: 'fixed',
              left: missPos.x,
              top: missPos.y,
              width: 1,
              height: 1,
              pointerEvents: 'none',
            }}
          />,
          document.body,
        )}

      {/* A caught fly arcs from the mouth into the caught-count chip — the
          same gain language as the home currency counter. Portaled: viewport
          coordinates. */}
      {gain &&
        createPortal(
          <motion.span
            key={gain.id}
            className="pointer-events-none fixed left-0 top-0 z-[1150]"
            initial={{ x: gain.from.x - 13, y: gain.from.y - 13, scale: 0.95, opacity: 1 }}
            animate={{ x: gain.to.x - 13, y: gain.to.y - 13, scale: 0.5, opacity: 1 }}
            transition={{ duration: 0.55, ease: [0.35, 0, 0.55, 1] }}
            onAnimationComplete={() => {
              setGain(null);
              onGainLand?.();
            }}
          >
            <Fly size={30} interactive={false} alwaysPlay />
          </motion.span>,
          document.body,
        )}

      {/* The frog, perched on the button below it (FrogOnDeck-style overlap) —
          pointer-events off so nothing blocks taps */}
      {/* Negative top margin swallows the transparent headroom of the frog
          canvas (contain-fit leaves ~40% dead space above the art), so the
          card doesn't grow taller than the visible frog. */}
      <div
        ref={frogBoxRef}
        className="pointer-events-none relative z-30"
        style={{
          marginTop: -Math.round(frogWidth * 0.42),
          marginBottom: -6,
        }}
      >
        {/* Catch speech — same bubble, same in-frog-container placement as
            the home frog (FrogDisplay), so it can't be buried by the card's
            stacking. */}
        {speech && (
          <FrogSpeechBubble
            rate={0}
            done={0}
            total={0}
            fixedMessage={speech}
            className="!top-2"
          />
        )}
        <Frog
          ref={frogRef}
          width={frogWidth}
          height={Math.round(frogWidth * 1.125)}
          indices={indices}
          ignoreIdlePause
          mouthOpen={!!grab}
          mouthOffset={{
            x: Math.round(-18 * (frogWidth / 240)),
            y: Math.round(12 * (frogWidth / 240)),
          }}
        />
      </div>

      {/* SVG tongue overlay — same mechanic as the welcome-page grab.
          Portaled to body so the sheet's transformed container can't clip or
          re-anchor the fixed overlay. */}
      {grab &&
        createPortal(
          <svg
            key={grab.startAt}
            className="pointer-events-none fixed inset-0 z-[1100]"
            width={vp.w}
            height={vp.h}
            viewBox={`0 0 ${vp.w} ${vp.h}`}
            preserveAspectRatio="none"
            style={{ width: vp.w, height: vp.h }}
          >
            <defs>
              <linearGradient id="focus-tongue-grad" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#ff6b6b" />
                <stop offset="1" stopColor="#f43f5e" />
              </linearGradient>
            </defs>
            <path
              ref={tonguePathEl}
              d="M0 0 L0 0"
              fill="none"
              stroke="url(#focus-tongue-grad)"
              strokeWidth={TONGUE_STROKE}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <g ref={tipGroupEl} style={{ visibility: 'hidden' }}>
              <circle r={10} fill="transparent" />
              {!missMode && (
                <image
                  href="/fly.svg"
                  x={-FLY_PX / 2}
                  y={-FLY_PX / 2}
                  width={FLY_PX}
                  height={FLY_PX}
                />
              )}
            </g>
          </svg>,
          document.body,
        )}
    </div>
  );
}
