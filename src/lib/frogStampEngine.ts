import {
  Alignment,
  Fit,
  Layout,
  Rive,
  RiveFile,
} from '@rive-app/react-canvas-lite';
import { preloadRiveAsset } from './riveLoader';

/**
 * Shared "stamper" for static frog previews (wardrobe/shop/trade grids).
 *
 * A paused preview never animates, so it doesn't need a live Rive instance.
 * The engine keeps one parsed RiveFile and, per queued preview, spins up a
 * short-lived Rive instance on a hidden canvas: apply the preview's wardrobe
 * indices, advance a few frames from t=0 so every stamp freezes at the same
 * early idle-loop pose, copy the frame onto the preview's plain canvas, then
 * clean the instance up. Dozens of persistent artboard/state-machine
 * instances collapse into zero.
 */

const MASTER_CSS_SIZE = 360;
const MAX_MASTER_DIM = 512;
const SETTLE_FRAMES = 2;
const ARTBOARD_WIDTH = 128;
const ARTBOARD_HEIGHT = 144;

export type FrogStampIndices = Partial<
  Record<'skin' | 'mood' | 'hat' | 'body' | 'hand_item', number>
>;

const VM_NAMES: Record<keyof FrogStampIndices, string> = {
  skin: 'skin',
  mood: 'mood',
  hat: 'hat',
  body: 'body',
  hand_item: 'handItem',
};
const INPUT_NAMES: Record<keyof FrogStampIndices, string> = {
  skin: 'skin',
  mood: 'mood',
  hat: 'hat',
  body: 'body',
  hand_item: 'hand_item',
};
const SLOTS = Object.keys(VM_NAMES) as (keyof FrogStampIndices)[];

interface Job {
  indices: FrogStampIndices;
  canvas: HTMLCanvasElement;
  cancelled: boolean;
}

const queue: Job[] = [];
let masterCanvas: HTMLCanvasElement | null = null;
let riveFile: RiveFile | null = null;
let fileReady = false;
let creating = false;
let current: Job | null = null;

function applyIndices(stamper: Rive, indices: FrogStampIndices) {
  const vmi = stamper.viewModelInstance;
  let inputs: { name: string; value: unknown }[] = [];
  try {
    inputs = (stamper.stateMachineInputs('State Machine 1') ?? []) as {
      name: string;
      value: unknown;
    }[];
  } catch {
    inputs = [];
  }
  for (const slot of SLOTS) {
    const value = indices[slot] ?? 0;
    try {
      const num = vmi?.number(VM_NAMES[slot]);
      if (num) num.value = value;
    } catch {
      /* view model not present in this .riv */
    }
    const input = inputs.find((i) => i.name === INPUT_NAMES[slot]);
    if (input) input.value = value;
  }
}

function stamp(job: Job) {
  if (job.cancelled || !masterCanvas) return;
  const target = job.canvas;
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, target.width, target.height);
  if (
    masterCanvas.width === target.width &&
    masterCanvas.height === target.height
  ) {
    ctx.drawImage(masterCanvas, 0, 0);
    return;
  }
  // Fallback (target resized between request and stamp): map the artboard's
  // drawn region out of the master (Fit.Contain) and contain-fit it into the
  // target, reproducing what a live Frog canvas of that size would draw.
  const masterScale = Math.min(
    masterCanvas.width / ARTBOARD_WIDTH,
    masterCanvas.height / ARTBOARD_HEIGHT,
  );
  const sw = ARTBOARD_WIDTH * masterScale;
  const sh = ARTBOARD_HEIGHT * masterScale;
  const sx = (masterCanvas.width - sw) / 2;
  const sy = (masterCanvas.height - sh) / 2;
  const targetScale = Math.min(
    target.width / ARTBOARD_WIDTH,
    target.height / ARTBOARD_HEIGHT,
  );
  const dw = ARTBOARD_WIDTH * targetScale;
  const dh = ARTBOARD_HEIGHT * targetScale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    masterCanvas,
    sx,
    sy,
    sw,
    sh,
    (target.width - dw) / 2,
    (target.height - dh) / 2,
    dw,
    dh,
  );
}

function finishJob(stamper: Rive) {
  if (current) stamp(current);
  // Runs inside the Advance event — still within Rive's draw loop. cleanup()
  // must not destroy the instances the in-flight draw call is using, so hop
  // out of the loop first. `current` stays held until then so no new job can
  // resize the master canvas under a not-yet-cleaned instance.
  setTimeout(() => {
    try {
      stamper.cleanup();
    } catch {
      /* already cleaned */
    }
    current = null;
    processNext();
  }, 0);
}

function processNext() {
  if (!fileReady || !riveFile || !masterCanvas || current) return;
  let job: Job | undefined;
  do {
    job = queue.shift();
  } while (job?.cancelled);
  if (!job) return;
  current = job;
  // Render the master at the target's exact backing size so the vector art
  // rasterizes at native display resolution and the stamp is a 1:1 copy — no
  // rescaling, so every preview is as sharp as a live canvas.
  masterCanvas.width = Math.max(
    1,
    Math.min(job.canvas.width, MAX_MASTER_DIM),
  );
  masterCanvas.height = Math.max(
    1,
    Math.min(job.canvas.height, MAX_MASTER_DIM),
  );
  const indices = job.indices;
  let framesLeft = SETTLE_FRAMES;
  let finished = false;
  const stamper: Rive = new Rive({
    riveFile,
    canvas: masterCanvas,
    artboard: 'main',
    stateMachines: 'State Machine 1',
    autoplay: true,
    autoBind: true,
    shouldDisableRiveListeners: true,
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    onLoad: () => {
      applyIndices(stamper, indices);
    },
    onLoadError: (e) => {
      console.error('[stamp] instance load error', e);
      current = null;
      setTimeout(processNext, 0);
    },
    onAdvance: () => {
      if (finished || !current) return;
      if (framesLeft === SETTLE_FRAMES) applyIndices(stamper, indices);
      framesLeft -= 1;
      if (framesLeft <= 0) {
        finished = true;
        stamper.pause();
        finishJob(stamper);
      }
    },
  });
}

function ensureEngine() {
  if (creating || typeof document === 'undefined') return;
  creating = true;
  masterCanvas = document.createElement('canvas');
  masterCanvas.width = MASTER_CSS_SIZE;
  masterCanvas.height = MASTER_CSS_SIZE;
  // Rive's internal ResizeObserver treats a canvas without a layout box as
  // 0x0 and skips every draw, so the canvas must live in the DOM with real
  // dimensions — just visually hidden.
  masterCanvas.setAttribute('aria-hidden', 'true');
  Object.assign(masterCanvas.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: `${MASTER_CSS_SIZE}px`,
    height: `${MASTER_CSS_SIZE}px`,
    visibility: 'hidden',
    pointerEvents: 'none',
    zIndex: '-1',
  });
  document.body.appendChild(masterCanvas);
  preloadRiveAsset('/frog_idle.riv').then((url) => {
    const file = new RiveFile({ src: url });
    riveFile = file;
    file
      .init()
      .then(() => {
        // Pin one reference so per-stamp instance cleanup() (which decrements
        // the file's refcount) can never drop it to zero and destroy the file.
        file.getInstance();
        fileReady = true;
        processNext();
      })
      .catch((e) => {
        console.error('[stamp] file load error', e);
      });
  });
}

export function requestFrogStamp(
  canvas: HTMLCanvasElement,
  indices: FrogStampIndices,
): () => void {
  const job: Job = { canvas, indices, cancelled: false };
  queue.push(job);
  ensureEngine();
  processNext();
  return () => {
    job.cancelled = true;
  };
}
