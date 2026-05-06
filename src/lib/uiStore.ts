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

  isWeeklyWrappedOpen: boolean;
  openWeeklyWrapped: () => void;
  closeWeeklyWrapped: () => void;
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

      isWeeklyWrappedOpen: false,
      openWeeklyWrapped: () => set({ isWeeklyWrappedOpen: true }),
      closeWeeklyWrapped: () => set({ isWeeklyWrappedOpen: false }),
    }),
    {
      name: 'frog-task-ui-storage',
      partialize: (state) => ({ isDebugMode: state.isDebugMode }), // Only persist debug mode
    }
  )
);
