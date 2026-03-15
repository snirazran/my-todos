export type TimerSound = 'bell' | 'chime' | 'digital' | 'none';

export function playTimerSound(sound: TimerSound) {
  if (sound === 'none') return;
  try {
    const ctx = new AudioContext();

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
