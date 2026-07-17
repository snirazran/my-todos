'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { animate, type AnimationPlaybackControls } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlyCatchOverlay } from '@/lib/flyCatchOverlayStore';
import FlyCatchGame from './FlyCatchGame';

const NAV_SHIFT = 130;
const MAIN_Z_RAISED = '120';
const LAUNCHER_Z_RAISED = '60';

const smooth = (p: number, from: number, to: number) => {
  const t = Math.min(1, Math.max(0, (p - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

type Scene = {
  shell: HTMLElement | null;
  launcher: HTMLElement | null;
  nav: HTMLElement | null;
  sheet: HTMLElement | null;
  sheetTop: number;
  sheetShift: number;
  hero: HTMLElement | null;
  heroCard: HTMLElement | null;
  heroFrogRect: DOMRect | null;
  heroRect: DOMRect | null;
  fades: HTMLElement[];
  pageBg: HTMLElement | null;
  gameBg: HTMLElement | null;
  gameHuds: HTMLElement[];
  gameCard: HTMLElement | null;
  gameFrog: HTMLElement | null;
  heroMotion: { dx: number; dy: number; scale: number } | null;
};

const emptyScene = (): Scene => ({
  shell: null,
  launcher: null,
  nav: null,
  sheet: null,
  sheetTop: 0,
  sheetShift: 480,
  hero: null,
  heroCard: null,
  heroFrogRect: null,
  heroRect: null,
  fades: [],
  pageBg: null,
  gameBg: null,
  gameHuds: [],
  gameCard: null,
  gameFrog: null,
  heroMotion: null,
});

export function FlyCatchOverlay() {
  const router = useRouter();
  const active = useFlyCatchOverlay((state) => state.active);
  const open = useFlyCatchOverlay((state) => state.open);
  const setController = useFlyCatchOverlay((state) => state.setController);

  const chipRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene>(emptyScene());
  const progressRef = useRef(0);
  const gestureRef = useRef(false);
  const animRef = useRef<AnimationPlaybackControls | null>(null);
  const pushedRef = useRef(false);
  const closingRef = useRef(false);
  const openRef = useRef(false);
  const pendingNavRef = useRef<string | null>(null);
  const revealRafRef = useRef(0);
  const [armed, setArmed] = useState(false);

  const prime = useCallback(() => {
    const scene = emptyScene();
    scene.shell = document.getElementById('main-scroll');
    scene.launcher = document.querySelector<HTMLElement>('[data-fly-catch-swipe]');
    scene.nav = document.querySelector<HTMLElement>('[data-app-bottom-nav]');
    scene.sheet = document.querySelector<HTMLElement>('[data-fly-sheet]');
    scene.hero = document.querySelector<HTMLElement>('[data-fly-hero]');
    scene.heroCard = document.querySelector<HTMLElement>('[data-fly-hero-card]');
    scene.pageBg = document.querySelector<HTMLElement>('[data-fly-page-bg]');
    scene.fades = Array.from(
      document.querySelectorAll<HTMLElement>('[data-fly-fade]'),
    );
    if (scene.sheet) {
      const rect = scene.sheet.getBoundingClientRect();
      scene.sheetTop = rect.top;
      scene.sheetShift = Math.max(240, window.innerHeight - rect.top + 24);
    }
    if (scene.hero) {
      scene.heroRect = scene.hero.getBoundingClientRect();
      const frog = scene.hero.querySelector<HTMLElement>('[data-fly-hero-frog]');
      scene.heroFrogRect = (frog ?? scene.hero).getBoundingClientRect();
    }
    if (scene.shell) scene.shell.style.zIndex = MAIN_Z_RAISED;
    if (scene.launcher) scene.launcher.style.zIndex = LAUNCHER_Z_RAISED;
    sceneRef.current = scene;
  }, []);

  const ensureGameRefs = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene.gameBg) {
      scene.gameBg = document.querySelector<HTMLElement>('[data-fly-game-bg]');
    }
    if (scene.gameHuds.length === 0) {
      scene.gameHuds = Array.from(
        document.querySelectorAll<HTMLElement>('[data-fly-game-hud]'),
      );
    }
    if (!scene.gameCard) {
      scene.gameCard = document.querySelector<HTMLElement>('[data-fly-game-card]');
    }
    if (!scene.gameFrog) {
      scene.gameFrog = document.querySelector<HTMLElement>('[data-fly-game-frog]');
      if (scene.gameFrog && scene.hero && scene.heroFrogRect && scene.heroRect) {
        const target = scene.gameFrog.getBoundingClientRect();
        if (target.width > 0) {
          const from = scene.heroFrogRect;
          scene.heroMotion = {
            dx: target.left + target.width / 2 - (from.left + from.width / 2),
            dy: target.bottom - from.bottom,
            scale: target.width / from.width,
          };
          scene.hero.style.transformOrigin = `${
            from.left + from.width / 2 - scene.heroRect.left
          }px ${from.bottom - scene.heroRect.top}px`;
        } else {
          scene.gameFrog = null;
        }
      }
    }
  }, []);

  const apply = useCallback(
    (progress: number) => {
      progressRef.current = progress;
      const p = Math.min(1, Math.max(0, progress));
      const scene = sceneRef.current;
      ensureGameRefs();

      if (scene.sheet) {
        scene.sheet.style.transform = `translate3d(0, ${(p * scene.sheetShift).toFixed(2)}px, 0)`;
      }
      if (scene.hero && scene.heroMotion) {
        const { dx, dy, scale } = scene.heroMotion;
        scene.hero.style.transform = `translate3d(${(dx * p).toFixed(2)}px, ${(dy * p).toFixed(2)}px, 0) scale(${(1 + (scale - 1) * p).toFixed(4)})`;
      }
      if (scene.heroCard) {
        scene.heroCard.style.opacity = Math.max(0, 1 - p * 2.2).toFixed(3);
      }
      for (const el of scene.fades) {
        el.style.opacity = Math.max(0, 1 - p * 2.5).toFixed(3);
      }
      if (scene.pageBg) {
        scene.pageBg.style.opacity = scene.gameBg
          ? (1 - smooth(p, 0.45, 0.95)).toFixed(3)
          : '1';
      }
      if (scene.nav) {
        scene.nav.style.transform =
          p > 0.001 ? `translate3d(0, ${(p * NAV_SHIFT).toFixed(2)}px, 0)` : '';
      }

      if (scene.gameBg) {
        scene.gameBg.style.opacity = smooth(p, 0.05, 0.55).toFixed(3);
      }
      const hudP = smooth(p, 0.1, 0.8);
      for (const el of scene.gameHuds) {
        el.style.opacity = hudP.toFixed(3);
        el.style.transform = `translate3d(0, ${((hudP - 1) * 72).toFixed(2)}px, 0)`;
      }
      if (scene.gameCard) {
        const cardP = smooth(p, 0.45, 1);
        scene.gameCard.style.opacity = cardP.toFixed(3);
        scene.gameCard.style.transform = `translate3d(0, ${((1 - cardP) * 20).toFixed(2)}px, 0)`;
      }

      if (chipRef.current) {
        chipRef.current.style.opacity =
          openRef.current || p < 0.02 ? '0' : Math.min(1, p * 6).toFixed(3);
        chipRef.current.style.transform = `translate3d(0, ${(scene.sheetTop + p * scene.sheetShift - 54).toFixed(2)}px, 0)`;
      }
    },
    [ensureGameRefs],
  );

  const finishClose = useCallback(() => {
    const scene = sceneRef.current;
    if (scene.sheet) scene.sheet.style.transform = '';
    if (scene.hero) {
      scene.hero.style.transform = '';
      scene.hero.style.transformOrigin = '';
      scene.hero.style.visibility = '';
    }
    if (scene.heroCard) scene.heroCard.style.opacity = '';
    for (const el of scene.fades) el.style.opacity = '';
    if (scene.pageBg) scene.pageBg.style.opacity = '';
    if (scene.nav) scene.nav.style.transform = '';
    if (scene.shell) scene.shell.style.zIndex = '';
    if (scene.launcher) scene.launcher.style.zIndex = '';
    if (chipRef.current) chipRef.current.style.opacity = '0';
    sceneRef.current = emptyScene();
    progressRef.current = 0;
    openRef.current = false;
    closingRef.current = false;
    setArmed(false);
    useFlyCatchOverlay.getState().deactivate();
    const href = pendingNavRef.current;
    pendingNavRef.current = null;
    if (href) router.push(href);
  }, [router]);

  const completeOpen = useCallback(() => {
    useFlyCatchOverlay.getState().setOpen(true);
    if (chipRef.current) chipRef.current.style.opacity = '0';
    cancelAnimationFrame(revealRafRef.current);
    const reveal = () => {
      if (closingRef.current || !openRef.current) return;
      apply(1);
      const scene = sceneRef.current;
      if (!scene.gameFrog || !scene.heroMotion) {
        revealRafRef.current = requestAnimationFrame(reveal);
        return;
      }
      if (scene.hero) scene.hero.style.visibility = 'hidden';
      if (scene.shell) scene.shell.style.zIndex = '';
      if (scene.launcher) scene.launcher.style.zIndex = '';
    };
    reveal();
  }, [apply]);

  const animateClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    cancelAnimationFrame(revealRafRef.current);
    const scene = sceneRef.current;
    scene.nav = document.querySelector<HTMLElement>('[data-app-bottom-nav]');
    if (scene.shell) scene.shell.style.zIndex = MAIN_Z_RAISED;
    if (scene.launcher) scene.launcher.style.zIndex = LAUNCHER_Z_RAISED;
    if (scene.hero) scene.hero.style.visibility = '';
    useFlyCatchOverlay.getState().setOpen(false);
    animRef.current?.stop();
    if (document.hidden) {
      finishClose();
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    animRef.current = animate(progressRef.current, 0, {
      ...(reduced
        ? { duration: 0.18, ease: 'easeOut' as const }
        : { type: 'spring' as const, stiffness: 340, damping: 38 }),
      onUpdate: apply,
      onComplete: finishClose,
    });
  }, [apply, finishClose]);

  const requestClose = useCallback(
    (href?: string) => {
      if (closingRef.current || !openRef.current) return;
      pendingNavRef.current = href ?? null;
      if (pushedRef.current) window.history.back();
      else animateClose();
    },
    [animateClose],
  );

  useEffect(() => {
    const onPop = () => {
      if (!pushedRef.current) return;
      pushedRef.current = false;
      animateClose();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [animateClose]);

  useEffect(() => {
    setController({
      drag: (pullPx, armedNow) => {
        if (closingRef.current || openRef.current) return;
        if (!gestureRef.current) {
          gestureRef.current = true;
          prime();
        }
        animRef.current?.stop();
        setArmed(armedNow);
        apply(pullPx / sceneRef.current.sheetShift);
      },
      settle: (shouldOpen, velocityPxMs) => {
        if (closingRef.current || openRef.current) return;
        gestureRef.current = false;
        animRef.current?.stop();
        if (shouldOpen) {
          openRef.current = true;
          if (!pushedRef.current) {
            window.history.pushState({ flyCatchOverlay: true }, '');
            pushedRef.current = true;
          }
        } else if (progressRef.current <= 0.001) {
          finishClose();
          return;
        }
        if (document.hidden) {
          if (shouldOpen) completeOpen();
          else finishClose();
          return;
        }
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        animRef.current = animate(progressRef.current, shouldOpen ? 1 : 0, {
          ...(reduced
            ? { duration: 0.18, ease: 'easeOut' as const }
            : {
                type: 'spring' as const,
                stiffness: shouldOpen ? 300 : 360,
                damping: shouldOpen ? 36 : 38,
                velocity: (velocityPxMs * 1000) / sceneRef.current.sheetShift,
              }),
          onUpdate: apply,
          onComplete: shouldOpen ? completeOpen : finishClose,
        });
      },
    });
    return () => setController(null);
  }, [apply, completeOpen, finishClose, prime, setController]);

  useEffect(
    () => () => {
      animRef.current?.stop();
      cancelAnimationFrame(revealRafRef.current);
    },
    [],
  );

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-[110]',
          open ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!active}
      >
        {active ? (
          <div className="h-[100dvh]">
            <Suspense fallback={null}>
              <FlyCatchGame embedded autoStart={open} onExit={requestClose} />
            </Suspense>
          </div>
        ) : null}
      </div>
      <div
        ref={chipRef}
        className="pointer-events-none fixed inset-x-0 top-0 z-[130] flex justify-center opacity-0"
        aria-hidden
      >
        <div className="flex items-center gap-1 rounded-full border border-white/50 bg-card/90 px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-primary shadow-md backdrop-blur-md">
          <ChevronDown
            className={cn('h-3.5 w-3.5', armed && 'animate-bounce')}
            strokeWidth={3}
          />
          {armed ? 'Release the swarm' : 'Pull down to play'}
        </div>
      </div>
    </>
  );
}
