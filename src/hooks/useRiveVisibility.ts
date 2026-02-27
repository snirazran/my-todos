import { useEffect, type RefObject } from 'react';
import { type Rive } from '@rive-app/react-canvas';

/**
 * Automatically plays/pauses a Rive animation based on visibility in the viewport.
 */
export function useRiveVisibility(rive: Rive | null, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!rive || !ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            rive.play();
          } else {
            rive.pause();
          }
        });
      },
      {
        threshold: 0, // Stop as soon as it's completely out of view
      }
    );

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [rive, ref]);
}
