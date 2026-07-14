import {
  Alignment,
  EventType,
  Fit,
  Layout,
  Rive,
} from '@rive-app/react-canvas-lite';
import { FLY_RIVE_ASSET_URL, preloadRiveAsset } from './riveLoader';
import { useRiveInteractionPause } from './riveInteractionPause';
import { useRiveIdlePause } from './riveIdlePause';

/**
 * Shared renderer for the idle fly.
 *
 * Every fly on screen is the same looping animation, so instead of one Rive
 * instance (artboard + state machine + per-frame vector rasterization) per
 * fly, a single hidden "master" instance advances and rasterizes the artwork
 * once per frame, and each visible fly canvas receives a cheap `drawImage`
 * bitmap copy. The master pauses itself whenever no subscriber needs frames.
 */

const MASTER_SIZE = 288;
const FLY_VIEW_MODEL = 'ViewModel1';
const FLY_VIEW_MODEL_INSTANCE = 'Instance';
const FLY_LIGHT_MODE_PROPERTY = 'light_mode';
// Halving mip levels: blits pick the smallest level that still covers the
// target canvas, so no single drawImage downscales by more than ~2x (a big
// one-step downscale bypasses filtering and looks pixelated).
const MIP_SIZES = [144, 72, 36];

export interface FlyCanvasHandle {
  setPlaying: (playing: boolean) => void;
  redraw: () => void;
  detach: () => void;
}

interface Entry {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  playing: boolean;
  hasFrame: boolean;
  ignoreInteractionPause: boolean;
  ignoreIdlePause: boolean;
}

interface Mip {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  size: number;
}

const entries = new Map<HTMLCanvasElement, Entry>();
let master: Rive | null = null;
let masterCanvas: HTMLCanvasElement | null = null;
let mips: Mip[] = [];
let masterReady = false;
let mipsValid = false;
let creating = false;
let interactionPaused = false;
let themeObserver: MutationObserver | null = null;
let flyLightMode: { value: number } | null = null;

function syncFlyTheme() {
  if (!flyLightMode || typeof document === 'undefined') return;
  // The fly asset intentionally maps light_mode=1 to its dark-theme artwork.
  const value = document.documentElement.classList.contains('dark') ? 1 : 0;
  flyLightMode.value = value;
  masterCanvas?.setAttribute('data-light-mode', String(value));

  // Theme changes can happen while an open sheet globally pauses Rive. Mark
  // every copy stale and advance the master once so the new binding paints
  // immediately; onAdvance will pause it again when no continuous frames are
  // needed.
  mipsValid = false;
  entries.forEach((entry) => {
    entry.hasFrame = false;
  });
  if (master && !master.isPlaying) master.play();
}

function bindFlyTheme() {
  if (!master) return;
  const viewModel = master.viewModelByName(FLY_VIEW_MODEL);
  const instance = viewModel?.instanceByName(FLY_VIEW_MODEL_INSTANCE);
  if (!instance) return;
  master.bindViewModelInstance(instance);
  flyLightMode = instance.number(FLY_LIGHT_MODE_PROPERTY);
  syncFlyTheme();
}

