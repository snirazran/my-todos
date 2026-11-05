import { useEffect, useState } from 'react';
import type { RiveFile } from '@rive-app/react-canvas-lite';
import { getFrogFile, preloadFrogFile } from '@/lib/riveLoader';

export function useSharedFrogFile(enabled = true): { file: RiveFile | null; ready: boolean } {
  const [file, setFile] = useState<RiveFile | null>(getFrogFile);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || file) return;
    let alive = true;
    void preloadFrogFile().then((loaded) => {
      if (!alive) return;
      if (loaded) setFile(loaded);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [enabled, file]);

  return { file, ready: !!file || failed };
}
