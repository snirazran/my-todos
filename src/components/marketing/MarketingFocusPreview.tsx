'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Square } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { FocusScene } from '@/components/ui/FocusScene';
import { useFlyJar } from '@/components/marketing/FlyJar';

const SESSION_SECONDS = 25 * 60;
const FLIES = 5;
const FLY_EVERY = SESSION_SECONDS / FLIES;
const TICK_MS = 100;
const SECONDS_PER_TICK = 6;

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function MarketingFocusPreview() {
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(SESSION_SECONDS);
  const [frogReady, setFrogReady] = useState(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const counterRef = useRef<HTMLSpanElement | null>(null);
  const landedRef = useRef(0);
  const runLandedRef = useRef(0);
  const { award } = useFlyJar();

  useEffect(() => {
    mainScrollRef.current = document.getElementById('main-scroll');
  }, []);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - SECONDS_PER_TICK));
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (remaining === 0) setRunning(false);
  }, [remaining]);

  const elapsed = SESSION_SECONDS - remaining;
  const caught = Math.min(FLIES, Math.floor(elapsed / FLY_EVERY));
  const finished = remaining === 0;
  const active = !finished && elapsed > 0;
  const nextFlyIn = FLY_EVERY - (elapsed % FLY_EVERY);

  const endSession = () => {
    setRunning(false);
    setRemaining(SESSION_SECONDS);
  };

  const primary = () => {
    if (finished) {
      setRemaining(SESSION_SECONDS);
      setRunning(true);
      return;
    }
    setRunning((value) => !value);
  };

  const payFly = () => {
    runLandedRef.current += 1;
    landedRef.current += 1;
    award(`focus-${landedRef.current}`, 1, counterRef.current);
  };

  const onGainLand = () => {
    if (runLandedRef.current < FLIES) payFly();
  };

  useEffect(() => {
    if (remaining === SESSION_SECONDS) runLandedRef.current = 0;
  }, [remaining]);

  useEffect(() => {
    if (!finished) return;
    const timer = window.setTimeout(() => {
      while (runLandedRef.current < FLIES) {
        runLandedRef.current += 1;
        landedRef.current += 1;
        award(`focus-${landedRef.current}`, 1, counterRef.current);
      }
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [finished, award]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
      <div className="text-center lg:text-left">
        <h2 className="ph-h2">Can’t get started? Pick one task and set a timer.</h2>
        <p className="ph-body mx-auto lg:mx-0">
          Your frog hunts flies while you work, and the longer you focus, the
          more it catches. On iPhone the timer stays on your Lock Screen and
          rings even on silent.
        </p>
        <p className="mt-6 text-sm font-black text-[#34631f] dark:text-[#9fd98f]">
          Try it: a full session takes 25 seconds here.
        </p>
      </div>

      <div className="mx-auto w-full max-w-[400px]">
        <div className="relative isolate overflow-hidden rounded-[30px] bg-primary text-white shadow-[0_6px_0_rgba(0,0,0,0.12),0_40px_70px_-30px_rgba(15,46,29,0.6)] dark:bg-green-700">
          <div
            aria-hidden
            className={`absolute inset-x-0 bottom-0 z-0 bg-black/20 ${running ? 'transition-[height] duration-100 ease-linear' : 'transition-[height] duration-500'}`}
            style={{ height: `${(elapsed / SESSION_SECONDS) * 100}%` }}
          />

          <div className="relative z-10 px-4 pb-5 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-full bg-black/25 py-1 pl-1.5 pr-2.5 shadow-inner">
                <Fly size={24} interactive={false} alwaysPlay />
                <span ref={counterRef} className="text-[13px] font-black tabular-nums text-white">
                  {caught}/{FLIES}
                </span>
              </div>
              <span className="rounded-full bg-black/25 px-3 py-1.5 text-xs font-bold tabular-nums text-white shadow-inner">
                {finished ? 'Done' : active ? `Next fly in ${formatTimer(nextFlyIn)}` : 'Focus'}
              </span>
            </div>

            <p className="mt-2 text-center text-lg font-black leading-tight text-white">
              Draft the first paragraph
            </p>

            <p className="mt-3 pb-2 text-center text-[clamp(56px,17vw,72px)] font-black leading-none tracking-tighter text-white drop-shadow-lg tabular-nums">
              {formatTimer(remaining)}
            </p>

            <div className="relative z-30 mt-10">
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
                caught={caught}
                fliesPotential={FLIES}
                counterRef={counterRef}
                onGainLand={onGainLand}
                onFrogReady={() => setFrogReady(true)}
                scrollContainerRef={mainScrollRef}
                trackMovingTarget
                allowCameraFollow={false}
                localClock
                flapWhenIdle
              />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={primary}
                className="relative flex items-center justify-center rounded-2xl bg-white px-8 py-3 text-[16px] font-black text-primary shadow-[0_6px_0_rgba(0,0,0,0.15)] transition-[transform,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:translate-y-1.5 active:shadow-[0_0_0_rgba(0,0,0,0.15)] dark:bg-slate-50 dark:text-green-700"
              >
                {running ? (
                  <Pause className="mr-1.5 h-5 w-5 fill-current" aria-hidden />
                ) : finished ? (
                  <RotateCcw className="mr-1.5 h-5 w-5" aria-hidden />
                ) : (
                  <Play className="mr-1.5 h-5 w-5 fill-current" aria-hidden />
                )}
                {running ? 'PAUSE' : finished ? 'GO AGAIN' : active ? 'RESUME' : 'START'}
              </button>

              <div className="flex h-8 items-center justify-center">
                {active ? (
                  <button
                    type="button"
                    onClick={endSession}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-white/75 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white active:scale-95"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
                    End session
                  </button>
                ) : (
                  <span className="text-[12px] font-bold text-white/70">
                    Earns up to {FLIES} flies
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
