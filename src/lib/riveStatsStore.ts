import { create } from 'zustand';

interface RiveInstanceStats {
  id: string;
  isPlaying: boolean;
  isPaused: boolean;
}

interface RiveStatsState {
  instances: Record<string, RiveInstanceStats>;
  registerInstance: (id: string) => void;
  unregisterInstance: (id: string) => void;
  updateInstance: (id: string, stats: Partial<RiveInstanceStats>) => void;
  getStats: () => {
    total: number;
    playing: number;
    paused: number;
  };
}

export const useRiveStatsStore = create<RiveStatsState>((set, get) => ({
  instances: {},
  registerInstance: (id) =>
    set((state) => ({
      instances: {
        ...state.instances,
        [id]: { id, isPlaying: false, isPaused: false },
      },
    })),
  unregisterInstance: (id) =>
    set((state) => {
      const newInstances = { ...state.instances };
      delete newInstances[id];
      return { instances: newInstances };
    }),
  updateInstance: (id, stats) =>
    set((state) => {
      // If the instance doesn't exist anymore, don't re-create it
      if (!state.instances[id]) return state;
      
      return {
        instances: {
          ...state.instances,
          [id]: { ...state.instances[id], ...stats },
        },
      };
    }),
  resetStats: () => set({ instances: {} }),
  getStats: () => {
    const instances = Object.values(get().instances);
    return {
      total: instances.length,
      playing: instances.filter((i) => i.isPlaying).length,
      paused: instances.filter((i) => i.isPaused).length,
    };
  },
}));
