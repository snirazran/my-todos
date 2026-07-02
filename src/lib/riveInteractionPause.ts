import { create } from 'zustand';

/**
 * Global count of in-flight, perf-sensitive interactions (board scroll/pan,
 * card drag). While count > 0, ambient Rive playback is frozen so the main
 * thread is free for the interaction; playback resumes when it drops to 0.
 */
interface RiveInteractionPauseStore {
  count: number;
  acquire: () => void;
  release: () => void;
}

export const useRiveInteractionPause = create<RiveInteractionPauseStore>(
  (set) => ({
    count: 0,
    acquire: () => set((s) => ({ count: s.count + 1 })),
    release: () => set((s) => ({ count: Math.max(0, s.count - 1) })),
  }),
);
