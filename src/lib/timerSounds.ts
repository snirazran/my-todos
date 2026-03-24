export type TimerSound = 'bell' | 'chime' | 'digital' | 'none';

// Shared AudioContext — reused across calls so mobile browsers
// don't block it after the first user-gesture unlock.
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = new AudioContext();
  }
  // Mobile browsers suspend the context until a user gesture resumes it
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume();
  }
  return sharedCtx;
}

// Call this once on any user interaction (tap/click) to unlock audio on mobile.
// Safe to call multiple times — it's a no-op if already running.
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
}

// Duration of each sound type (seconds) + a small gap
const SOUND_DURATIONS: Record<string, number> = {
  bell: 2.5,
  chime: 2.2,
  digital: 0.7,
};

// Plays the sound up to 3 times, stops on any user interaction.
// Returns a cleanup function.
export function playTimerSoundLooped(sound: TimerSound): () => void {
  if (sound === 'none') return () => {};

  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    cancelled = true;
    if (timeoutId) clearTimeout(timeoutId);
    document.removeEventListener('click', stop, true);
    document.removeEventListener('touchstart', stop, true);
    document.removeEventListener('keydown', stop, true);
  };

  // Stop on any user interaction
  document.addEventListener('click', stop, { once: true, capture: true });
  document.addEventListener('touchstart', stop, { once: true, capture: true });
  document.addEventListener('keydown', stop, { once: true, capture: true });

  const duration = (SOUND_DURATIONS[sound] || 2) * 1000;
  let count = 0;

  const playNext = () => {
    if (cancelled || count >= 3) {
      stop();
      return;
    }
    playTimerSound(sound);
    count++;
    if (count < 3) {
      timeoutId = setTimeout(playNext, duration);
    }
  };

  playNext();
  return stop;
}

export function playTimerSound(sound: TimerSound) {
  if (sound === 'none') return;
  try {
    const ctx = getAudioContext();

    if (sound === 'bell') {
      // Single resonant bell with decay
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 1.2);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 2.2);
    } else if (sound === 'chime') {
      // Three ascending chime tones
      const tones: [number, number][] = [[1047, 0], [1319, 0.28], [1568, 0.56]];
      for (const [freq, delay] of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 1.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 1.4);
      }
    } else if (sound === 'digital') {
      // Three short electronic beeps
      const beeps: [number, number, number][] = [[880, 0, 0.09], [880, 0.13, 0.22], [1047, 0.26, 0.38]];
      for (const [freq, start, end] of beeps) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.25, ctx.currentTime + start);
        gain.gain.setValueAtTime(0, ctx.currentTime + end);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + end + 0.01);
      }
    }
  } catch {
    // Silently ignore — browser may block audio without user interaction
  }
}
