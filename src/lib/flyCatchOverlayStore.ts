import { create } from 'zustand';

export type FlyCatchSource = 'home' | 'wardrobe' | 'friends';

type FlyCatchOverlayController = {
  drag: (pullPx: number, armed: boolean) => void;
  settle: (shouldOpen: boolean, velocityPxMs: number) => void;
};

type FlyCatchOverlayStore = {
  active: boolean;
  open: boolean;
  source: FlyCatchSource | null;
  controller: FlyCatchOverlayController | null;
  activate: (source: FlyCatchSource) => void;
  setOpen: (open: boolean) => void;
  deactivate: () => void;
  setController: (controller: FlyCatchOverlayController | null) => void;
};

export const useFlyCatchOverlay = create<FlyCatchOverlayStore>((set) => ({
  active: false,
  open: false,
  source: null,
  controller: null,
  activate: (source) => set({ active: true, source }),
  setOpen: (open) => set({ open }),
  deactivate: () => set({ active: false, open: false, source: null }),
  setController: (controller) => set({ controller }),
}));
