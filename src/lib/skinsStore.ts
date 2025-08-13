import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { byId } from './skins/catalog';

type SkinState = {
  equippedId: string | null; // null => no skin
  equippedIndex: number; // -1 => no skin
  setEquippedById: (id: string | null) => void;
  setEquippedIndex: (i: number) => void;
};

export const useSkins = create<SkinState>()(
  persist(
    (set) => ({
      equippedId: null, // default: none
      equippedIndex: -1, // default: none
      setEquippedById: (id) => {
        if (id == null) {
          // no skin selected
          set({ equippedId: null, equippedIndex: -1 });
          return;
        }
        // id is now narrowed to string
        const idx = byId[id]?.riveIndex ?? -1;
        set({ equippedId: id, equippedIndex: idx });
      },
      setEquippedIndex: (i) => set({ equippedIndex: i }),
    }),
    { name: 'frog-skin' }
  )
);
