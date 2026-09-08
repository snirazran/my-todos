import { cn } from '@/lib/utils';

export function AdPlayIcon({
  className,
  strokeWidth = 2.5,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('h-4 w-4', className)}
    >
      <circle
        cx="12"
        cy="12"
        r={11 - strokeWidth / 2}
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      <path
        d="M10 8.3 15.9 12 10 15.7z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}
