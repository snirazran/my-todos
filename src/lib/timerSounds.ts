export type TimerSound =
  | 'frog'
  | 'classic'
  | 'dreamscape'
  | 'lofi'
  | 'stardust'
  | 'none';

export interface TimerSoundOption {
  id: TimerSound;
  label: string;
  /** Public path to the audio file. Undefined for the silent option. */
  file?: string;
}

// The selectable alarms (files live in /public/alarms).
// Order matters — the default (Dreamscape) is first so it lands top-left.
export const TIMER_SOUNDS: TimerSoundOption[] = [
  {
    id: 'dreamscape',
    label: 'Dreamscape',
    file: '/alarms/lesiakower-dreamscape-alarm-clock-117680.mp3',
  },
  {
    id: 'frog',
    label: 'Frog',
    file: '/alarms/Frog Sound Effect.mp3',
  },
  {
    id: 'classic',
    label: 'Rise & Shine',
    file: '/alarms/freesound_community-alarm-clock-90867.mp3',
  },
  {
    id: 'lofi',
    label: 'Lo-Fi',
    file: '/alarms/lesiakower-lo-fi-alarm-clock-243766.mp3',
  },
  {
    id: 'stardust',
    label: 'Stardust',
    file: '/alarms/lesiakower-star-dust-alarm-clock-114194.mp3',
  },
  { id: 'none', label: 'Silent' },
];

const FILE_BY_ID: Record<string, string> = Object.fromEntries(
  TIMER_SOUNDS.filter((s) => s.file).map((s) => [s.id, s.file as string]),
);

// Map any legacy/unknown sound id onto a current one so old persisted
// settings still play something instead of falling silent.
export function normalizeTimerSound(sound: string | undefined | null): TimerSound {
  if (sound === 'none') return 'none';
  if (sound && sound in FILE_BY_ID) return sound as TimerSound;
  return 'dreamscape';
}

// Call this once on any user interaction (tap/click) to unlock audio on mobile.
// Priming a muted element during a gesture lets later programmatic plays work.
let unlocked = false;
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  try {
    const a = new Audio();
    a.muted = true;
    void a.play().catch(() => {});
    a.pause();
  } catch {
    // ignore — best effort
  }
}

// A short, cool two-note "blip" synthesised on the fly — used to mark an
// auto-started break beginning, instead of the long full-length alarm.
let beepCtx: AudioContext | null = null;
export function playTransitionBeep() {
  try {
    type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor =
      window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
    if (!Ctor) return;
    if (!beepCtx) beepCtx = new Ctor();
    const ctx = beepCtx;
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    // Two quick ascending notes (A5 → E6) with a soft attack/decay.
    const notes: Array<[number, number]> = [
      [880, 0],
      [1318.5, 0.12],
    ];
    for (const [freq, offset] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + offset);
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.35, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    }
  } catch {
    // ignore — best effort
  }
}

// Only one preview/finish sound plays at a time.
let currentAudio: HTMLAudioElement | null = null;

export function stopTimerSound() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
      // ignore
    }
    currentAudio = null;
  }
}

export function playTimerSound(sound: TimerSound, onEnded?: () => void) {
  stopTimerSound();
  if (sound === 'none') {
    onEnded?.();
    return;
  }
  const file = FILE_BY_ID[sound];
  if (!file) {
    onEnded?.();
    return;
  }
  try {
    const audio = new Audio(file);
    audio.volume = 0.85;
    currentAudio = audio;
    audio.addEventListener('ended', () => {
      if (currentAudio === audio) currentAudio = null;
      onEnded?.();
    });
    void audio.play().catch(() => {
      if (currentAudio === audio) currentAudio = null;
      onEnded?.();
    });
  } catch {
    if (currentAudio) currentAudio = null;
    onEnded?.();
  }
}

// Plays the finish sound on repeat until the returned cleanup is called.
// Used for the "session over" state, where the alarm should keep going until
// the user explicitly acknowledges it (clicks Done) — it does NOT stop on
// incidental clicks/taps.
export function playTimerSoundUntilStopped(sound: TimerSound): () => void {
  stopTimerSound();
  if (sound === 'none') return () => {};
  const file = FILE_BY_ID[sound];
  if (!file) return () => {};
  try {
    const audio = new Audio(file);
    audio.volume = 0.85;
    audio.loop = true;
    currentAudio = audio;
    void audio.play().catch(() => {});
  } catch {
    // ignore — best effort
  }
  return stopTimerSound;
}

// Plays the finish sound once and stops it on any user interaction.
// Returns a cleanup function.
export function playTimerSoundLooped(sound: TimerSound): () => void {
  if (sound === 'none') return () => {};

  const stop = () => {
    stopTimerSound();
    document.removeEventListener('click', stop, true);
    document.removeEventListener('touchstart', stop, true);
    document.removeEventListener('keydown', stop, true);
  };

  // Stop on any user interaction
  document.addEventListener('click', stop, { once: true, capture: true });
  document.addEventListener('touchstart', stop, { once: true, capture: true });
  document.addEventListener('keydown', stop, { once: true, capture: true });

  playTimerSound(sound, stop);
  return stop;
}
