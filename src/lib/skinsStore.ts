import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { byId } from './skins/catalog';

type SkinState = {
  equippedId: string; // e.g. 'skin0_common'
  equippedIndex: number; // e.g. 0
  setEquippedById: (id: string) => void;
  setEquippedIndex: (i: number) => void; // backwards-compat if you already use it
};

export const useSkins = create<SkinState>()(
  persist(
    (set, get) => ({
      equippedId: 'skin0_common',
      equippedIndex: 0,
      setEquippedById: (id) => {
        const idx = byId[id]?.riveIndex ?? 0;
        set({ equippedId: id, equippedIndex: idx });
      },
      setEquippedIndex: (i) => set({ equippedIndex: i }),
    }),
    { name: 'frog-skin' }
  )
);
