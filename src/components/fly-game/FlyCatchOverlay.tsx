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
const NAV_Z_RAISED = '125';
const BANNER_DISSOLVE_END = 0.28;
const BANNER_DISSOLVE_SCALE = 0.05;

const smooth = (p: number, from: number, to: number) => {
  const t = Math.min(1, Math.max(0, (p - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

type ChipSlot = {
  left: number;
  width: number;
  height: number;
  /** Fixed viewport top, or null to track the sheet as it slides. */
  top: number | null;
};

const CHIP_FALLBACK_WIDTH = 340;
const CHIP_FALLBACK_HEIGHT = 50;

type Scene = {
  shell: HTMLElement | null;
  launcher: HTMLElement | null;
  nav: HTMLElement | null;
  sheet: HTMLElement | null;
  sheetTop: number;
  sheetShift: number;
  hero: HTMLElement | null;
  heroBaseTransform: string;
  heroCard: HTMLElement | null;
  chipSlot: ChipSlot | null;
  heroFrogRect: DOMRect | null;
  heroRect: DOMRect | null;
  fades: HTMLElement[];
  pageBg: HTMLElement | null;
  pageBgFade: HTMLElement | null;
  curtainTop: number;
  curtainShift: number;
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
  heroBaseTransform: '',
  heroCard: null,
  chipSlot: null,
  heroFrogRect: null,
  heroRect: null,
  fades: [],
  pageBg: null,
  pageBgFade: null,
  curtainTop: 0,
  curtainShift: 480,
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
  const curtainRef = useRef<HTMLDivElement>(null);
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
    scene.pageBgFade =
      scene.pageBg?.querySelector<HTMLElement>('[data-fly-page-bg-fade]') ??
      null;
    scene.fades = Array.from(
      document.querySelectorAll<HTMLElement>('[data-fly-fade]'),
    );
    if (scene.sheet) {
      const rect = scene.sheet.getBoundingClientRect();
      scene.sheetTop = rect.top;
      scene.sheetShift = Math.max(240, window.innerHeight - rect.top + 24);
    }
    scene.curtainTop = Math.max(
      0,
      scene.pageBg?.getBoundingClientRect().bottom ?? 0,
    );
    scene.curtainShift = Math.max(
      240,
      window.innerHeight - scene.curtainTop + 24,
    );
    if (curtainRef.current) {
      curtainRef.current.style.top = `${scene.curtainTop}px`;
      curtainRef.current.style.transform = 'translate3d(0, 0, 0)';
      curtainRef.current.style.willChange = 'transform';
      curtainRef.current.style.display = 'block';
    }
    if (scene.pageBg) {
      scene.pageBg.style.transformOrigin = '50% 100%';
      scene.pageBg.style.willChange = 'opacity, transform';
    }
    if (scene.sheet) scene.sheet.style.willChange = 'transform';
    if (scene.hero) scene.hero.style.willChange = 'transform';
    if (scene.nav) {
      scene.nav.style.zIndex = NAV_Z_RAISED;
      scene.nav.style.willChange = 'transform';
    }
    if (scene.heroCard) {
      const rect = scene.heroCard.getBoundingClientRect();
      scene.chipSlot = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    } else {
      const width = Math.min(CHIP_FALLBACK_WIDTH, window.innerWidth * 0.94);
      scene.chipSlot = {
        left: (window.innerWidth - width) / 2,
        top: null,
        width,
        height: CHIP_FALLBACK_HEIGHT,
      };
    }
    if (scene.hero) {
      const base = getComputedStyle(scene.hero).transform;
      scene.heroBaseTransform = base && base !== 'none' ? `${base} ` : '';
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
        scene.hero.style.transform = `${scene.heroBaseTransform}translate3d(${(dx * p).toFixed(2)}px, ${(dy * p).toFixed(2)}px, 0) scale(${(1 + (scale - 1) * p).toFixed(4)})`;
      }
      if (scene.heroCard) {
        scene.heroCard.style.opacity = Math.max(0, 1 - p * 3.5).toFixed(3);
      }
      for (const el of scene.fades) {
        el.style.opacity = Math.max(0, 1 - p * 2.5).toFixed(3);
      }
      if (curtainRef.current) {
        curtainRef.current.style.transform = `translate3d(0, ${(p * scene.curtainShift).toFixed(2)}px, 0)`;
      }
      if (scene.pageBg) {
        const dissolve = smooth(p, 0, BANNER_DISSOLVE_END);
        scene.pageBg.style.opacity = scene.gameBg
          ? (1 - dissolve).toFixed(3)
          : '1';
        scene.pageBg.style.transform = `scale(${(1 + BANNER_DISSOLVE_SCALE * dissolve).toFixed(4)})`;
      }
      if (scene.pageBgFade) {
        scene.pageBgFade.style.opacity = (1 - smooth(p, 0, 0.06)).toFixed(3);
      }
      if (scene.nav) {
        scene.nav.style.transform =
          p > 0.001 ? `translate3d(0, ${(p * NAV_SHIFT).toFixed(2)}px, 0)` : '';
      }

      if (scene.gameBg) {
        scene.gameBg.style.opacity = '1';
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
        const slot = scene.chipSlot;
        chipRef.current.style.opacity = openRef.current
          ? '0'
          : smooth(p, 0.08, 0.32).toFixed(3);
        if (slot) {
          const top =
            slot.top ?? scene.sheetTop + p * scene.sheetShift - 54;
          chipRef.current.style.width = `${slot.width.toFixed(2)}px`;
          chipRef.current.style.height = `${slot.height.toFixed(2)}px`;
          chipRef.current.style.transform = `translate3d(${slot.left.toFixed(2)}px, ${top.toFixed(2)}px, 0)`;
        }
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
    if (scene.pageBg) {
      scene.pageBg.style.opacity = '';
      scene.pageBg.style.transform = '';
      scene.pageBg.style.transformOrigin = '';
      scene.pageBg.style.willChange = '';
    }
    if (scene.pageBgFade) scene.pageBgFade.style.opacity = '';
    if (scene.sheet) scene.sheet.style.willChange = '';
    if (scene.hero) scene.hero.style.willChange = '';
    if (scene.nav) {
      scene.nav.style.transform = '';
      scene.nav.style.zIndex = '';
      scene.nav.style.willChange = '';
    }
    if (scene.shell) scene.shell.style.zIndex = '';
    if (scene.launcher) scene.launcher.style.zIndex = '';
    if (curtainRef.current) {
      curtainRef.current.style.display = '';
      curtainRef.current.style.transform = '';
      curtainRef.current.style.willChange = '';
    }
    if (chipRef.current) {
      chipRef.current.style.opacity = '0';
      chipRef.current.style.width = '';
      chipRef.current.style.height = '';
      chipRef.current.style.transform = '';
    }
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
      if (curtainRef.current) {
        curtainRef.current.style.display = '';
        curtainRef.current.style.willChange = '';
      }
    };
    reveal();
  }, [apply]);

  const animateClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    cancelAnimationFrame(revealRafRef.current);
    const scene = sceneRef.current;
    scene.nav = document.querySelector<HTMLElement>('[data-app-bottom-nav]');
    if (scene.nav) scene.nav.style.zIndex = NAV_Z_RAISED;
    if (curtainRef.current) {
      curtainRef.current.style.willChange = 'transform';
      curtainRef.current.style.display = 'block';
    }
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
        ref={curtainRef}
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[115] hidden h-[100dvh] bg-background"
      />
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
        className="pointer-events-none fixed left-0 top-0 z-[118] flex items-center justify-center opacity-0"
        aria-hidden
      >
        <div className="flex h-full w-full items-center justify-center gap-1.5 rounded-[18px] border border-border/50 bg-card/80 px-4 text-[11px] font-black uppercase tracking-[0.12em] text-primary shadow-sm backdrop-blur-2xl">
          <ChevronDown
            className={cn('h-4 w-4', armed && 'animate-bounce')}
            strokeWidth={3}
          />
          {armed ? 'Release the swarm' : 'Pull down to play'}
        </div>
      </div>
    </>
  );
}
