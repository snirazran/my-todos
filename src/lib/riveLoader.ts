import { EventType, RiveFile, RuntimeLoader } from '@rive-app/react-canvas-lite';
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
export const FLY_RIVE_ASSET_URL = '/fly_idle.riv?v=60715002';
// One export holds every fly pack, as artboards Bundle1 … Bundle6.
export const STORE_BUNDLE_RIVE_URL = '/store_bundle.riv?v=60730001';
export const storeBundleArtboard = (bundle: number) => `Bundle${bundle}`;

let storeBundleFile: RiveFile | null = null;
let storeBundleLoad: Promise<RiveFile | null> | null = null;
let storeBundleBytes: Promise<ArrayBuffer> | null = null;

/** Network half of the fly-pack load. Safe to fire while a sheet is animating:
 *  it only fills the HTTP cache, none of it runs on the main thread. */
export const prefetchStoreBundleBytes = (): Promise<ArrayBuffer> => {
  storeBundleBytes ??= fetch(STORE_BUNDLE_RIVE_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${STORE_BUNDLE_RIVE_URL}`);
      return res.arrayBuffer();
    })
    .catch((err) => {
      storeBundleBytes = null;
      throw err;
    });
  return storeBundleBytes;
};

/**
 * The fly-pack artwork, parsed exactly once for the whole app.
 *
 * Handing each card a `src` makes every card decode the same multi-hundred-KB
 * export (images and all) on its own, six times over, right as the shop sheet
 * is animating in — which is what the sheet's opening stutter was. One shared
 * RiveFile means one parse; the cards only pay for their own artboard. Parsing
 * does block the main thread, so callers should hold this until the sheet has
 * finished animating and prefetch the bytes in the meantime.
 *
 * The extra getInstance() below is a permanent reference: RiveFile releases
 * itself once its ref count hits zero, so without it the file would be freed
 * the moment the sheet closes and re-parsed on the next open.
 */
export const preloadStoreBundleFile = (): Promise<RiveFile | null> => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (storeBundleFile) return Promise.resolve(storeBundleFile);
  storeBundleLoad ??= prefetchStoreBundleBytes()
    .then(
      (buffer) =>
        new Promise<RiveFile | null>((resolve) => {
          const file = new RiveFile({ buffer });
          file.on(EventType.Load, () => {
            file.getInstance();
            storeBundleFile = file;
            resolve(file);
          });
          file.on(EventType.LoadError, () => {
            storeBundleLoad = null;
            resolve(null);
          });
          void file.init();
        }),
    )
    .catch((err) => {
      console.error(err);
      storeBundleLoad = null;
      return null;
    });
  return storeBundleLoad;
};

export const getStoreBundleFile = () => storeBundleFile;

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
