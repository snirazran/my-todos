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
 *
 * One master exists per artwork variant (plain / premium), created lazily and
 * torn down once its last canvas detaches, so the premium companion fly gets
 * its own binding without every other fly on the page inheriting it — and
 * without costing anything on screens that show no premium fly.
 */

const MASTER_SIZE = 288;
// The premium companion fly renders at 26–46px and never appears at the sizes
// the catch/reward flies use, so its master rasterizes a quarter of the pixels.
const PREMIUM_MASTER_SIZE = 144;
// Grace period before a variant with no canvases left is destroyed, so a
// route change that unmounts and immediately remounts flies doesn't reload.
const TEARDOWN_DELAY_MS = 6000;
const FLY_STATE_MACHINE = 'State Machine 1';
const FLY_VIEW_MODEL = 'ViewModel1';
const FLY_VIEW_MODEL_INSTANCE = 'Instance';
const FLY_LIGHT_MODE_PROPERTY = 'light_mode';
const FLY_PREMIUM_PROPERTY = 'isPremium';
const FLY_WINGS_TRIGGER = 'wings';
const FLY_WINGS_IDLE_STATE = 'Wings_idle';
// ~2s at 60fps before we stop waiting for the master to rasterize real pixels.
const MAX_PAINT_PROBE_FRAMES = 120;
// Halving mip levels: blits pick the smallest level that still covers the
// target canvas, so no single drawImage downscales by more than ~2x (a big
// one-step downscale bypasses filtering and looks pixelated).
const MIP_SIZES = [144, 72, 36];
const PREMIUM_MIP_SIZES = [72, 36];

export type FlyVariant = 'default' | 'premium';

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

interface Master {
  variant: FlyVariant;
  size: number;
  mipSizes: number[];
  entries: Map<HTMLCanvasElement, Entry>;
  rive: Rive | null;
  canvas: HTMLCanvasElement | null;
  mips: Mip[];
  ready: boolean;
  painted: boolean;
  probeFrames: number;
  mipsValid: boolean;
  creating: boolean;
  lightMode: { value: number } | null;
  wings: { trigger: () => void } | null;
  teardownTimer: ReturnType<typeof setTimeout> | null;
}

function createMaster(variant: FlyVariant): Master {
  const premium = variant === 'premium';
  return {
    variant,
    size: premium ? PREMIUM_MASTER_SIZE : MASTER_SIZE,
    mipSizes: premium ? PREMIUM_MIP_SIZES : MIP_SIZES,
    entries: new Map(),
    rive: null,
    canvas: null,
    mips: [],
    ready: false,
    painted: false,
    probeFrames: 0,
    mipsValid: false,
    creating: false,
    lightMode: null,
    wings: null,
    teardownTimer: null,
  };
}

const masters: Record<FlyVariant, Master> = {
  default: createMaster('default'),
  premium: createMaster('premium'),
};

function forEachMaster(fn: (master: Master) => void) {
  fn(masters.default);
  fn(masters.premium);
}

let interactionPaused = false;
let themeObserver: MutationObserver | null = null;

// Marks every rasterized copy stale and advances the master once so a fresh
// frame is pushed to each canvas, even while a sheet/idle pause is holding
// playback. onAdvance pauses the master again once nobody needs frames.
function invalidateMaster(master: Master) {
  master.mipsValid = false;
  master.painted = false;
  master.probeFrames = 0;
  master.entries.forEach((entry) => {
    entry.hasFrame = false;
  });
  if (master.ready && master.rive) {
    // Forces the artboard dirty so Rive actually redraws the master bitmap
    // rather than short-circuiting on "nothing changed".
    master.wings?.trigger();
    if (!master.rive.isPlaying) master.rive.play();
  }
  syncMasterPlayback(master);
}

// Backgrounding the app (or memory pressure on iOS/WKWebView) drops canvas
// backing stores. Paused flies — the wallet counter in the header above all —
// only ever receive one blit, so without this they come back permanently
// blank until a reload.
function refreshAllFlies() {
  forEachMaster(invalidateMaster);
}

function syncFlyTheme(master: Master) {
  if (!master.lightMode || typeof document === 'undefined') return;
  // The fly asset intentionally maps light_mode=1 to its dark-theme artwork.
  const value = document.documentElement.classList.contains('dark') ? 1 : 0;
  master.lightMode.value = value;
  master.canvas?.setAttribute('data-light-mode', String(value));
  invalidateMaster(master);
}

function syncAllThemes() {
  forEachMaster(syncFlyTheme);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshAllFlies();
  });
  window.addEventListener('pageshow', refreshAllFlies);
}

