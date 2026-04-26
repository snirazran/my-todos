import { useEffect, type RefObject, useId } from 'react';
import { type Rive, EventType } from '@rive-app/react-canvas-lite';
import { useRiveStatsStore } from '@/lib/riveStatsStore';
import { useUIStore } from '@/lib/uiStore';

/**
 * Automatically plays/pauses a Rive animation based on visibility in the viewport.
 */
export function useRiveVisibility(
  rive: Rive | null,
  ref: RefObject<HTMLElement | null>,
  enabled = true,
  label = 'unknown',
) {
  const instanceId = useId();
  const fullId = `${label}-${instanceId}`;
  const isDebugMode = useUIStore((s) => s.isDebugMode);
  
  // Use stable selectors for actions to prevent re-renders when other instances update
  const registerInstance = useRiveStatsStore((s) => s.registerInstance);
  const unregisterInstance = useRiveStatsStore((s) => s.unregisterInstance);
  const updateInstance = useRiveStatsStore((s) => s.updateInstance);

  useEffect(() => {
    if (!rive || !isDebugMode) return;
    registerInstance(fullId);
    return () => unregisterInstance(fullId);
  }, [rive, fullId, registerInstance, unregisterInstance, isDebugMode]);

  useEffect(() => {
    if (!rive) return;

    let rafId: number | null = null;

    // Monitor Rive status
    const updateStatus = () => {
      if (!isDebugMode) return;
      // Cancel previous pending frame
      if (rafId) cancelAnimationFrame(rafId);

      // Use requestAnimationFrame to ensure we get the state AFTER Rive processes play/pause
      rafId = requestAnimationFrame(() => {
        if (!rive) return;
        updateInstance(fullId, {
          isPlaying: rive.isPlaying,
          isPaused: rive.isPaused,
        });
      });
    };

    if (isDebugMode) {
      updateStatus();
      rive.on(EventType.Play, updateStatus);
      rive.on(EventType.Pause, updateStatus);
      rive.on(EventType.Stop, updateStatus);
    }

    let observer: IntersectionObserver | null = null;

    if (enabled && ref.current) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.1) {
              rive.play();
            } else {
              rive.pause();
            }
            if (isDebugMode) updateStatus();
          });
        },
        {
          rootMargin: '0px',
          threshold: [0, 0.1],
        }
      );

      observer.observe(ref.current);
    }

    return () => {
      if (observer) observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      if (isDebugMode) {
        rive.off(EventType.Play, updateStatus);
        rive.off(EventType.Pause, updateStatus);
        rive.off(EventType.Stop, updateStatus);
      }
    };
  }, [rive, ref, enabled, fullId, updateInstance, isDebugMode]);
}
