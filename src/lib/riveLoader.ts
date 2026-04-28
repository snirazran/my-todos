export const urlCache = new Map<string, string>();
const promiseCache = new Map<string, Promise<string>>();

export const getRiveBlobUrl = (assetPath: string): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  return urlCache.get(assetPath);
};

// Fetched once per browser session — maps static paths to Firebase Storage proxy URLs.
let urlOverridePromise: Promise<Record<string, string>> | null = null;
const urlOverrides: Record<string, string> = {};

function loadUrlOverrides(): Promise<Record<string, string>> {
  if (urlOverridePromise) return urlOverridePromise;
  urlOverridePromise = fetch('/api/rive-urls')
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => ({}))
    .then((data: Record<string, string>) => {
      Object.assign(urlOverrides, data);
      return urlOverrides;
    });
  return urlOverridePromise;
}

export const preloadRiveAsset = (assetPath: string): Promise<string> => {
  if (typeof window === 'undefined') return Promise.resolve(assetPath);
  if (urlCache.has(assetPath)) return Promise.resolve(urlCache.get(assetPath)!);
  if (promiseCache.has(assetPath)) return promiseCache.get(assetPath)!;

  const p = loadUrlOverrides().then((overrides) => {
    const effectivePath = overrides[assetPath] ?? assetPath;

    if (urlCache.has(effectivePath)) {
      const url = urlCache.get(effectivePath)!;
      urlCache.set(assetPath, url);
      return url;
    }

    return fetch(effectivePath)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${effectivePath}`);
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        urlCache.set(assetPath, url);
        urlCache.set(effectivePath, url);
        return url;
      })
      .catch((err) => {
        console.error(err);
        return assetPath;
      });
  });

  promiseCache.set(assetPath, p);
  return p;
};
