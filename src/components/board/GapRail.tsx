'use client';

export default function GapRail({
  onAdd,
  overlayHidden = false,
  disabled = false,
}: {
  onAdd: () => void;
  overlayHidden?: boolean;
  disabled?: boolean;
}) {
  const handleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (disabled || overlayHidden) return;
    // don’t let the click bubble to higher draggable containers
    e.stopPropagation();
    onAdd();
  };

  return (
    <div
      // make the WHOLE dashed rail clickable
      onClick={handleClick}
      className={[
        'relative h-2 select-none md:h-2 group/rail',
        disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer',
      ].join(' ')}
      role="button"
      aria-disabled={disabled}
      tabIndex={-1}
    >
      {!overlayHidden && (
        <div
          className={[
            'absolute inset-0 z-10 hidden md:flex items-center justify-center',
            'transition-opacity opacity-0',
            'group-hover/rail:opacity-100',
            // overlay is visual only; clicks go to the container or the small button
            'pointer-events-none',
          ].join(' ')}
        >
          <div className="flex-1">
            <div className="w-full h-px text-violet-400">
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

          <button
            type="button"
            title="הוסף משימה כאן"
            onClick={(e) => {
              e.stopPropagation(); // prevent double-trigger via container
              onAdd();
            }}
            className="pointer-events-auto mx-1 h-6 w-6 rounded bg-white dark:bg-slate-800
                       text-violet-700 dark:text-violet-300 ring-1 ring-violet-200/70
                       dark:ring-violet-900/40 shadow-sm grid place-items-center
                       hover:scale-[1.04] transition-transform"
            disabled={disabled}
          >
            +
          </button>

          <div className="flex-1">
            <div className="w-full h-px text-violet-400">
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
        </div>
      )}
    </div>
  );
}