function observeTheme() {
  if (themeObserver || typeof document === 'undefined') return;
  themeObserver = new MutationObserver(syncFlyTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
}

useRiveInteractionPause.subscribe((state) => {
  const paused = state.count > 0;
  if (paused === interactionPaused) return;
  interactionPaused = paused;
  syncMasterPlayback();
});

// The idle pause is a separate axis from ignoreInteractionPause: alwaysPlay
// bypasses the sheet/scroll pause, ignoreIdlePause bypasses "nobody has
// touched the app in a while" (focus-session flies that stay alive while the
// user is AFK watching the timer).
let idlePaused = false;
useRiveIdlePause.subscribe((state) => {
  if (state.idle === idlePaused) return;
  idlePaused = state.idle;
  syncMasterPlayback();
});

function entryNeedsFrames(e: Entry) {
  return (
    (e.playing &&
      (!idlePaused || e.ignoreIdlePause) &&
      (!interactionPaused || e.ignoreInteractionPause)) ||
    !e.hasFrame
  );
}

function syncMasterPlayback() {
  if (!master || !masterReady) return;
  let needed = false;
  entries.forEach((e) => {
    if (entryNeedsFrames(e)) needed = true;
  });
  if (needed) {
    if (!master.isPlaying) master.play();
  } else if (master.isPlaying) {
    master.pause();
  }
}

function updateMips() {
  if (!masterCanvas) return;
  let src: HTMLCanvasElement = masterCanvas;
  for (const mip of mips) {
    mip.ctx.clearRect(0, 0, mip.size, mip.size);
    mip.ctx.drawImage(src, 0, 0, mip.size, mip.size);
    src = mip.canvas;
  }
}

function sourceFor(target: number): HTMLCanvasElement | null {
  if (!masterCanvas) return null;
  let src: HTMLCanvasElement = masterCanvas;
  for (const mip of mips) {
    if (mip.size < target) break;
    src = mip.canvas;
  }
  return src;
}

function blit(e: Entry) {
  if (!mipsValid) return;
  const src = sourceFor(Math.max(e.canvas.width, e.canvas.height));
  if (!src) return;
  e.ctx.clearRect(0, 0, e.canvas.width, e.canvas.height);
  e.ctx.imageSmoothingEnabled = true;
  e.ctx.imageSmoothingQuality = 'high';
  e.ctx.drawImage(src, 0, 0, e.canvas.width, e.canvas.height);
  e.hasFrame = true;
}

function onAdvance() {
  updateMips();
  mipsValid = true;
  entries.forEach((e) => {
    if (entryNeedsFrames(e)) blit(e);
  });
  syncMasterPlayback();
}

function ensureMaster() {
  if (master || creating || typeof document === 'undefined') return;
  creating = true;
  masterCanvas = document.createElement('canvas');
  masterCanvas.width = MASTER_SIZE;
  masterCanvas.height = MASTER_SIZE;
  // Rive's internal ResizeObserver treats a canvas without a layout box as
  // 0x0 and skips every draw (while still emitting Advance), so the master
  // must live in the DOM with real dimensions — just visually hidden.
  masterCanvas.setAttribute('aria-hidden', 'true');
  Object.assign(masterCanvas.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: `${MASTER_SIZE}px`,
    height: `${MASTER_SIZE}px`,
    visibility: 'hidden',
    pointerEvents: 'none',
    zIndex: '-1',
  });
  document.body.appendChild(masterCanvas);
  mips = MIP_SIZES.map((size) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    return { canvas, ctx, size };
  });
  preloadRiveAsset(FLY_RIVE_ASSET_URL).then((url) => {
    master = new Rive({
      src: url,
      canvas: masterCanvas!,
      animations: ['Wings', 'Body'],
      autoplay: true,
      autoBind: false,
      shouldDisableRiveListeners: true,
      layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
      onLoad: () => {
        masterReady = true;
        bindFlyTheme();
        observeTheme();
        master!.on(EventType.Advance, onAdvance);
        syncMasterPlayback();
      },
    });
  });
}

export function attachFlyCanvas(
  canvas: HTMLCanvasElement,
  opts?: { ignoreInteractionPause?: boolean; ignoreIdlePause?: boolean },
): FlyCanvasHandle | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const entry: Entry = {
    canvas,
    ctx,
    playing: false,
    hasFrame: false,
    ignoreInteractionPause: opts?.ignoreInteractionPause ?? false,
    ignoreIdlePause: opts?.ignoreIdlePause ?? false,
  };
  entries.set(canvas, entry);
  ensureMaster();
  if (masterReady) blit(entry);
  syncMasterPlayback();
  return {
    setPlaying(playing) {
      if (entry.playing === playing) return;
      entry.playing = playing;
      syncMasterPlayback();
    },
    redraw() {
      entry.hasFrame = false;
      if (masterReady) blit(entry);
      syncMasterPlayback();
    },
    detach() {
      entries.delete(canvas);
      syncMasterPlayback();
    },
  };
}
