import { create } from 'zustand';

// Holds the background the onboarding screens should show behind the frog. It is
// rolled (randomly, never repeating the previous one) alongside each frog outfit
// in OnboardingFrogHeader and rendered at the page level by OnboardingBackground.
interface OnboardingBackgroundState {
  backgroundId: string | null;
  setBackgroundId: (id: string | null) => void;
}

export const useOnboardingBackgroundStore = create<OnboardingBackgroundState>((set) => ({
  backgroundId: null,
  setBackgroundId: (backgroundId) => set({ backgroundId }),
}));