function bindFlyViewModel(master: Master) {
  const rive = master.rive;
  if (!rive) return;
  const viewModel = rive.viewModelByName(FLY_VIEW_MODEL);
  const instance = viewModel?.instanceByName(FLY_VIEW_MODEL_INSTANCE);
  if (!instance) return;
  rive.bindViewModelInstance(instance);
  master.lightMode = instance.number(FLY_LIGHT_MODE_PROPERTY);
  master.wings = instance.trigger(FLY_WINGS_TRIGGER);
  const premium = instance.boolean(FLY_PREMIUM_PROPERTY);
  if (premium) premium.value = master.variant === 'premium';
  syncFlyTheme(master);
  master.wings?.trigger();
}

// The wings timeline is a one-shot: the state machine settles back on
// Wings_idle when it ends, so re-fire the trigger every time that state is
// re-entered to chain flaps into a continuous flying effect.
function onStateChange(master: Master, event: { data?: unknown }) {
  if (!Array.isArray(event.data)) return;
  if (event.data.includes(FLY_WINGS_IDLE_STATE)) master.wings?.trigger();
}

function observeTheme() {
  if (themeObserver || typeof document === 'undefined') return;
  themeObserver = new MutationObserver(syncAllThemes);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
}

useRiveInteractionPause.subscribe((state) => {
  const paused = state.count > 0;
  if (paused === interactionPaused) return;
  interactionPaused = paused;
  forEachMaster(syncMasterPlayback);
});

// The idle pause is a separate axis from ignoreInteractionPause: alwaysPlay
// bypasses the sheet/scroll pause, ignoreIdlePause bypasses "nobody has
// touched the app in a while" (focus-session flies that stay alive while the
// user is AFK watching the timer).
let idlePaused = false;
useRiveIdlePause.subscribe((state) => {
  if (state.idle === idlePaused) return;
  idlePaused = state.idle;
  forEachMaster(syncMasterPlayback);
});

function entryNeedsFrames(e: Entry) {
  return (
    (e.playing &&
      (!idlePaused || e.ignoreIdlePause) &&
      (!interactionPaused || e.ignoreInteractionPause)) ||
    !e.hasFrame
  );
}

function syncMasterPlayback(master: Master) {
  const rive = master.rive;
  if (!rive || !master.ready) return;
  let needed = false;
  master.entries.forEach((e) => {
    if (entryNeedsFrames(e)) needed = true;
  });
  if (needed) {
    if (!rive.isPlaying) {
      rive.play();
      master.wings?.trigger();
    }
  } else if (rive.isPlaying) {
    rive.pause();
  }
}

function updateMips(master: Master) {
  if (!master.canvas) return;
  let src: HTMLCanvasElement = master.canvas;
  for (const mip of master.mips) {
    mip.ctx.clearRect(0, 0, mip.size, mip.size);
    mip.ctx.drawImage(src, 0, 0, mip.size, mip.size);
    src = mip.canvas;
  }
}

function sourceFor(master: Master, target: number): HTMLCanvasElement | null {
  if (!master.canvas) return null;
  let src: HTMLCanvasElement = master.canvas;
  for (const mip of master.mips) {
    if (mip.size < target) break;
    src = mip.canvas;
  }
  return src;
}

// Rive fires Advance even on frames it skipped drawing (its ResizeObserver
// hasn't reported a layout box yet, or the artboard reported no dirt), so the
// master bitmap can still be empty right after load. Copying that blank frame
// would mark a paused fly "has a frame" and it would never ask for another —
// the wallet counter in the header stayed empty until a remount. Probing the
// smallest mip once tells us when real artwork exists; until then nobody
// latches, so the master keeps advancing.
function masterHasPaint(master: Master) {
  if (master.painted) return true;
  const probe = master.mips[master.mips.length - 1];
  if (!probe) return false;
  const { data } = probe.ctx.getImageData(0, 0, probe.size, probe.size);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) {
      master.painted = true;
      master.probeFrames = 0;
      return true;
    }
  }
  // Bail out rather than spin the master forever if the artwork never lands
  // (broken export, wasm failure) — a blank fly beats a permanent 60fps loop.
  if (++master.probeFrames > MAX_PAINT_PROBE_FRAMES) {
    master.painted = true;
    return true;
  }
  return false;
}

function blit(master: Master, e: Entry) {
  if (!master.mipsValid) {
    if (!master.ready) return;
    updateMips(master);
    master.mipsValid = true;
  }
  if (!masterHasPaint(master)) return;
  const src = sourceFor(master, Math.max(e.canvas.width, e.canvas.height));
  if (!src) return;
  e.ctx.clearRect(0, 0, e.canvas.width, e.canvas.height);
  e.ctx.imageSmoothingEnabled = true;
  e.ctx.imageSmoothingQuality = 'high';
  e.ctx.drawImage(src, 0, 0, e.canvas.width, e.canvas.height);
  e.hasFrame = true;
}

