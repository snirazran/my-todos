'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Dices } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { FrogSpeechBubble } from '@/components/ui/FrogSpeechBubble';
import { STARTER_SKINS, findStarterSkin, type StarterSkinKey } from '@/lib/skins/starterSkins';
import {
  hapticCelebrate,
  hapticHeavy,
  hapticImpact,
  hapticSelect,
  hapticSuccess,
  hapticTick,
} from '@/lib/haptics';
import { pickEmote, type FrogEmote } from '@/lib/frogEmotes';
import type { OnboardingStepProps } from './types';
import {
  ONBOARDING_SUBTITLE_CLASS,
  ONBOARDING_TITLE_CLASS,
  OnboardingProgressDock,
  type FrogPose,
} from './OnboardingFrogHeader';
import { OnboardingButton, useOnboardingKeyboardInset } from './OnboardingFooter';

const NAME_OPTIONS = [
  'Cookie',
  'Lily',
  'Pickle',
  'Mochi',
  'Sunny',
  'Jelly',
  'Bubbles',
  'Clover',
  'Pebble',
  'Sprout',
  'Waffles',
  'Pip',
  'Noodle',
  'Kiwi',
  'Miso',
  'Bean',
  'Pudding',
  'Poppy',
  'Basil',
  'Tofu',
  'Ziggy',
  'Minty',
  'Dumpling',
  'Freckles',
  'Gummy',
  'Olive',
  'Button',
  'Pickles',
  'Marshmallow',
  'Tadpole',
];

const getRandomName = (currentName?: string) => {
  const availableNames = currentName
    ? NAME_OPTIONS.filter((name) => name.toLowerCase() !== currentName.trim().toLowerCase())
    : NAME_OPTIONS;
  const names = availableNames.length > 0 ? availableNames : NAME_OPTIONS;
  return names[Math.floor(Math.random() * names.length)];
};

const SKIN_LINES: Record<StarterSkinKey, string[]> = {
  green: ['Classic green. Never out of style.', 'Back to my roots. Ribbit!', 'Green suits me. Obviously.'],
  blue: ['Feeling blue? Feeling FABULOUS.', 'Cool, calm, and very blue.', 'Ocean vibes, pond address.'],
  pink: ['Pretty in pink, obviously.', 'Bubblegum mode: activated!', 'Pink makes me hop faster.'],
};

const GIFT_ARTBOARD_W = 282;
const GIFT_ARTBOARD_H = 381;
const GIFT_CENTER_X = 141;
const GIFT_JUMP_TOP = 110;
const GIFT_RIM = 286;
const GIFT_SEAT = 292;
const GIFT_FLOOR = 360;
const GIFT_RIM_LEFT = { x: 67.5, y: 272.5 };
const GIFT_RIM_CORNER = { x: 161.25, y: 288.75 };
const GIFT_RIM_RIGHT = { x: 215, y: 267.5 };
const GIFT_PLACEHOLDER = { left: 44.8, top: 177, width: 194.7 };
const GIFT_WIDTH_PER_FROG = 1.45;
const FROG_SEAT = 1.085;
const FROG_CENTER = 0.86;
const FROG_RISE = 0.46;
const FROG_APEX = 0.24;

const ENTER_DELAY_MS = 380;
const DROP_MS = 900;
const DROP_IMPACT_MS = 450;
const OPEN_FALLBACK_MS = 2600;
const RATTLE_MS = [110, 250, 340, 400];
const POP_MS = 460;
const HOP_AT_MS = 520;
const UNCLIP_AT_MS = 690;
const BOX_FALL_AT_MS = 700;
const BOX_FALL_MS = 640;
const CARD_AT_MS = 760;
const LAND_MS = 1160;
const SETTLE_MS = 1300;
const HANDOFF_MS = 300;
const SKIN_LINE_MS = 2600;
export const KEYBOARD_EASE = 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)';
const HEADER_TOP_CLASS =
  'top-[calc(362px+env(safe-area-inset-top))] short:top-[calc(314px+env(safe-area-inset-top))] md:top-[354px]';
