import { cn } from '@/lib/utils';

export function GiftBadge({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Daily shop gift ready"
      className={cn('gift-badge-wiggle pointer-events-none block h-6 w-6', className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/gift1.webp"
        alt=""
        draggable={false}
        className="h-full w-full object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)]"
      />
    </span>
  );
}
