export const urlCache = new Map<string, string>();
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
      // Fallback to original path if fetch fails
      return assetPath;
    });

  promiseCache.set(assetPath, p);
  return p;
};
