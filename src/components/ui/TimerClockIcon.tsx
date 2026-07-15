/** The same animated stopwatch glyph used by the running timer notification. */
export function TimerClockIcon({
  running = false,
  className = 'h-4 w-4',
}: {
  running?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`relative inline-flex items-center justify-center ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="absolute inset-0 h-full w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="12" cy="12" r="9" />
        <line x1="10" y1="2" x2="14" y2="2" strokeLinecap="round" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className={`absolute inset-0 h-full w-full ${
          running ? 'animate-[spin_4s_linear_infinite]' : ''
        }`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      >
        <line x1="12" y1="12" x2="12" y2="6.5" />
      </svg>
    </span>
  );
}
