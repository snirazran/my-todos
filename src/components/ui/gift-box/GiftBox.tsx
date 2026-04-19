import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  useRive,
  useStateMachineInput,
  Layout,
  Fit,
  Alignment,
} from '@rive-app/react-canvas';
import { useRiveAsset } from '@/hooks/useRiveAsset';
import { useRiveVisibility } from '@/hooks/useRiveVisibility';

// Define layout outside component to maintain reference stability
const RIVE_LAYOUT = new Layout({
  fit: Fit.Contain,
  alignment: Alignment.Center,
});

const shakeVariants = {
  idle: { x: 0, rotate: 0 },
  shaking: { x: 0, rotate: 0 },
  revealed: { x: 0, rotate: 0 },
};

// --- FIXED: Removed all delay logic, just simple rendering ---
export const GiftRive = React.memo(
  ({
    width,
    height,
    className,
    triggerOpen,
    isMilestone = false,
    paused = false,
    color = 0,
  }: {
    width?: number;
    height?: number;
    className?: string;
    triggerOpen?: boolean;
    isMilestone?: boolean;
    paused?: boolean;
    color?: number;
  }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const riveUrl = useRiveAsset('/idle_gift.riv');
    const { rive, RiveComponent } = useRive({
      src: riveUrl || undefined,
      stateMachines: 'State Machine 1',
      autoplay: true,
      layout: RIVE_LAYOUT,
    });

    useRiveVisibility(rive, containerRef);

    useEffect(() => {
      if (!rive) return;
      const resize = () => rive.resizeDrawingSurfaceToCanvas();
      resize();
      const raf = requestAnimationFrame(resize);
      const delays = [100, 300, 600, 1000].map((ms) => setTimeout(resize, ms));
      return () => {
        cancelAnimationFrame(raf);
        delays.forEach(clearTimeout);
      };
    }, [rive]);

    const startOpenInput = useStateMachineInput(
      rive,
      'State Machine 1',
      'start_box_open'
    );

    const isMileStoneInput = useStateMachineInput(
      rive,
      'State Machine 1',
      'is_mile_stone'
    );

    // Query a fresh input every time. Rive invalidates input objects during reset.
    const applyColor = React.useCallback(() => {
      if (!rive || typeof color !== 'number') return;
      try {
        const inputs = rive.stateMachineInputs('State Machine 1');
        const colorInput = inputs?.find((i) => i.name === 'color');
        if (colorInput) colorInput.value = color;
      } catch {
        // Rive can briefly invalidate inputs while canvases mount/reset.
      }
    }, [color, rive]);

    useEffect(() => {
      applyColor();
      const raf = requestAnimationFrame(applyColor);
      const timers = [50, 150, 300].map((ms) => setTimeout(applyColor, ms));
      return () => {
        cancelAnimationFrame(raf);
        timers.forEach(clearTimeout);
      };
    }, [applyColor]);

    useEffect(() => {
      if (rive) {
        if (paused) {
          rive.reset();
          rive.play();
          // Re-apply color after reset since reset clears inputs.
          const raf = requestAnimationFrame(() => {
            applyColor();
            rive.pause();
          });
          const timers = [50, 150, 300].map((ms) =>
            setTimeout(() => {
              applyColor();
              rive.pause();
            }, ms),
          );
          return () => {
            cancelAnimationFrame(raf);
            timers.forEach(clearTimeout);
          };
        } else if (!rive.isPlaying) {
          rive.play();
        }
      }
    }, [rive, paused, applyColor]);

    useEffect(() => {
      if (isMilestone && isMileStoneInput) {
        const timer = setTimeout(() => {
          isMileStoneInput.fire();
          applyColor();
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [isMilestone, isMileStoneInput, applyColor]);

    useEffect(() => {
      if (triggerOpen && startOpenInput) {
        startOpenInput.fire();
      }
    }, [triggerOpen, startOpenInput]);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          width: width ?? '100%',
          height: height ?? '100%',
          display: 'block', // Ensures no inline alignment issues
        }}
      >
        {riveUrl && (
          <RiveComponent
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        )}
      </div>
    );
  }
);

// Display name for debugging
GiftRive.displayName = 'GiftRive';

type GiftBoxProps = {
  phase: 'idle' | 'shaking' | 'revealed';
  onOpen: () => void;
  loadingText?: string;
  isMilestone?: boolean;
  color?: number;
};

export const GiftBox = ({
  phase,
  onOpen,
  loadingText,
  isMilestone,
  color = 1,
}: GiftBoxProps) => {
  return (
    <motion.div
      key="gift"
      className="flex flex-col items-center cursor-pointer"
      onClick={onOpen}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{
        scale: 1.5,
        opacity: 0,
        filter: 'blur(20px)',
        transition: { duration: 0.5 },
      }}
    >
      <motion.div
        animate={phase}
        variants={shakeVariants}
        className="relative w-[450px] h-[450px] md:w-[500px] md:h-[500px]"
      >
        <GiftRive triggerOpen={phase === 'shaking'} isMilestone={isMilestone} color={color} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.3 } }}
        className="mt-4 space-y-2 text-center"
      >
        <h2 className="text-4xl font-black tracking-widest text-white uppercase">
          {phase === 'shaking' ? 'UNWRAPPING...' : 'TAP TO UNWRAP'}
        </h2>
        {phase === 'idle' && (
          <p className="text-lg font-bold tracking-wide text-slate-300">
            Mystery Gift
          </p>
        )}
        {phase === 'shaking' && (
          <p className="text-base font-bold text-slate-300 animate-pulse min-h-[1.5em]">
            {loadingText}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
};
