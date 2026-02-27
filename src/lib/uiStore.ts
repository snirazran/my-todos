import { create } from 'zustand';

interface UIState {
  isWardrobeOpen: boolean;
  openWardrobe: () => void;
  closeWardrobe: () => void;
  toggleWardrobe: () => void;
  setWardrobeOpen: (open: boolean) => void;

  isGiftHubOpen: boolean;
  openGiftHub: () => void;
  closeGiftHub: () => void;
  setGiftHubOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isWardrobeOpen: false,
  openWardrobe: () => set({ isWardrobeOpen: true }),
  closeWardrobe: () => set({ isWardrobeOpen: false }),
  toggleWardrobe: () => set((state) => ({ isWardrobeOpen: !state.isWardrobeOpen })),
  setWardrobeOpen: (open: boolean) => set({ isWardrobeOpen: open }),

  isGiftHubOpen: false,
  openGiftHub: () => set({ isGiftHubOpen: true }),
  closeGiftHub: () => set({ isGiftHubOpen: false }),
  setGiftHubOpen: (open: boolean) => set({ isGiftHubOpen: open }),
}));
