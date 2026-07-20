'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Pause, Play, RotateCcw } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { FocusScene } from '@/components/ui/FocusScene';

const FOCUS_DURATION_SECONDS = 10 * 60;

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function MarketingFocusPreview() {
  const [running, setRunning] = useState(true);
  const [seconds, setSeconds] = useState(FOCUS_DURATION_SECONDS);
  const [frogReady, setFrogReady] = useState(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mainScrollRef.current = document.getElementById('main-scroll');
  }, []);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(
      () => setSeconds((value) => (value > 0 ? value - 1 : FOCUS_DURATION_SECONDS)),
      1000,
    );
    return () => window.clearInterval(interval);
  }, [running]);

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Focus with a payoff</p>
        <h2 className="mt-3 text-balance text-3xl font-black tracking-tight sm:text-5xl">
          Stay with one task. Watch the rewards add up.
        </h2>
        <p className="mt-5 max-w-[65ch] text-pretty text-sm font-medium leading-7 text-muted-foreground sm:text-base">
          Choose a task, set the time, and give it your full attention. Every
          five focused minutes earns your frog another fly, while every minute
          moves the matching Area Quest closer to its next reward. Your session
          stays in sync across web and mobile, even if you close the tab.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-[11px] font-black text-muted-foreground">
          <span className="rounded-full border border-border bg-card px-3 py-2">Pick a task</span>
          <ArrowRight className="h-4 w-4" aria-hidden />
          <span className="rounded-full border border-border bg-card px-3 py-2">Start a timer</span>
          <ArrowRight className="h-4 w-4" aria-hidden />
          <span className="rounded-full border border-border bg-card px-3 py-2">Your frog hunts</span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[420px]">
        <div className="relative overflow-hidden rounded-[26px] border border-border/60 bg-primary p-4 text-white shadow-xl shadow-emerald-950/15 sm:p-5">
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[34%] bg-black/10" />
          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-full bg-black/25 py-1 pl-1.5 pr-2.5 shadow-inner">
            <Fly size={24} interactive={false} alwaysPlay />
            <span className="text-[13px] font-black tabular-nums text-white">2/5</span>
            </div>
            <span className="rounded-full bg-black/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white/85">Focus</span>
          </div>

          <div className="relative z-10 mt-1 text-center">
            <p className="text-base font-black">Draft the first paragraph</p>
            <p className="mt-1 text-[clamp(3rem,13vw,3.75rem)] font-black leading-none tracking-tighter text-white drop-shadow-lg tabular-nums">
              {formatTimer(seconds)}
            </p>
          </div>

          <div className="relative z-20 mt-16 -translate-y-[3px]">
            <Image
              src="/skins/common/skin0.webp"
              alt=""
              width={216}
              height={177}
              aria-hidden
              className={`pointer-events-none absolute bottom-0 left-1/2 z-20 h-auto w-[120px] -translate-x-1/2 transition-opacity duration-200 ${
                frogReady ? 'opacity-0' : 'opacity-100'
              }`}
            />
            <FocusScene
              indices={{ skin: 0, hat: 0, body: 0, hand_item: 0 }}
              running={running}
              showFlies
              caught={2}
              focusSeconds={680}
              frogWidth={132}
              onFrogReady={() => setFrogReady(true)}
              scrollContainerRef={mainScrollRef}
              trackMovingTarget
              allowCameraFollow={false}
            />
          </div>

          <div className="relative z-10 -mt-1 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setSeconds(FOCUS_DURATION_SECONDS)}
              aria-label="Reset preview timer"
              className="grid h-11 w-14 place-items-center rounded-xl bg-white/20 text-white transition hover:bg-white/25"
            >
              <RotateCcw className="h-[18px] w-[18px]" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setRunning((value) => !value)}
              aria-label={running ? 'Pause preview timer' : 'Resume preview timer'}
              className="inline-flex h-12 min-w-32 items-center justify-center gap-2 rounded-2xl bg-white px-6 text-xs font-black uppercase tracking-widest text-emerald-900 shadow-[0_4px_0_rgba(0,0,0,0.15)] transition-transform active:translate-y-1 active:shadow-none"
            >
              {running ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
              {running ? 'Pause' : 'Resume'}
            </button>
            <span className="grid h-11 w-14 place-items-center rounded-xl bg-white/20 text-[10px] font-black text-white">Break</span>
          </div>
        </div>

        <p className="mx-auto mt-3 max-w-sm text-center text-[11px] font-bold leading-5 text-muted-foreground">
          1 fly every 5 focused minutes · time saved to this task
        </p>
      </div>
    </div>
  );
}
