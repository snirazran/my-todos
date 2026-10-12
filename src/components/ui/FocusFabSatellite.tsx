'use client';

import { Icon } from '@/components/ui/Icon';
import { hapticSelect } from '@/lib/haptics';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';

export function FocusFabSatellite({
  hidden = false,
  concealed = false,
}: Readonly<{
  hidden?: boolean;
  concealed?: boolean;
}>) {
  const openFocusLauncher = useFrogodoroUiStore((state) => state.openFocusLauncher);

  if (hidden) return null;

  return (
    <button
      type="button"
      aria-label="Start a focus session"
      tabIndex={concealed ? -1 : undefined}
      data-hint="focus-timer"
      onClick={() => {
        hapticSelect();
        openFocusLauncher();
      }}
      className="grid h-12 w-12 place-items-center rounded-full text-primary transition-[transform,background-color] hover:bg-muted active:scale-95"
    >
      <Icon name="clock" className="h-8 w-8" />
    </button>
  );
}

export default FocusFabSatellite;
