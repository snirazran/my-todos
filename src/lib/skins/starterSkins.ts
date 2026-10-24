export type StarterSkinKey = 'green' | 'blue' | 'pink';

export const STARTER_SKINS: ReadonlyArray<{
  key: StarterSkinKey;
  label: string;
  color: string;
  image: string;
  riveIndex: number;
}> = [
  { key: 'green', label: 'Green', color: '#93df6e', image: '/skins/common/skin0.webp', riveIndex: 0 },
  { key: 'blue', label: 'Blue', color: '#6cccfc', image: '/skins/rare/skin2.webp', riveIndex: 1 },
  { key: 'pink', label: 'Pink', color: '#fc6ccc', image: '/skins/uncommon/skin1.webp', riveIndex: 2 },
];

export const findStarterSkin = (value: unknown) =>
  STARTER_SKINS.find((skin) => skin.key === value) ?? STARTER_SKINS[0];
