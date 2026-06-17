import { create } from 'zustand';

interface FrogodoroUiState {
  // How many mounted pages are currently rendering the full Frogodoro UI
  // (pill + sheet) — Home and Planner. The global mini overlay only shows when
  // this is 0, so pages like Quests/Wardrobe still get a minimal timer +
  // completion popup without duplicating the pill on Home/Planner.
  fullTimerHosts: number;
  addFullTimerHost: () => void;
  removeFullTimerHost: () => void;
  // How many full Frogodoro sheets are currently open. The global completion
  // popup is suppressed while one is open, since that sheet shows its own Done.
  openSheets: number;
  addOpenSheet: () => void;
  removeOpenSheet: () => void;
}

// Deliberately NOT persisted — it's transient mount state.
export const useFrogodoroUiStore = create<FrogodoroUiState>((set) => ({
  fullTimerHosts: 0,
  addFullTimerHost: () =>
    set((s) => ({ fullTimerHosts: s.fullTimerHosts + 1 })),
  removeFullTimerHost: () =>
    set((s) => ({ fullTimerHosts: Math.max(0, s.fullTimerHosts - 1) })),
  openSheets: 0,
  addOpenSheet: () => set((s) => ({ openSheets: s.openSheets + 1 })),
  removeOpenSheet: () =>
    set((s) => ({ openSheets: Math.max(0, s.openSheets - 1) })),
}));