function onAdvance(master: Master) {
  updateMips(master);
  master.mipsValid = true;
  master.entries.forEach((e) => {
    if (entryNeedsFrames(e)) blit(master, e);
  });
  syncMasterPlayback(master);
}

function ensureMaster(master: Master) {
  if (master.teardownTimer) {
    clearTimeout(master.teardownTimer);
    master.teardownTimer = null;
  }
  if (master.rive || master.creating || typeof document === 'undefined') return;
  master.creating = true;
  const canvas = document.createElement('canvas');
  master.canvas = canvas;
  canvas.width = master.size;
  canvas.height = master.size;
  // Rive's internal ResizeObserver treats a canvas without a layout box as
  // 0x0 and skips every draw (while still emitting Advance), so the master
  // must live in the DOM with real dimensions — just visually hidden.
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('data-fly-variant', master.variant);
  canvas.addEventListener('contextlost', (event) => event.preventDefault());
  canvas.addEventListener('contextrestored', () => {
    if (master.canvas === canvas) invalidateMaster(master);
  });
  Object.assign(canvas.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: `${master.size}px`,
    height: `${master.size}px`,
    visibility: 'hidden',
    pointerEvents: 'none',
    zIndex: '-1',
  });
  document.body.appendChild(canvas);
  master.mips = master.mipSizes.map((size) => {
    const mipCanvas = document.createElement('canvas');
    mipCanvas.width = size;
    mipCanvas.height = size;
    const ctx = mipCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    return { canvas: mipCanvas, ctx, size };
  });
  preloadRiveAsset(FLY_RIVE_ASSET_URL).then((url) => {
    if (master.canvas !== canvas) return;
    master.rive = new Rive({
      src: url,
      canvas,
      stateMachines: FLY_STATE_MACHINE,
      autoplay: true,
      autoBind: false,
      shouldDisableRiveListeners: true,
      layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
      onLoad: () => {
        master.ready = true;
        bindFlyViewModel(master);
        observeTheme();
        master.rive!.on(EventType.Advance, () => onAdvance(master));
        master.rive!.on(EventType.StateChange, (event) =>
          onStateChange(master, event),
        );
        syncMasterPlayback(master);
      },
    });
  });
}

function destroyMaster(master: Master) {
  master.teardownTimer = null;
  if (master.entries.size > 0) return;
  master.rive?.cleanup();
  master.canvas?.remove();
  master.rive = null;
  master.canvas = null;
  master.mips = [];
  master.ready = false;
  master.painted = false;
  master.probeFrames = 0;
  master.mipsValid = false;
  master.creating = false;
  master.lightMode = null;
  master.wings = null;
}

// A variant with no canvases left holds an artboard, a state machine and a
// backing bitmap for nothing. Dropping it after a grace period keeps the
// premium master's cost scoped to screens that actually show a Plus frog,
// while surviving the unmount/remount churn of a route change.
function scheduleTeardown(master: Master) {
  if (master.entries.size > 0 || master.teardownTimer) return;
  master.teardownTimer = setTimeout(
    () => destroyMaster(master),
    TEARDOWN_DELAY_MS,
  );
}

export function attachFlyCanvas(
  canvas: HTMLCanvasElement,
  opts?: {
    ignoreInteractionPause?: boolean;
    ignoreIdlePause?: boolean;
    variant?: FlyVariant;
  },
): FlyCanvasHandle | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const master = masters[opts?.variant ?? 'default'];
  const entry: Entry = {
    canvas,
    ctx,
    playing: false,
    hasFrame: false,
    ignoreInteractionPause: opts?.ignoreInteractionPause ?? false,
    ignoreIdlePause: opts?.ignoreIdlePause ?? false,
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    entry.hasFrame = false;
  };
  const onContextRestored = () => invalidateMaster(master);
  canvas.addEventListener('contextlost', onContextLost);
  canvas.addEventListener('contextrestored', onContextRestored);
  master.entries.set(canvas, entry);
  ensureMaster(master);
  if (master.ready) blit(master, entry);
  syncMasterPlayback(master);
  return {
    setPlaying(playing) {
      if (entry.playing === playing) return;
      entry.playing = playing;
      syncMasterPlayback(master);
    },
    redraw() {
      entry.hasFrame = false;
      if (master.ready) blit(master, entry);
      syncMasterPlayback(master);
    },
    detach() {
      canvas.removeEventListener('contextlost', onContextLost);
      canvas.removeEventListener('contextrestored', onContextRestored);
      master.entries.delete(canvas);
      syncMasterPlayback(master);
      scheduleTeardown(master);
    },
  };
}
