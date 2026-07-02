import {
  Alignment,
  EventType,
  Fit,
  Layout,
  Rive,
} from '@rive-app/react-canvas-lite';
import { preloadRiveAsset } from './riveLoader';
import { useRiveInteractionPause } from './riveInteractionPause';

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

useRiveInteractionPause.subscribe((state) => {
  const paused = state.count > 0;
  if (paused === interactionPaused) return;
  interactionPaused = paused;
  syncMasterPlayback();
});

function entryNeedsFrames(e: Entry) {
  return (e.playing && !interactionPaused) || !e.hasFrame;
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
  preloadRiveAsset('/fly_idle.riv').then((url) => {
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
        master!.on(EventType.Advance, onAdvance);
        syncMasterPlayback();
      },
    });
  });
}

export function attachFlyCanvas(
  canvas: HTMLCanvasElement,
): FlyCanvasHandle | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const entry: Entry = { canvas, ctx, playing: false, hasFrame: false };
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
