'use client';

import { create } from 'zustand';
import { getWidgetPinState } from './bridge';
import type { WidgetPinState } from './types';

interface WidgetPinStore {
  pinState: WidgetPinState;
  promptRequested: boolean;
  setPinState: (state: WidgetPinState) => void;
  refreshPinState: () => Promise<void>;
  requestPrompt: () => void;
  clearPromptRequest: () => void;
}

export const useWidgetPinStore = create<WidgetPinStore>((set) => ({
  pinState: 'unsupported',
  promptRequested: false,
  setPinState: (pinState) => set({ pinState }),
  refreshPinState: async () => {
    const pinState = await getWidgetPinState();
    set({ pinState });
  },
  requestPrompt: () => set({ promptRequested: true }),
  clearPromptRequest: () => set({ promptRequested: false }),
}));
