import { create } from 'zustand';
import type { Rarity, WardrobeSlot } from '@/lib/skins/catalog';
import type { BackgroundImages } from '@/hooks/useBackgrounds';

export type WardrobeTryOn =
  | {
      kind: 'item';
      id: string;
      slot: WardrobeSlot;
      riveIndex: number;
      rarity: Rarity;
    }
  | {
      kind: 'bg';
      id: string;
      images: BackgroundImages;
      rarity: Rarity;
    };

export const useWardrobeTryOn = create<{
  tryOn: WardrobeTryOn | null;
  setTryOn: (tryOn: WardrobeTryOn | null) => void;
}>((set) => ({
  tryOn: null,
  setTryOn: (tryOn) => set({ tryOn }),
}));

export const WARDROBE_EQUIPPED_EVENT = 'wardrobe-equipped';
