'use client';

import React, { useEffect, useRef } from 'react';

export default function GapRail({
  overlayHidden,
  onAdd,
  disabled,
}: {
  overlayHidden?: boolean;
  onAdd: () => void;
  disabled?: boolean;
}) {
  // Detect desktop-like pointers (fine + hover)
  const isDesktopRef = useRef(false);
  useEffect(() => {
    isDesktopRef.current = window.matchMedia(
      '(pointer: fine) and (hover: hover)'
    ).matches;
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // JS guard: only allow on desktop mouse pointers
    if (!isDesktopRef.current) return;
    if (disabled) return;
    if (e.pointerType !== 'mouse') return;

    // avoid triggering from controls inside (future-proof)
    const t = e.target as HTMLElement;
    if (t.closest('button, [role="button"], a, input, textarea')) return;

    e.preventDefault();
    onAdd();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isDesktopRef.current || disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAdd();
    }
  };

  return (
    <div
      // CSS guard: no pointer events on mobile; enabled from md+
      className={[
        'my-2 h-8 rounded-xl border-2 border-dashed border-violet-400/70 relative',
        'pointer-events-none md:pointer-events-auto', // ← disables taps on mobile
        disabled ? 'opacity-50' : 'cursor-pointer',
      ].join(' ')}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={isDesktopRef.current && !disabled ? 0 : -1}
      aria-disabled={disabled ? 'true' : 'false'}
    >
      {!overlayHidden && (
        <div className="absolute inset-0 grid text-xs pointer-events-none select-none place-items-center text-violet-600/80">
          הוסף כאן
        </div>
      )}
    </div>
  );
}
