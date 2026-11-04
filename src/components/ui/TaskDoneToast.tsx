'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Flame, Heart, PartyPopper, Sparkles, Star } from 'lucide-react';
import Frog, { type FrogHandle } from '@/components/ui/frog';
import { useToastHold } from '@/components/providers/NotificationProvider';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { hapticCelebrate } from '@/lib/haptics';
import { pickEmote, type FrogEmote } from '@/lib/frogEmotes';
import { getFrogFile, preloadFrogFile } from '@/lib/riveLoader';
import type { DoneBadge, DoneMoment, DoneMomentKind } from '@/lib/taskDoneMoments';

const FRAME_WIDTH = 60;
const FRAME_HEIGHT = 48;
const FROG_BOX_WIDTH = 96;
const FROG_BOX_HEIGHT = 108;
const FROG_SEAT = -4;
const FROG_POP_FROM = 0.6;
const FROG_PEEK_FROM = 6;
const FROG_WAIT_MAX_MS = 1200;
const CONFETTI_DELAY_MS = 200;
const CONFETTI_Z = 1310;
export const DONE_TOAST_MS = 5600;
export const DONE_TOAST_CELEBRATION_MS = 7600;

const CONFETTI_COLORS = ['#7ccf5a', '#4f9a45', '#fcd34d', '#fb923c', '#f472b6', '#60a5fa', '#a78bfa'];

const FROG_PRELOAD_DELAY_MS = 2000;
const FROG_PRELOAD_IDLE_TIMEOUT_MS = 4000;

const firedMoments = new Set<string>();

export function usePreloadDoneToastFrog(enabled: boolean) {
  useEffect(() => {
    if (!enabled || getFrogFile()) return;
    let idleId: number | null = null;
    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(() => void preloadFrogFile(), {
          timeout: FROG_PRELOAD_IDLE_TIMEOUT_MS,
        });
      } else {
        void preloadFrogFile();
      }
    }, FROG_PRELOAD_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      if (idleId !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [enabled]);
}

function emoteFor(kind: DoneMomentKind): FrogEmote {
  switch (kind) {
    case 'day_cleared':
      return pickEmote('dayCleared');
    case 'streak_milestone':
    case 'count_milestone':
    case 'tag_cleared':
    case 'first_ever':
      return pickEmote('milestone');
    case 'comeback':
      return pickEmote('welcomeBack');
    case 'streak':
      return pickEmote('cheer');
    default:
      return pickEmote('taskDone');
  }
}

const CONFETTI_LAYERS: {
  share: number;
  spread: number;
  speed: number;
  decay?: number;
  scalar?: number;
}[] = [
  { share: 0.25, spread: 26, speed: 1.2 },
  { share: 0.2, spread: 60, speed: 1 },
  { share: 0.35, spread: 100, speed: 1, decay: 0.91, scalar: 0.8 },
  { share: 0.1, spread: 120, speed: 0.55, decay: 0.92, scalar: 1.2 },
  { share: 0.1, spread: 120, speed: 1 },
];
const CONFETTI_COUNT = { burst: 26, shower: 46 };
const CONFETTI_SPEED = { burst: 20, shower: 23 };
const CONFETTI_SCALAR = 1.4;
const CONFETTI_TUCK_PX = 18;

let confettiCanvas: HTMLCanvasElement | null = null;
let launchConfetti: confetti.CreateTypes | null = null;

function confettiLauncher(): confetti.CreateTypes {
  if (!confettiCanvas || !confettiCanvas.isConnected || !launchConfetti) {
    confettiCanvas = document.createElement('canvas');
    confettiCanvas.setAttribute('aria-hidden', 'true');
    Object.assign(confettiCanvas.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: String(CONFETTI_Z),
    });
    document.body.appendChild(confettiCanvas);
    launchConfetti = confetti.create(confettiCanvas, { resize: true, disableForReducedMotion: true });
  }
  return launchConfetti;
}

function bottomNavTop(): number | null {
  const nav = document.querySelector<HTMLElement>('[data-app-bottom-nav]');
  if (!nav || nav.offsetHeight === 0) return null;
  const rect = nav.getBoundingClientRect();
  return rect.top < window.innerHeight ? rect.top : null;
}

function fireConfetti(moment: DoneMoment, row: DOMRect | null) {
  const vh = window.innerHeight;
  const launch = confettiLauncher();
  const navTop = bottomNavTop();
  if (confettiCanvas) {
    confettiCanvas.style.clipPath = navTop === null ? '' : `inset(0 0 ${Math.max(0, vh - navTop)}px 0)`;
  }
  const kind = moment.confetti === 'shower' ? 'shower' : 'burst';
  const origin = {
    x: row ? (row.left + row.width / 2) / window.innerWidth : 0.5,
    y: navTop === null ? 1 + CONFETTI_TUCK_PX / vh : (navTop + CONFETTI_TUCK_PX) / vh,
  };
  const colors = moment.tag ? [moment.tag.color, ...CONFETTI_COLORS] : CONFETTI_COLORS;
  CONFETTI_LAYERS.forEach((layer) => {
    void launch({
      colors,
      shapes: ['square'],
      gravity: 1.3,
      ticks: 160,
      origin,
      particleCount: Math.max(1, Math.round(CONFETTI_COUNT[kind] * layer.share)),
      spread: layer.spread,
      startVelocity: CONFETTI_SPEED[kind] * layer.speed,
      decay: layer.decay ?? 0.9,
      scalar: CONFETTI_SCALAR * (layer.scalar ?? 1),
    });
  });
}

