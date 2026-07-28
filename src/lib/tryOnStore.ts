'use client';

import { create } from 'zustand';
import type { Rarity, WardrobeSlot } from '@/lib/skins/catalog';

export type TryOnOffer = {
  itemId: string;
  name: string;
  slot: WardrobeSlot;
  rarity: Rarity;
  riveIndex: number;
  price: number;
  canAfford: boolean;
};

type TryOnState = {
  offer: TryOnOffer | null;
  show: (offer: TryOnOffer) => void;
  clear: () => void;
};

/**
 * A shuffle-suggested item the player does not own. It is worn purely in the
 * client — `useWardrobeIndices` layers it over the real equipped indices — so
 * nothing is persisted and no fly is spent until they choose to keep it.
 */
export const useTryOnStore = create<TryOnState>((set) => ({
  offer: null,
  show: (offer) => set({ offer }),
  clear: () => set({ offer: null }),
}));
