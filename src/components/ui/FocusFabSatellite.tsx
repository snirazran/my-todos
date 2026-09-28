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
  concealed = false,
}: Readonly<{
  bottom: string;
  bottomMd: string;
  hidden?: boolean;
  concealed?: boolean;
}>) {
  const openFocusLauncher = useFrogodoroUiStore((state) => state.openFocusLauncher);

  if (hidden) return null;

  return (
    <button
      type="button"
      aria-label="Start a focus session"
      aria-hidden={concealed || undefined}
      tabIndex={concealed ? -1 : undefined}
      data-hint="focus-timer"
      onClick={() => {
        hapticSelect();
        openFocusLauncher();
      }}
      className={`fixed right-[1.9rem] z-[40] grid h-11 w-11 place-items-center rounded-full bg-card text-primary shadow-[0_3px_8px_-2px_rgba(0,0,0,0.22)] ring-1 ring-border/70 hover:brightness-105 active:scale-95 bottom-[var(--focus-fab-bottom)] md:bottom-[var(--focus-fab-bottom-md)] md:right-[max(1.9rem,50vw_-_394px)] ${
        concealed ? 'pointer-events-none translate-y-24 opacity-0' : 'translate-y-0 opacity-100'
      }`}
      style={
        {
          '--focus-fab-bottom': bottom,
          '--focus-fab-bottom-md': bottomMd,
          transition:
            'bottom 320ms cubic-bezier(0.22,1,0.36,1), transform 240ms cubic-bezier(0.32,0.72,0,1), opacity 180ms ease',
        } as React.CSSProperties
      }
    >
      <Icon name="clock" className="h-8 w-8" />
    </button>
  );
}

export default FocusFabSatellite;
