export type ManagedRiveAssetId = 'frog' | 'fly' | 'gift';

export type ManagedRiveAsset = {
  id: ManagedRiveAssetId;
  label: string;
  description: string;
  fileName: string;
  publicPath: string;
};

export const MANAGED_RIVE_ASSETS: ManagedRiveAsset[] = [
  {
    id: 'frog',
    label: 'Frog',
    description: 'Main frog, skins, hats, body, and hand item animation',
    fileName: 'frog_idle.riv',
    publicPath: '/frog_idle.riv',
  },
  {
    id: 'fly',
    label: 'Fly',
    description: 'Fly currency and catch animation asset',
    fileName: 'fly_idle.riv',
    publicPath: '/fly_idle.riv',
  },
  {
    id: 'gift',
    label: 'Gift',
    description: 'Gift box animation and color variants',
    fileName: 'idle_gift.riv',
    publicPath: '/idle_gift.riv',
  },
];

export function getManagedRiveAsset(id: string | null | undefined) {
  return MANAGED_RIVE_ASSETS.find((asset) => asset.id === id);
}
