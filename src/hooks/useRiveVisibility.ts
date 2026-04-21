import { useEffect, type RefObject } from 'react';
import { type Rive } from '@rive-app/react-canvas-lite';

/**
 * Automatically plays/pauses a Rive animation based on visibility in the viewport.
 */
export function useRiveVisibility(
  rive: Rive | null,
  ref: RefObject<HTMLElement | null>,
  enabled = true,
) {
  useEffect(() => {
    if (!rive) return;

    if (!enabled) return;

    if (!ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.1) {
            rive.play();
          } else {
            rive.pause();
          }
        });
      },
      {
        rootMargin: '0px',
        threshold: [0, 0.1],
      }
    );

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [rive, ref, enabled]);
}
