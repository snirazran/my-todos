import { cn } from '@/lib/utils';

export function TapFinger({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute block h-[26px] w-[22px] origin-[42%_4%] motion-safe:animate-[tap-finger_1.6s_cubic-bezier(0.45,0,0.25,1)_infinite]',
        className,
      )}
    >
      <svg viewBox="0 0 26 30" className="h-full w-full drop-shadow-[0_2px_0_rgba(15,23,42,0.18)]">
        <g fill="#fff" stroke="#14210f" strokeWidth="1.6" strokeLinejoin="round">
          <rect x="8" y="1" width="6" height="18" rx="3" />
          <rect x="13" y="9" width="5.5" height="10" rx="2.75" />
          <rect x="17.5" y="11" width="5" height="9" rx="2.5" />
          <path d="M5.5 16.5c0-1.4 1.1-2.5 2.5-2.5h12.5c1.9 0 3.5 1.6 3.5 3.5v3.5c0 4.4-3.6 8-8 8h-2.5c-4.4 0-8-3.6-8-8z" />
          <path d="M8 21.5 4.2 17.6a2.2 2.2 0 0 1 3.1-3.1L10 17.2" />
        </g>
      </svg>
    </span>
  );
}
