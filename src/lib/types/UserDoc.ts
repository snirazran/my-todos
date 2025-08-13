// lib/types/UserDoc.ts
export type UserSkins = {
  equippedId: string | null; // null = no skin equipped
  inventory: Record<string, number>; // only owned ids appear here
  flies: number;
};

export type UserDoc = {
  _id: any;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  skins?: UserSkins;
};