const BODY_TOP_CLASS =
  'top-[calc(456px+env(safe-area-inset-top))] short:top-[calc(408px+env(safe-area-inset-top))] md:top-[450px]';

const NAME_IN: Keyframe[] = [
  { transform: 'translate3d(0, 60%, 0)', opacity: 0 },
  { transform: 'translate3d(0, 0, 0)', opacity: 1 },
];

type Phase = 'loading' | 'arriving' | 'idle' | 'opening' | 'revealing' | 'naming' | 'leaving';

type Spark = {
  angle: number;
  dist: number;
  size: number;
  star: boolean;
  color: string;
  delay: number;
  dur: number;
  fall: number;
  rot: number;
};

const SPARKS: Spark[] = [
  { angle: -90, dist: 0.62, size: 18, star: true, color: 'gold', delay: 0, dur: 900, fall: 0.1, rot: 90 },
  { angle: -62, dist: 0.7, size: 11, star: false, color: 'green', delay: 20, dur: 820, fall: 0.16, rot: 0 },
  { angle: -118, dist: 0.68, size: 15, star: true, color: 'cream', delay: 10, dur: 880, fall: 0.12, rot: -80 },
  { angle: -38, dist: 0.58, size: 10, star: false, color: 'pink', delay: 40, dur: 760, fall: 0.2, rot: 0 },
  { angle: -142, dist: 0.6, size: 11, star: false, color: 'gold', delay: 30, dur: 780, fall: 0.18, rot: 0 },
  { angle: -74, dist: 0.88, size: 11, star: true, color: 'gold', delay: 50, dur: 960, fall: 0.08, rot: 120 },
  { angle: -104, dist: 0.9, size: 9, star: false, color: 'cream', delay: 60, dur: 940, fall: 0.1, rot: 0 },
  { angle: -20, dist: 0.5, size: 13, star: true, color: 'green', delay: 15, dur: 800, fall: 0.22, rot: 70 },
  { angle: -160, dist: 0.52, size: 13, star: true, color: 'pink', delay: 25, dur: 820, fall: 0.22, rot: -70 },
  { angle: -50, dist: 0.8, size: 8, star: false, color: 'gold', delay: 70, dur: 900, fall: 0.14, rot: 0 },
  { angle: -130, dist: 0.82, size: 8, star: false, color: 'green', delay: 80, dur: 900, fall: 0.14, rot: 0 },
  { angle: -84, dist: 0.45, size: 9, star: false, color: 'pink', delay: 35, dur: 700, fall: 0.2, rot: 0 },
];

const SPARKLE_PATH =
  'M12 0C12.9 7.2 16.8 11.1 24 12C16.8 12.9 12.9 16.8 12 24C11.1 16.8 7.2 12.9 0 12C7.2 11.1 11.1 7.2 12 0Z';

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d={SPARKLE_PATH} fill="currentColor" />
    </svg>
  );
}

type FrogBox = { left: number; top: number; width: number; layoutWidth: number };

const layoutOffset = (el: HTMLElement, root: HTMLElement) => {
  let left = 0;
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    left += node.offsetLeft;
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { left, top };
};

type Props = OnboardingStepProps & {
  canGoBack: boolean;
  giftOpened: boolean;
  onGiftOpened: () => void;
  onFrogPose: (pose: FrogPose | null) => void;
  progressTotal: number;
};

