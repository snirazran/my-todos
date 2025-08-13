// lib/types/UserDoc.ts
export type UserSkins = {
  equippedId: string; // 'skin1_uncommon'
  inventory: Record<string, number>; // { 'skin0_common': 2, 'skin1_uncommon': 1 }
  flies: number; // future currency
};

export type UserDoc = {
  _id: any;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  skins?: UserSkins;
};
