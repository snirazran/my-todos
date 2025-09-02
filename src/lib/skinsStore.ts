import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { byId, type WardrobeSlot } from './skins/catalog';

type WardrobeState = {
  // what’s equipped per slot (id or null)
  equipped: Partial<Record<WardrobeSlot, string | null>>;
  // rive indices for each slot (0 = default/none)
  indices: Partial<Record<WardrobeSlot, number>>;

  // actions
  setEquippedById: (slot: WardrobeSlot, id: string | null) => void;
  setEquippedIndex: (slot: WardrobeSlot, i: number) => void;
  resetWardrobe: () => void;
};

export const useWardrobe = create<WardrobeState>()(
  persist(
    (set, get) => ({
      equipped: {},
      indices: {},

      setEquippedById: (slot, id) => {
        if (id == null) {
          // unequip this slot
          const nextEq = { ...get().equipped, [slot]: null };
          const nextIdx = { ...get().indices, [slot]: 0 };
          set({ equipped: nextEq, indices: nextIdx });
          return;
        }
        const idx = byId[id]?.riveIndex ?? 0;
        set({
          equipped: { ...get().equipped, [slot]: id },
          indices: { ...get().indices, [slot]: idx },
        });
      },

      setEquippedIndex: (slot, i) => {
        set({
          indices: { ...get().indices, [slot]: i },
        });
      },

      resetWardrobe: () => set({ equipped: {}, indices: {} }),
    }),
    { name: 'frog-wardrobe' }
  )
);
