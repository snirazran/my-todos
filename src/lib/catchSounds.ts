import { create } from 'zustand';

const GULP_URL = '/gulp.wav';

let ctxRef: AudioContext | null = null;
let gulpBuffer: AudioBuffer | null = null;
let gulpRequested = false;
let noiseBuffer: AudioBuffer | null = null;

const STORAGE_KEY = 'frogress.catchSounds';

function readStoredEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

interface CatchSoundsStore {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useCatchSoundsStore = create<CatchSoundsStore>((set) => ({
  enabled: readStoredEnabled(),
  setEnabled: (enabled) => {
    set({ enabled });
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
  },
}));

export function useCatchSoundsEnabled() {
  return useCatchSoundsStore((s) => s.enabled);
}

export function setCatchSoundsEnabled(enabled: boolean) {
  useCatchSoundsStore.getState().setEnabled(enabled);
}

export function catchSoundsEnabled(): boolean {
  return useCatchSoundsStore.getState().enabled;
}

function getCtx(): AudioContext | null {
  try {
    type WindowWithWebkit = Window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor =
      window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctxRef) ctxRef = new Ctor();
    if (ctxRef.state === 'suspended') void ctxRef.resume();
    return ctxRef;
  } catch {
    return null;
  }
}

export function primeCatchSounds() {
  const ctx = getCtx();
  if (!ctx || gulpBuffer || gulpRequested) return;
  gulpRequested = true;
  void fetch(GULP_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${GULP_URL}`);
      return res.arrayBuffer();
    })
    .then((data) => ctx.decodeAudioData(data))
    .then((buf) => {
      gulpBuffer = buf;
    })
    .catch(() => {
      gulpRequested = false;
    });
}

const semitone = (n: number) => Math.pow(2, n / 12);

function getNoise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 0.1);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

export function playThwip() {
  if (!catchSoundsEnabled()) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = getNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(350, now);
    bp.frequency.exponentialRampToValueAtTime(2200, now + 0.07);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    src.connect(bp).connect(gain).connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.1);
  } catch {
    // ignore
  }
}

export function playPop(combo = 0) {
  if (!catchSoundsEnabled()) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const pitch = semitone(Math.min(combo, 4) * 2);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(560 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(210 * pitch, now + 0.07);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.26, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);

    const click = ctx.createBufferSource();
    click.buffer = getNoise(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const cGain = ctx.createGain();
    cGain.gain.setValueAtTime(0.08, now);
    cGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    click.connect(hp).connect(cGain).connect(ctx.destination);
    click.start(now);
    click.stop(now + 0.035);
  } catch {
    // ignore
  }
}

export function playGulp(combo = 0, golden = false) {
  if (!catchSoundsEnabled()) return;
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const pitch = semitone(Math.min(combo, 4) * 2);

    if (gulpBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = gulpBuffer;
      src.playbackRate.value = pitch;
      const gain = ctx.createGain();
      gain.gain.value = 0.8;
      src.connect(gain).connect(ctx.destination);
      src.start(now);
    } else {
      primeCatchSounds();
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(230 * pitch, now);
      osc.frequency.exponentialRampToValueAtTime(85 * pitch, now + 0.16);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    }

    if (golden) {
      const notes: Array<[number, number]> = [
        [1318.5, 0.05],
        [1568, 0.13],
        [1975.5, 0.21],
      ];
      for (const [freq, offset] of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + offset);
        gain.gain.setValueAtTime(0.001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.14, now + offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.25);
      }
    }
  } catch {
    // ignore
  }
}
