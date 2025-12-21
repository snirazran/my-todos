import { useState, useEffect } from 'react';
import { getRiveBlobUrl, preloadRiveAsset } from '@/lib/riveLoader';

export function useRiveAsset(path: string) {
  const [url, setUrl] = useState<string | null>(() => getRiveBlobUrl(path) || null);

  useEffect(() => {
    // If we already have a URL in state, do nothing
    if (url) return;

    // Check cache again in case it loaded since init
    const cached = getRiveBlobUrl(path);
    if (cached) {
      setUrl(cached);
      return;
    }

    // Otherwise load it
    let active = true;
    preloadRiveAsset(path).then((loadedUrl) => {
      if (active) setUrl(loadedUrl);
    });

    return () => {
      active = false;
    };
  }, [path, url]);

  return url;
}
