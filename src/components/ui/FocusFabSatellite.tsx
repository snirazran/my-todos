'use client';

import { Icon } from '@/components/ui/Icon';
import { hapticSelect } from '@/lib/haptics';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';

// A screen should carry one FAB. So focus doesn't get a second one — it gets a
// smaller satellite docked above the +: two thirds the size, a lighter surface,
// visibly the secondary of the pair. A long-press on the + would have been
// tidier still, but a hidden gesture is a feature most people never find.
export function FocusFabSatellite({
  bottom,
  bottomMd,
  hidden = false,
}: Readonly<{ bottom: string; bottomMd: string; hidden?: boolean }>) {
  const openFocusLauncher = useFrogodoroUiStore((state) => state.openFocusLauncher);

  if (hidden) return null;

  return (
    <button
      type="button"
      aria-label="Start a focus session"
      data-hint="focus-timer"
      onClick={() => {
        hapticSelect();
        openFocusLauncher();
      }}
      className="fixed right-[1.9rem] z-[40] grid h-11 w-11 place-items-center rounded-full bg-card text-primary shadow-[0_3px_8px_-2px_rgba(0,0,0,0.22)] ring-1 ring-border/70 transition-[transform,box-shadow,background-color,color,opacity] hover:brightness-105 active:scale-95 bottom-[var(--focus-fab-bottom)] md:bottom-[var(--focus-fab-bottom-md)] md:right-[max(1.9rem,50vw_-_394px)]"
      style={
        {
          '--focus-fab-bottom': bottom,
          '--focus-fab-bottom-md': bottomMd,
          transition: 'bottom 200ms ease',
        } as React.CSSProperties
      }
    >
      <Icon name="clock" className="h-8 w-8" />
    </button>
  );
}

export default FocusFabSatellite;
