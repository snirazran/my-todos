// lib/types/UserDoc.ts
import type { WardrobeSlot } from '@/lib/skins/catalog';

/** New multi-slot wardrobe */
export type UserWardrobe = {
  equipped: Partial<Record<WardrobeSlot, string | null>>;
  inventory: Record<string, number>;
  flies: number;
};

/** (legacy) single-slot skins — keep temporarily for migration only */
export type UserSkins = {
  equippedId: string | null;
  inventory: Record<string, number>;
  flies: number;
};

export type UserDoc = {
  _id: any;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;

  /** NEW field used by the updated API/UI */
  wardrobe?: UserWardrobe;

  /** LEGACY field; remove after data migration */
  skins?: UserSkins;
};
