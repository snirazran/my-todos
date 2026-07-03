import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  isWardrobeOpen: boolean;
  openWardrobe: () => void;
  closeWardrobe: () => void;
  toggleWardrobe: () => void;
  setWardrobeOpen: (open: boolean) => void;

  isQuestOnboardingOpen: boolean;
  openQuestOnboarding: () => void;
  closeQuestOnboarding: () => void;
  setQuestOnboardingOpen: (open: boolean) => void;

  isCinematicActive: boolean;
  setIsCinematicActive: (active: boolean) => void;

  isDebugMode: boolean;
  setIsDebugMode: (debug: boolean) => void;

  isLoadingScreenVisible: boolean;
  setLoadingScreenVisible: (visible: boolean) => void;

  isPremiumModalOpen: boolean;
  setPremiumModalOpen: (open: boolean) => void;

  isWardrobeStuck: boolean;
  setWardrobeStuck: (stuck: boolean) => void;

  wardrobeTab: string;
  setWardrobeTab: (tab: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isWardrobeOpen: false,
      openWardrobe: () => set({ isWardrobeOpen: true }),
      closeWardrobe: () => set({ isWardrobeOpen: false }),
      toggleWardrobe: () => set((state) => ({ isWardrobeOpen: !state.isWardrobeOpen })),
      setWardrobeOpen: (open: boolean) => set({ isWardrobeOpen: open }),

      isQuestOnboardingOpen: false,
      openQuestOnboarding: () => set({ isQuestOnboardingOpen: true }),
      closeQuestOnboarding: () => set({ isQuestOnboardingOpen: false }),
      setQuestOnboardingOpen: (open: boolean) => set({ isQuestOnboardingOpen: open }),

      isCinematicActive: false,
      setIsCinematicActive: (active: boolean) => set({ isCinematicActive: active }),

      isDebugMode: false,
      setIsDebugMode: (debug: boolean) => set({ isDebugMode: debug }),

      isLoadingScreenVisible: false,
      setLoadingScreenVisible: (visible: boolean) => set({ isLoadingScreenVisible: visible }),

      isPremiumModalOpen: false,
      setPremiumModalOpen: (open: boolean) => set({ isPremiumModalOpen: open }),

      isWardrobeStuck: false,
      setWardrobeStuck: (stuck: boolean) => set({ isWardrobeStuck: stuck }),

      wardrobeTab: 'inventory',
      setWardrobeTab: (tab: string) => set({ wardrobeTab: tab }),
    }),
    {
      name: 'frogress-ui-storage',
      partialize: (state) => ({ isDebugMode: state.isDebugMode }), // Only persist debug mode
    }
  )
);
