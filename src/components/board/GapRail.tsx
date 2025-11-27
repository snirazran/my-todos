'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

type Props = {
  onAdd: () => void;
  overlayHidden?: boolean;
  disabled?: boolean;
};

export default function GapRail({
  onAdd,
  overlayHidden = false,
  disabled = false,
}: Props) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = React.useState(false);
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  // keep the overlay aligned to the host
  const updateRect = React.useCallback(() => {
    const el = hostRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect(r);
  }, []);

  React.useEffect(() => {
    updateRect();
    const onScroll = () => updateRect();
    const onResize = () => updateRect();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(updateRect);
    if (hostRef.current) ro.observe(hostRef.current);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
    };
  }, [updateRect]);

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (disabled || overlayHidden) return;
    e.stopPropagation();
    onAdd();
  };

  const Overlay =
    !overlayHidden && hover && rect
      ? createPortal(
          <div
            // fixed so it's out of parent stacking contexts
            style={{
              position: 'fixed',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              zIndex: 10000, // higher than your modal/backdrop
              pointerEvents: 'none',
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              {/* left dashed vine */}
              <div className="flex-1">
                <div className="w-full h-px text-purple-500/80 dark:text-purple-300/70">
                  <div
                    className="w-full h-[2px]"
                    style={{
                      ['--dash' as any]: '6px',
                      ['--gap' as any]: '6px',
                      backgroundImage:
                        'repeating-linear-gradient(to right, currentColor 0 var(--dash), transparent var(--dash) calc(var(--dash) + var(--gap)))',
                    }}
                  />
                </div>
              </div>

              {/* lily-pad ג€+ג€ */}
              <button
                type="button"
                title="Add task (ribbit!)"
                aria-label="Add task"
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd();
                }}
                className={[
                  'pointer-events-auto mx-1 h-8 w-8 grid place-items-center rounded-full',
                  'ring-1 ring-purple-200/70 dark:ring-purple-800/50 shadow-sm',
                  'transition-transform duration-150',
                  disabled ? '' : 'hover:scale-[1.06] active:scale-[0.98]',
                ].join(' ')}
                style={{
                  background:
                    'radial-gradient(120% 120% at 30% 30%, #c084fc 0%, #a855f7 55%, #7c3aed 100%)',
                  color: '#3b1c77',
                }}
                disabled={disabled}
              >
                <span className="text-sm font-extrabold leading-none select-none">
                  +
                </span>
              </button>

              {/* right dashed vine */}
              <div className="flex-1">
                <div className="w-full h-px text-purple-500/80 dark:text-purple-300/70">
                  <div
                    className="w-full h-[2px]"
                    style={{
                      ['--dash' as any]: '6px',
                      ['--gap' as any]: '6px',
                      backgroundImage:
                        'repeating-linear-gradient(to right, currentColor 0 var(--dash), transparent var(--dash) calc(var(--dash) + var(--gap)))',
                    }}
                  />
                </div>
              </div>

              {/* subtle halo */}
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none"
              >
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full left-1/2 top-1/2"
                  style={{
                    width: 40,
                    height: 40,
                    boxShadow:
                      '0 0 0 0 rgba(124,58,237,0.2), 0 0 0 8px rgba(124,58,237,0.08)',
                    filter: 'blur(0.2px)',
                  }}
                />
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div
      ref={hostRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={handleClick}
      className={[
        'relative h-2 select-none md:h-2',
        'pointer-events-none',
        disabled
          ? 'opacity-60 md:pointer-events-none'
          : 'hover:cursor-pointer md:pointer-events-auto',
      ].join(' ')}
      role="button"
      aria-disabled={disabled}
      tabIndex={-1}
    >
      {Overlay}
    </div>
  );
}