function BadgeIcon({ badge, tagColor }: { badge: DoneBadge; tagColor?: string }) {
  switch (badge) {
    case 'flame':
      return <Flame className="h-3.5 w-3.5 shrink-0 text-orange-400" fill="currentColor" strokeWidth={0} />;
    case 'sparkle':
      return <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" fill="currentColor" strokeWidth={1.5} />;
    case 'party':
      return <PartyPopper className="h-3.5 w-3.5 shrink-0 text-amber-300" strokeWidth={2.5} />;
    case 'heart':
      return <Heart className="h-3.5 w-3.5 shrink-0 text-rose-400" fill="currentColor" strokeWidth={0} />;
    case 'star':
      return <Star className="h-3.5 w-3.5 shrink-0 text-amber-300" fill="currentColor" strokeWidth={0} />;
    case 'tag':
      return (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/25"
          style={{ backgroundColor: tagColor ?? '#4f9a45' }}
        />
      );
    default:
      return null;
  }
}

function DetailText({ moment }: { moment: DoneMoment }) {
  if (!moment.tag || moment.detail.indexOf('{tag}') === -1) return <>{moment.detail}</>;
  const [before, after] = moment.detail.split('{tag}');
  return (
    <>
      {before}
      <span className="font-black text-foreground">{moment.tag.name}</span>
      {after}
    </>
  );
}

export function TaskDoneToast({
  moment,
  frogEnabled,
}: {
  moment: DoneMoment;
  frogEnabled: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const { indices } = useWardrobeIndices(frogEnabled);
  const rowRef = useRef<HTMLDivElement>(null);
  const frogRef = useRef<FrogHandle>(null);
  const [emote] = useState(() => emoteFor(moment.kind));
  const [sharedFile] = useState(() => getFrogFile());
  const [dressed, setDressed] = useState(false);
  const hold = useToastHold();

  useEffect(() => {
    if (!hold) return;
    hold(true);
    const timer = window.setTimeout(() => hold(false), FROG_WAIT_MAX_MS);
    return () => {
      window.clearTimeout(timer);
      hold(false);
    };
  }, [hold]);

  const handleDressed = () => {
    setDressed(true);
    hold?.(false);
    frogRef.current?.fireEmote(emote);
  };

  useEffect(() => {
    if (!moment.confetti || firedMoments.has(moment.id)) return;
    const timer = window.setTimeout(() => {
      if (firedMoments.has(moment.id)) return;
      if (firedMoments.size > 40) firedMoments.clear();
      firedMoments.add(moment.id);
      hapticCelebrate();
      if (reduceMotion) return;
      fireConfetti(
        moment,
        rowRef.current?.getBoundingClientRect() ?? null,
      );
    }, CONFETTI_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [moment, reduceMotion]);

  return (
    <div ref={rowRef} className="flex w-full min-w-0 items-center gap-3">
      <div
        aria-hidden
        className="pointer-events-none relative shrink-0"
        style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT }}
      >
        <motion.div
          className="absolute"
          style={{
            left: (FRAME_WIDTH - FROG_BOX_WIDTH) / 2,
            bottom: FROG_SEAT,
            width: FROG_BOX_WIDTH,
            height: FROG_BOX_HEIGHT,
            transformOrigin: '50% 90%',
          }}
          initial={false}
          animate={
            reduceMotion || dressed
              ? { scale: 1, y: 0 }
              : { scale: FROG_POP_FROM, y: FROG_PEEK_FROM }
          }
          transition={{ type: 'spring', stiffness: 640, damping: 17 }}
        >
          <Frog
            ref={frogRef}
            riveFile={sharedFile}
            width={FROG_BOX_WIDTH}
            height={FROG_BOX_HEIGHT}
            indices={indices}
            pokeable={false}
            onDressed={handleDressed}
          />
        </motion.div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[14px] font-black text-foreground">{moment.title}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[13px] font-bold text-muted-foreground">
          {moment.badge && (
            <motion.span
              className="grid shrink-0 place-items-center"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0, rotate: -30 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0.2, delay: 0.2 }
                  : { type: 'spring', stiffness: 600, damping: 13, delay: 0.22 }
              }
            >
              <BadgeIcon badge={moment.badge} tagColor={moment.tag?.color} />
            </motion.span>
          )}
          <span className="min-w-0 truncate">
            <DetailText moment={moment} />
          </span>
        </span>
      </div>
    </div>
  );
}
