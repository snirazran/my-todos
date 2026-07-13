import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HintGuideContext } from '@/lib/hints/guides';

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
  premiumModalPlacement: string;
  setPremiumModalOpen: (open: boolean, placement?: string) => void;

  isFlyShopOpen: boolean;
  openFlyShop: () => void;
  closeFlyShop: () => void;
  setFlyShopOpen: (open: boolean) => void;

  isWardrobeStuck: boolean;
  setWardrobeStuck: (stuck: boolean) => void;

  wardrobeTab: string;
  setWardrobeTab: (tab: string) => void;

  activeHint: {
    guideId: string;
    stepIndex: number;
    runId: number;
    context?: HintGuideContext;
  } | null;
  startHintGuide: (guideId: string, context?: HintGuideContext) => void;
  advanceHintStep: () => void;
  goToHintStep: (stepIndex: number) => void;
  dismissHintGuide: () => void;
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
      premiumModalPlacement: 'unknown',
      setPremiumModalOpen: (open: boolean, placement = 'unknown') =>
        set({ isPremiumModalOpen: open, ...(open ? { premiumModalPlacement: placement } : {}) }),

      isFlyShopOpen: false,
      openFlyShop: () => set({ isFlyShopOpen: true }),
      closeFlyShop: () => set({ isFlyShopOpen: false }),
      setFlyShopOpen: (open: boolean) => set({ isFlyShopOpen: open }),

      isWardrobeStuck: false,
      setWardrobeStuck: (stuck: boolean) => set({ isWardrobeStuck: stuck }),

      wardrobeTab: 'inventory',
      setWardrobeTab: (tab: string) => set({ wardrobeTab: tab }),

      activeHint: null,
      startHintGuide: (guideId, context) =>
        set({
          activeHint: { guideId, stepIndex: 0, runId: Date.now(), context },
        }),
      advanceHintStep: () =>
        set((state) =>
          state.activeHint
            ? {
                activeHint: {
                  ...state.activeHint,
                  stepIndex: state.activeHint.stepIndex + 1,
                },
              }
            : {},
        ),
      goToHintStep: (stepIndex: number) =>
        set((state) =>
          state.activeHint
            ? { activeHint: { ...state.activeHint, stepIndex } }
            : {},
        ),
      dismissHintGuide: () => set({ activeHint: null }),
    }),
    {
      name: 'frogress-ui-storage',
      partialize: (state) => ({ isDebugMode: state.isDebugMode }), // Only persist debug mode
    }
  )
);
