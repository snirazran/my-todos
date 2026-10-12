import { cn } from '@/lib/utils';

export function GiftBadge({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Daily shop gift ready"
      className={cn('gift-badge-wiggle pointer-events-none block h-6 w-6', className)}
    >
      <svg viewBox="0 0 32 32" className="h-full w-full drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)]">
        <path
          d="M15.2 9.6c-1.6-3.6-6.4-5.4-7.6-2.6-1 2.4 2.8 3.6 7.6 3.6M16.8 9.6c1.6-3.6 6.4-5.4 7.6-2.6 1 2.4-2.8 3.6-7.6 3.6"
          fill="none"
          stroke="#be123c"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <rect x="5" y="14" width="22" height="14" rx="3" fill="#f59e0b" stroke="#fff" strokeWidth="2" />
        <rect x="3.5" y="9.5" width="25" height="6.5" rx="2.5" fill="#fbbf24" stroke="#fff" strokeWidth="2" />
        <rect x="14" y="10.5" width="4" height="16.5" fill="#e11d48" />
        <rect x="6" y="11" width="20" height="1.6" rx="0.8" fill="#fff" opacity="0.45" />
        <circle cx="16" cy="10.4" r="2.4" fill="#e11d48" stroke="#fff" strokeWidth="1.4" />
      </svg>
    </span>
  );
}
