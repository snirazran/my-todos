import { RuntimeLoader } from '@rive-app/react-canvas-lite';
import { RIVE_WASM_VERSION } from './riveWasmVersion';

if (typeof window !== 'undefined') {
  RuntimeLoader.setWasmUrl(`/rive.wasm?v=${RIVE_WASM_VERSION}`);
  RuntimeLoader.setWasmFallbackUrl(`/rive_fallback.wasm?v=${RIVE_WASM_VERSION}`);
}

export const warmRiveRuntime = () => {
  if (typeof window === 'undefined') return;
  RuntimeLoader.awaitInstance().catch(() => {});
};

export const urlCache = new Map<string, string>();

// Bump when fly_idle.riv is re-exported. Rive assets are converted to Blob
// URLs and retained in memory, so a content version prevents an older export
// from surviving browser/CDN caches.
export const FLY_RIVE_ASSET_URL = '/fly_idle.riv?v=60715001';

export const riveDevicePixelRatio = (cap = 2) => {
  if (typeof window === 'undefined') return 1;
  return Math.min(window.devicePixelRatio || 1, cap);
};
const promiseCache = new Map<string, Promise<string>>();

export const getRiveBlobUrl = (assetPath: string): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  return urlCache.get(assetPath);
};

export const preloadRiveAsset = (assetPath: string): Promise<string> => {
  if (typeof window === 'undefined') return Promise.resolve(assetPath);
  if (urlCache.has(assetPath)) return Promise.resolve(urlCache.get(assetPath)!);
  if (promiseCache.has(assetPath)) return promiseCache.get(assetPath)!;

  const p = fetch(assetPath)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${assetPath}`);
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      urlCache.set(assetPath, url);
      return url;
    })
    .catch((err) => {
      console.error(err);
      return assetPath;
    });

  promiseCache.set(assetPath, p);
  return p;
};
