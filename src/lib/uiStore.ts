import { create } from 'zustand';

interface UIState {
  isWardrobeOpen: boolean;
  openWardrobe: () => void;
  closeWardrobe: () => void;
  toggleWardrobe: () => void;
  setWardrobeOpen: (open: boolean) => void;

  isQuestsOpen: boolean;
  openQuests: () => void;
  closeQuests: () => void;
  setQuestsOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isWardrobeOpen: false,
  openWardrobe: () => set({ isWardrobeOpen: true }),
  closeWardrobe: () => set({ isWardrobeOpen: false }),
  toggleWardrobe: () => set((state) => ({ isWardrobeOpen: !state.isWardrobeOpen })),
  setWardrobeOpen: (open: boolean) => set({ isWardrobeOpen: open }),

  isQuestsOpen: false,
  openQuests: () => set({ isQuestsOpen: true }),
  closeQuests: () => set({ isQuestsOpen: false }),
  setQuestsOpen: (open: boolean) => set({ isQuestsOpen: open }),
}));
