import { create } from 'zustand';

/**
 * Global "nobody is touching the app" flag. After a stretch without any user
 * input every Rive surface freezes — including `alwaysPlay` ones, which only
 * bypass the sheet/scroll pause, not this — and the first touch wakes them
 * all. Continuous 60fps canvas rendering is the app's dominant battery and
 * thermal cost, and an untouched screen doesn't need it.
 */
interface RiveIdlePauseStore {
  idle: boolean;
}

export const useRiveIdlePause = create<RiveIdlePauseStore>(() => ({
  idle: false,
}));

export const setRiveIdle = (idle: boolean) => {
  if (useRiveIdlePause.getState().idle !== idle) {
    useRiveIdlePause.setState({ idle });
  }
};
