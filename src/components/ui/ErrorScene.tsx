'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { playPop } from '@/lib/catchSounds';
import { hapticImpact } from '@/lib/haptics';
import { FLY_GAME_STORAGE_KEY } from '@/lib/flyGame';

const Fly = dynamic(() => import('@/components/ui/fly'), { ssr: false });

type SceneFlySlot = {
  top: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
};

const FLY_SLOTS: SceneFlySlot[] = [
  { top: 10, left: 6, size: 32, duration: 13, delay: 0 },
  { top: 60, left: 14, size: 26, duration: 16, delay: -4 },
  { top: 18, left: 76, size: 28, duration: 15, delay: -8 },
  { top: 66, left: 82, size: 34, duration: 12, delay: -2 },
];

const RESPAWN_MS = 1400;

type Pop = { id: number; top: number; left: number };

export type ErrorSceneProps = {
  code: string;
  title: string;
  message: string;
  primaryLabel: string;
  primaryHref?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  detail?: string;
};

export function ErrorScene({
  code,
  title,
  message,
  primaryLabel,
  primaryHref,
  onPrimary,
  secondaryLabel = 'Go back',
  secondaryHref,
  detail,
}: ErrorSceneProps) {
  const router = useRouter();
  const [caught, setCaught] = useState(0);
  const [hidden, setHidden] = useState<number[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);
  const [best, setBest] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const popIdRef = useRef(0);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FLY_GAME_STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as { best?: number };
      if (typeof stored.best === 'number' && stored.best > 0) setBest(stored.best);
    } catch {}
  }, []);

  useEffect(
    () => () => {
      for (const timer of timersRef.current) clearTimeout(timer);
    },
    [],
  );

  const catchFly = useCallback((index: number, slot: SceneFlySlot) => {
    setHidden((current) =>
      current.includes(index) ? current : [...current, index],
    );
    setCaught((current) => {
      playPop(current);
      return current + 1;
    });
    hapticImpact();

    const popId = ++popIdRef.current;
    setPops((current) => [...current, { id: popId, top: slot.top, left: slot.left }]);
    timersRef.current.push(
      setTimeout(
        () => setPops((current) => current.filter((pop) => pop.id !== popId)),
        800,
      ),
      setTimeout(
        () => setHidden((current) => current.filter((id) => id !== index)),
        RESPAWN_MS,
      ),
    );
  }, []);

  return (
    <div className="error-scene relative flex min-h-[calc(100dvh-9rem)] flex-col items-center justify-center px-4 py-6 md:min-h-[calc(100dvh-7rem)]">
      <div className="w-full max-w-[420px]">
        <div className="relative h-[clamp(170px,40vw,230px)] w-full select-none">
          <svg
            aria-hidden
            viewBox="0 0 320 200"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            <path
              d="M 16 172 C 58 196, 98 154, 92 118 C 86 82, 42 76, 38 110 C 34 146, 100 156, 152 140 C 216 120, 240 72, 296 44"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.65"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="4 11"
              vectorEffect="non-scaling-stroke"
              className="[animation:error-route-draw_2.4s_linear_infinite] [filter:drop-shadow(0_1px_2px_rgba(6,40,25,0.55))]"
            />
          </svg>

          <p
            className={cn(
              'absolute inset-0 grid place-items-center whitespace-nowrap font-display leading-none tracking-tight text-white [filter:drop-shadow(0_5px_0_rgba(8,52,33,0.85))_drop-shadow(0_14px_22px_rgba(0,0,0,0.35))]',
              code.length > 3
                ? 'text-[clamp(50px,16vw,100px)]'
                : 'text-[clamp(74px,24vw,142px)]',
            )}
          >
            {code}
          </p>

          {FLY_SLOTS.map((slot, index) => (
            <button
              key={index}
              type="button"
              tabIndex={-1}
              aria-hidden
              onPointerDown={() => catchFly(index, slot)}
              style={{
                top: `${slot.top}%`,
                left: `${slot.left}%`,
                animationDuration: `${slot.duration}s`,
                animationDelay: `${slot.delay}s`,
              }}
              className={cn(
                'absolute grid place-items-center rounded-full [animation:error-fly-drift_linear_infinite]',
                hidden.includes(index) && 'pointer-events-none',
              )}
            >
              <span
                className={cn(
                  'grid place-items-center transition',
                  hidden.includes(index)
                    ? 'scale-0 opacity-0'
                    : 'scale-100 opacity-100',
                )}
              >
                <Fly
                  size={slot.size}
                  interactive={false}
                  alwaysPlay
                  ignoreIdlePause
                />
              </span>
            </button>
          ))}

          {pops.map((pop) => (
            <span
              key={pop.id}
              aria-hidden
              style={{ top: `${pop.top}%`, left: `${pop.left}%` }}
              className="error-pop absolute font-display text-xl text-white [animation:error-pop-rise_0.8s_ease-out_forwards] [filter:drop-shadow(0_2px_3px_rgba(6,40,25,0.7))]"
            >
              +1
            </span>
          ))}
        </div>

        <div className="rounded-[28px] border border-border bg-card/95 p-5 shadow-2xl backdrop-blur-2xl">
          <h1 className="text-center font-display text-[clamp(24px,6.5vw,32px)] leading-tight text-foreground">
            {title}
          </h1>
          <p className="mx-auto mt-2 max-w-[19rem] text-center text-sm font-semibold leading-relaxed text-muted-foreground">
            {message}
          </p>

          <div className="mt-5 space-y-2">
            {primaryHref ? (
              <Link
                href={primaryHref}
                className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-black text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-105 active:scale-[.98]"
              >
                {primaryLabel}
              </Link>
            ) : (
              <button
                type="button"
                onClick={onPrimary}
                className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-black text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-105 active:scale-[.98]"
              >
                {primaryLabel}
              </button>
            )}

            {secondaryHref ? (
              <Link
                href={secondaryHref}
                className="flex h-12 w-full items-center justify-center rounded-2xl border border-border bg-muted/50 text-sm font-black text-foreground transition hover:bg-muted active:scale-[.98]"
              >
                {secondaryLabel}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => router.back()}
                className="flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl border border-border bg-muted/50 text-sm font-black text-foreground transition hover:bg-muted active:scale-[.98]"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={3} />
                {secondaryLabel}
              </button>
            )}
          </div>

          <div className="my-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[12px] font-black text-muted-foreground">
              {caught > 0 ? `${caught} caught here` : 'Since you stopped by'}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Link
            href="/fly-catch?from=error"
            className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-border/60 bg-muted/50 p-3 text-left transition hover:border-primary/40 hover:bg-muted active:scale-[.99]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent [animation:bar-shine-idle_4.5s_ease-in-out_infinite]"
            />
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-400/15 shadow-[0_0_14px_rgba(250,204,21,0.35)]">
              <Fly size={26} interactive={false} alwaysPlay ignoreIdlePause />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-display text-base leading-none text-foreground">
                  FLY CATCH
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-1.5 py-0.5 text-[11px] font-black text-muted-foreground">
                  <Timer className="h-2.5 w-2.5" strokeWidth={3} />
                  30s
                </span>
                {best > 0 ? (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-black text-primary">
                    Best {best}
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block text-xs font-semibold leading-snug text-muted-foreground">
                {caught > 0
                  ? 'Quick hands. The real swarm moves faster — and bites back.'
                  : 'One frog, one swarm, thirty seconds. The red ones bite back.'}
              </span>
            </span>
            <span className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground shadow-sm">
              <Play className="h-3 w-3 fill-current" />
              PLAY
            </span>
          </Link>

          {detail ? (
            <p className="mt-4 text-center text-[12px] font-bold text-muted-foreground/60">
              Reference {detail}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