export default function AdoptFrogStep({
  selections,
  onSelect,
  onNext,
  onBack,
  canGoBack,
  giftOpened,
  onGiftOpened,
  onFrogPose,
  progressTotal,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [returning] = useState(giftOpened);
  const [phase, setPhase] = useState<Phase>(returning ? 'naming' : 'loading');
  const [frogMotion, setFrogMotion] = useState<FrogPose['motion']>(returning ? 'seated' : 'hidden');
  const [frogBox, setFrogBox] = useState<FrogBox | null>(null);
  const [giftReady, setGiftReady] = useState(false);
  const [burst, setBurst] = useState(false);
  const [boxGone, setBoxGone] = useState(false);
  const [boxCleared, setBoxCleared] = useState(returning);
  const [cardShown, setCardShown] = useState(returning);
  const [clipped, setClipped] = useState(!returning);
  const [pressed, setPressed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lift, setLift] = useState(0);
  const [bump, setBump] = useState(0);
  const [cue, setCue] = useState<FrogPose['cue']>(null);
  const cueFrog = useCallback(
    (emote: FrogEmote) => setCue({ emote, id: Date.now() }),
    [],
  );
  const [screen, setScreen] = useState<'color' | 'name'>(returning ? 'name' : 'color');
  const [swaps, setSwaps] = useState(0);
  const [skinLine, setSkinLine] = useState<{ id: number; text: string } | null>(null);
  const [ghost, setGhost] = useState<{ id: number; text: string } | null>(null);
  const [spins, setSpins] = useState(0);
  const inset = useOnboardingKeyboardInset();

  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const appliedY = useRef(0);
  const revealStartedRef = useRef(false);
  const skinLineTimer = useRef(0);
  const skinLineTurn = useRef<Record<StarterSkinKey, number>>({ green: 0, blue: 0, pink: 0 });
  const timers = useRef<number[]>([]);
  const latest = useRef({ selections, onSelect, onNext, onGiftOpened });
  latest.current = { selections, onSelect, onNext, onGiftOpened };

  const frogName = selections.frogName?.[0] ?? '';
  const trimmedName = frogName.trim();
  const pickedSkin = findStarterSkin(selections.frogSkin?.[0]);
  const opened = !['loading', 'arriving', 'idle'].includes(phase);
  const named = phase === 'naming' || phase === 'leaving';
  const leaving = phase === 'leaving';
  const rise = named && !leaving && (!returning || swaps > 0);
  const showGiftCopy = phase === 'loading' || phase === 'arriving' || phase === 'idle';
  const canTapGift = phase === 'arriving' || phase === 'idle';
  const liftStyle: CSSProperties = {
    transform: lift ? `translate3d(0, ${-lift}px, 0)` : undefined,
    transition: KEYBOARD_EASE,
  };

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(skinLineTimer.current);
    },
    [],
  );

  useEffect(() => () => onFrogPose(null), [onFrogPose]);

  useLayoutEffect(() => {
    const anchor = document.querySelector<HTMLElement>('[data-onboarding-frog]');
    if (!anchor) return;
    const measure = () => {
      const rect = anchor.getBoundingClientRect();
      if (!rect.width) return;
      const next = {
        left: rect.left,
        top: rect.top - appliedY.current,
        width: rect.width,
        layoutWidth: anchor.offsetWidth,
      };
      setFrogBox((prev) =>
        prev &&
        Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.top - next.top) < 0.5 &&
        prev.width === next.width
          ? prev
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(anchor);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const geometry = useMemo(() => {
    if (!frogBox) return null;
    const fw = frogBox.width;
    const g = (fw * GIFT_WIDTH_PER_FROG) / GIFT_ARTBOARD_W;
    const stageWidth = Math.round(GIFT_ARTBOARD_W * g);
    const stageHeight = Math.round((GIFT_FLOOR - GIFT_JUMP_TOP) * g);
    const stageY = (artboardY: number) => stageHeight - (GIFT_FLOOR - artboardY) * g;
    return {
      fw,
      g,
      stageY,
      stageWidth,
      stageHeight,
      canvasHeight: Math.round(GIFT_ARTBOARD_H * g),
      canvasTop: Math.round(stageHeight - GIFT_FLOOR * g),
      boxOrigin: `50% ${Math.round(GIFT_FLOOR * g)}px`,
      placeholder: {
        left: GIFT_PLACEHOLDER.left * g,
        top: GIFT_PLACEHOLDER.top * g,
        width: GIFT_PLACEHOLDER.width * g,
      },
      mouthY: stageY(GIFT_RIM) - 0.02 * fw,
      frogTop: stageY(GIFT_SEAT) - FROG_SEAT * fw,
    };
  }, [frogBox]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!frogBox || !root) return;
    const y = frogMotion === 'seated' ? -lift : 0;
    let fromX = 0;
    let fromY = 0;
    let clip: string | null = null;
    const stage = stageRef.current;
    if (geometry && stage && frogMotion !== 'seated') {
      const scale = frogBox.width / frogBox.layoutWidth;
      const offset = layoutOffset(stage, root);
      const seatX = offset.left + stage.offsetWidth / 2 - (frogBox.left + frogBox.width / 2);
      fromX = seatX / scale;
      fromY = (offset.top + geometry.frogTop - frogBox.top) / scale;
      if (clipped) {
        const point = (dx: number, py: number) =>
          `calc(50% + ${dx.toFixed(1)}px) ${py.toFixed(1)}px`;
        const rimY = (artboardY: number) => offset.top + geometry.stageY(artboardY) - frogBox.top;
        const rim = (corner: { x: number; y: number }) =>
          point(seatX + (corner.x - GIFT_CENTER_X) * geometry.g, rimY(corner.y));
        const far = 2000;
        clip = `polygon(${[
          point(-far, -far),
          point(far, -far),
          point(far, rimY(GIFT_RIM_RIGHT.y)),
          rim(GIFT_RIM_RIGHT),
          rim(GIFT_RIM_CORNER),
          rim(GIFT_RIM_LEFT),
          point(-far, rimY(GIFT_RIM_LEFT.y)),
        ].join(', ')})`;
      }
    }
    appliedY.current = y;
    onFrogPose({
      y,
      lift,
      motion: frogMotion,
      clip,
      fromX,
      fromY,
      rise: Math.round(frogBox.layoutWidth * FROG_RISE),
      peak: Math.round(Math.min(fromY, 0) - frogBox.layoutWidth * FROG_APEX),
      cue,
      bump,
    });
  }, [frogBox, geometry, lift, frogMotion, clipped, cue, bump, onFrogPose]);

  useEffect(() => {
    if (phase !== 'loading' || !geometry) return;
    const t = window.setTimeout(() => setPhase('arriving'), ENTER_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [phase, geometry]);

  useEffect(() => {
    if (phase !== 'arriving') return;
    const impact = window.setTimeout(hapticImpact, DROP_IMPACT_MS);
    const settle = window.setTimeout(() => setPhase('idle'), reduceMotion ? 360 : DROP_MS);
    return () => {
      window.clearTimeout(impact);
      window.clearTimeout(settle);
    };
  }, [phase, reduceMotion]);

  const beginReveal = useCallback(() => {
    if (returning || revealStartedRef.current) return;
    revealStartedRef.current = true;
    RATTLE_MS.forEach((ms) => later(ms, hapticTick));
    later(POP_MS, () => {
      hapticHeavy();
      setBurst(true);
    });
    later(HOP_AT_MS, () => {
      setPhase('revealing');
      setFrogMotion('hop');
    });
    later(UNCLIP_AT_MS, () => setClipped(false));
    later(BOX_FALL_AT_MS, () => setBoxGone(true));
    later(BOX_FALL_AT_MS + BOX_FALL_MS, () => setBoxCleared(true));
    later(CARD_AT_MS, () => setCardShown(true));
    later(LAND_MS, () => {
      hapticCelebrate();
      cueFrog('loveBurst');
      setPhase('naming');
      const { selections: current, onSelect: select, onGiftOpened: markOpened } = latest.current;
      markOpened();
      if (!current.frogName?.[0]) select('frogName', getRandomName());
    });
    later(SETTLE_MS, () => setFrogMotion('seated'));
  }, [later, returning, cueFrog]);

  const open = () => {
    if (!canTapGift) return;
    setPressed(false);
    setPhase('opening');
    hapticImpact();
    later(OPEN_FALLBACK_MS, beginReveal);
  };

  const pickSkin = (key: StarterSkinKey) => {
    if (key === pickedSkin.key || leaving) return;
    hapticSelect();
    onSelect('frogSkin', key);
    setBump((n) => n + 1);
    cueFrog(pickEmote('tryOn'));
    const lines = SKIN_LINES[key];
    const turn = skinLineTurn.current[key];
    skinLineTurn.current[key] = turn + 1;
    setSkinLine({ id: Date.now(), text: lines[turn % lines.length] });
    window.clearTimeout(skinLineTimer.current);
    skinLineTimer.current = window.setTimeout(() => setSkinLine(null), SKIN_LINE_MS);
  };

  const setName = (value: string) => {
    onSelect('frogName', value.slice(0, 24));
  };

  const shuffleName = () => {
    hapticSelect();
    setSpins((n) => n + 1);
    cueFrog('question');
    if (frogName && !reduceMotion) {
      setGhost({ id: Date.now(), text: frogName });
      inputRef.current?.animate(NAME_IN, {
        duration: 420,
        easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
      });
    }
    setName(getRandomName(frogName));
  };

  const showScreen = (next: 'color' | 'name') => {
    if (phase !== 'naming' || next === screen) return;
    hapticSelect();
    inputRef.current?.blur();
    window.clearTimeout(skinLineTimer.current);
    setSkinLine(null);
    setSwaps((n) => n + 1);
    setScreen(next);
  };

  const confirm = () => {
    if (phase !== 'naming' || !trimmedName) return;
    setPhase('leaving');
    setSkinLine(null);
    hapticSuccess();
    cueFrog('loveHeartbeat');
    later(HANDOFF_MS, () => latest.current.onNext());
  };

  useLayoutEffect(() => {
    if (leaving) return;
    if (!editing || !named) {
      setLift(0);
      return;
    }
    const measure = () => {
      const root = rootRef.current;
      const body = bodyRef.current;
      const cta = ctaRef.current;
      if (!root || !body || !cta) return;
      const ctaTop = root.clientHeight - inset - cta.offsetHeight;
      const bodyBottom = body.offsetTop + body.offsetHeight;
      setLift(Math.max(0, Math.round(bodyBottom - (ctaTop - 8))));
    };
    measure();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    window.addEventListener('resize', measure);
    return () => {
      vv?.removeEventListener('resize', measure);
      window.removeEventListener('resize', measure);
    };
  }, [editing, named, leaving, inset]);

  const spotLeft = frogBox ? frogBox.left + frogBox.width / 2 : 0;
  const spotTop = frogBox ? frogBox.top + FROG_CENTER * frogBox.width : 0;

  return (
    <div ref={rootRef} className="adopt-scene fixed inset-0 z-[29] overflow-hidden">
      {canTapGift && (
        <div
          aria-hidden
          className="absolute inset-0 z-30 cursor-pointer [-webkit-tap-highlight-color:transparent]"
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          onPointerCancel={() => setPressed(false)}
          onClick={open}
        />
      )}

      {(phase === 'naming' && screen === 'name') ||
      (canGoBack && (phase === 'idle' || phase === 'naming')) ? (
        <button
          type="button"
          onClick={phase === 'naming' && screen === 'name' ? () => showScreen('color') : onBack}
          aria-label="Back"
          className="absolute left-3 top-[calc(0.5rem+env(safe-area-inset-top))] z-40 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-md ring-1 ring-border/40 backdrop-blur transition animate-in fade-in hover:bg-background"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 12L6 8L10 4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}

      {!returning && (
        <div
          aria-hidden
          className={cn(
            'absolute inset-0 z-0 bg-background transition-opacity duration-700',
            burst && 'opacity-0',
          )}
        />
      )}

      {!boxCleared && geometry && (
        <div className="absolute inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] top-0 z-10 flex flex-col items-center justify-center px-5 pt-[calc(3rem+env(safe-area-inset-top))]">
          <div
            ref={stageRef}
            aria-hidden
            className="relative shrink-0"
            style={{ width: geometry.stageWidth, height: geometry.stageHeight }}
          >
            {burst && (
              <div
                className="pointer-events-none absolute left-1/2 z-0 h-0 w-0"
                style={{ top: geometry.mouthY }}
              >
                <div
                  className="adopt-fx adopt-bloom"
                  style={{ '--adopt-size': `${Math.round(geometry.fw * 1.5)}px` } as CSSProperties}
                />
                <div
                  className="adopt-fx adopt-ring"
                  style={{ '--adopt-size': `${Math.round(geometry.fw * 1.15)}px` } as CSSProperties}
                />
              </div>
            )}

            <div
              className={cn(
                'pointer-events-none absolute left-0 z-10',
                phase === 'loading' && 'opacity-0',
                phase !== 'loading' && !boxGone && 'adopt-gift-drop',
                boxGone && 'adopt-gift-fall',
              )}
              style={{
                top: geometry.canvasTop,
                width: geometry.stageWidth,
                height: geometry.canvasHeight,
              }}
            >
              <div
                className="relative h-full w-full"
                style={{
                  transform: pressed ? 'scale(0.94)' : 'scale(1)',
                  transformOrigin: geometry.boxOrigin,
                  transition: pressed
                    ? 'transform 140ms cubic-bezier(0.3, 0, 0.5, 1)'
                    : 'transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              >
                <img
                  src="/gift1.webp"
                  alt=""
                  draggable={false}
                  className="absolute max-w-none select-none"
                  style={{
                    left: geometry.placeholder.left,
                    top: geometry.placeholder.top,
                    width: geometry.placeholder.width,
                    opacity: giftReady ? 0 : 1,
                    transition: 'opacity 160ms ease-out 90ms',
                  }}
                />
                <GiftRive
                  className="relative"
                  width={geometry.stageWidth}
                  height={geometry.canvasHeight}
                  triggerOpen={opened}
                  ambient="jump"
                  eager
                  onReady={() => setGiftReady(true)}
                  onOpenStart={beginReveal}
                />
              </div>
            </div>

            {burst && (
              <div
                className="pointer-events-none absolute left-1/2 z-30 h-0 w-0"
                style={{ top: geometry.mouthY }}
              >
                {SPARKS.map((spark, i) => {
                  const rad = (spark.angle * Math.PI) / 180;
                  return (
                    <span
                      key={i}
                      className="adopt-spark"
                      style={
                        {
                          '--adopt-spark-size': `${spark.size}px`,
                          '--adopt-spark-dur': `${spark.dur}ms`,
                          '--adopt-spark-delay': `${spark.delay}ms`,
                          '--adopt-dx': `${Math.round(Math.cos(rad) * spark.dist * geometry.fw)}px`,
                          '--adopt-dy': `${Math.round(Math.sin(rad) * spark.dist * geometry.fw)}px`,
                          '--adopt-fall': `${Math.round(spark.fall * geometry.fw)}px`,
                          '--adopt-rot': `${spark.rot}deg`,
                          color: `var(--adopt-spark-${spark.color})`,
                        } as CSSProperties
                      }
                    >
                      {spark.star ? (
                        <Sparkle className="h-full w-full" />
                      ) : (
                        <span className="block h-full w-full rounded-full bg-current" />
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div
            className={cn(
              'mt-4 text-center',
              showGiftCopy ? (phase === 'loading' ? 'opacity-0' : 'adopt-rise') : 'adopt-fade-out',
            )}
            style={{ '--adopt-delay': '120ms' } as CSSProperties}
          >
            <h1 className="text-[26px] font-black leading-tight tracking-tight text-foreground md:text-3xl">
              Special delivery!
            </h1>
            <p className="mt-1.5 text-base font-medium text-muted-foreground md:text-lg">
              Your frog is waiting inside.
            </p>
          </div>
        </div>
      )}

      {frogBox && bump > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-[15] h-0 w-0"
          style={{ left: spotLeft, top: spotTop, ...liftStyle }}
        >
          <div
            key={bump}
            className="adopt-fx adopt-color-ring"
            style={
              {
                '--adopt-size': `${Math.round(frogBox.width * 1.05)}px`,
                color: pickedSkin.color,
              } as CSSProperties
            }
          />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-20" style={liftStyle}>
        <OnboardingProgressDock
          done={named && screen === 'name' ? 1 : 0}
          total={progressTotal}
          className={cardShown ? (returning ? undefined : 'adopt-card-in') : 'opacity-0'}
        />
        <div
          key={screen}
          className={cn(
            'absolute inset-x-0 px-5 text-center md:px-8',
            HEADER_TOP_CLASS,
            !named && 'opacity-0',
            rise && 'adopt-rise',
            leaving && 'adopt-fade-out',
          )}
        >
          <div className="flex h-12 items-end justify-center">
            <h1 className={ONBOARDING_TITLE_CLASS}>
              {screen === 'color' ? 'Love at first sight!' : 'Name your frog'}
            </h1>
          </div>
          <div className="mt-1.5 flex h-10 items-start justify-center">
            <p className={ONBOARDING_SUBTITLE_CLASS}>
              {screen === 'color'
                ? 'Pick a color for your new friend.'
                : 'Every great frog needs a great name.'}
            </p>
          </div>
        </div>
      </div>

      {skinLine && !leaving && screen === 'color' && (
        <div
          className="pointer-events-none absolute inset-x-0 top-[calc(1.25rem+env(safe-area-inset-top)+1px)] z-[25] flex justify-center md:-top-10"
          style={liftStyle}
        >
          <div className="relative h-[259px] w-[230px] md:h-[315px] md:w-[280px]">
            <FrogSpeechBubble
              key={skinLine.id}
              rate={0}
              done={0}
              total={0}
              fixedMessage={skinLine.text}
              className="!top-[176px] short:!top-[150px] md:!top-[211px]"
            />
          </div>
        </div>
      )}

      <div
        ref={bodyRef}
        className={cn(
          'absolute inset-x-0 z-20 mx-auto flex w-full max-w-sm flex-col items-center px-5 md:max-w-md',
          BODY_TOP_CLASS,
          !named && 'pointer-events-none opacity-0',
          leaving && 'adopt-fade-out',
        )}
        style={liftStyle}
      >
        {screen === 'color' ? (
          <div
            role="radiogroup"
            aria-label="Frog color"
            key="color"
            className={cn('grid w-full grid-cols-3 gap-3', rise && 'adopt-rise')}
            style={{ '--adopt-delay': '80ms' } as CSSProperties}
          >
            {STARTER_SKINS.map((skin) => {
              const selected = skin.key === pickedSkin.key;
              return (
                <button
                  key={skin.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={named ? 0 : -1}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pickSkin(skin.key)}
                  className={cn(
                    'relative flex h-[112px] flex-col items-center justify-end gap-2 overflow-hidden rounded-[22px] border-2 pb-3 transition-[transform,box-shadow,border-color,background-color] duration-150 [-webkit-tap-highlight-color:transparent] active:translate-y-[3px] active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
                    selected
                      ? 'border-primary bg-primary/10 shadow-[0_3px_0_0_hsl(var(--primary)/0.35)]'
                      : 'border-border/60 bg-card shadow-[0_3px_0_0_rgba(0,0,0,0.06)]',
                  )}
                >
                  <img
                    src={skin.image}
                    alt=""
                    draggable={false}
                    className="h-14 w-auto select-none object-contain"
                  />
                  <span
                    className={cn(
                      'text-sm font-black leading-none',
                      selected ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {skin.label}
                  </span>
                  {selected && (
                    <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" strokeWidth={3.5} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <form
            key="name"
            className={cn(
              'relative h-16 w-full overflow-hidden rounded-3xl border-2 border-border/60 bg-card shadow-[0_3px_0_0_rgba(0,0,0,0.06)] transition-[border-color,box-shadow] focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/10',
              rise && 'adopt-rise',
            )}
            style={{ '--adopt-delay': '80ms' } as CSSProperties}
            onSubmit={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            {ghost && (
              <span
                key={ghost.id}
                aria-hidden
                onAnimationEnd={() => setGhost(null)}
                className="adopt-name-out pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden whitespace-nowrap px-14 text-2xl font-black tracking-tight text-foreground"
              >
                {ghost.text}
              </span>
            )}
            <input
              ref={inputRef}
              value={frogName}
              onChange={(event) => setName(event.target.value)}
              onFocus={(event) => {
                event.currentTarget.select();
                setEditing(true);
              }}
              onBlur={() => setEditing(false)}
              tabIndex={named ? 0 : -1}
              className="absolute inset-0 h-full w-full bg-transparent px-14 text-center text-2xl font-black tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40"
              aria-label="Frog name"
              placeholder="Frog name"
              name="frog-nickname"
              maxLength={24}
              enterKeyHint="done"
              autoComplete="off"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
            />
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={shuffleName}
              tabIndex={named ? 0 : -1}
              aria-label="Suggest a name"
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-2xl text-muted-foreground transition [-webkit-tap-highlight-color:transparent] active:scale-90 [@media(hover:hover)]:hover:bg-muted [@media(hover:hover)]:hover:text-foreground"
            >
              <motion.span
                animate={{ rotate: spins * 360 }}
                transition={{ type: 'spring', stiffness: 260, damping: 16 }}
                className="inline-flex"
              >
                <Dices className="h-5 w-5" />
              </motion.span>
            </button>
          </form>
        )}
      </div>

      <div
        ref={ctaRef}
        className={cn(
          'absolute inset-x-0 bottom-0 z-[35] px-5 pt-3 md:pb-10',
          inset > 0 ? 'pb-3' : 'pb-[calc(1.75rem+env(safe-area-inset-bottom))]',
          !canTapGift && !named && 'pointer-events-none',
        )}
        style={{
          transform: inset > 0 ? `translate3d(0, ${-inset}px, 0)` : undefined,
          transition: KEYBOARD_EASE,
        }}
      >
        {named ? (
          <div
            key={screen}
            className={cn(
              'flex justify-center',
              rise && 'adopt-rise',
              leaving && 'adopt-fade-out',
            )}
            style={{ '--adopt-delay': '160ms' } as CSSProperties}
          >
            {screen === 'color' ? (
              <OnboardingButton onClick={() => showScreen('name')}>Next</OnboardingButton>
            ) : (
              <OnboardingButton onClick={confirm} disabled={!trimmedName || leaving}>
                <span className="min-w-0 truncate">
                  {trimmedName ? `Adopt ${trimmedName}` : 'Name your frog'}
                </span>
              </OnboardingButton>
            )}
          </div>
        ) : (
          <div
            key="open"
            className={cn(
              'flex justify-center',
              phase === 'loading' ? 'opacity-0' : canTapGift ? 'adopt-rise' : 'adopt-fade-out',
            )}
            style={{ '--adopt-delay': '700ms' } as CSSProperties}
          >
            <OnboardingButton onClick={open} disabled={phase === 'loading'}>
              Open your gift
            </OnboardingButton>
          </div>
        )}
      </div>
    </div>
  );
}
