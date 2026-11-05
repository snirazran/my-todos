'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { GiftBadge } from '@/components/ui/GiftBadge';
import { useWardrobeBadges } from '@/hooks/useWardrobeBadges';
import { hapticTick } from '@/lib/haptics';
import { useUIStore } from '@/lib/uiStore';
import { cn } from '@/lib/utils';

let currentPath: string | null = null;
let previousPath: string | null = null;

export function useRouteHistory() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || pathname === currentPath) return;
    previousPath = currentPath;
    currentPath = pathname;
  }, [pathname]);
}

export function previousRoute() {
  return previousPath;
}

const ROUND_BUTTON =
  'grid h-11 w-11 place-items-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur-md transition-[background-color,transform] hover:bg-background active:scale-95';

export function WardrobeMobileChrome() {
  const router = useRouter();
  const loading = useUIStore((s) => s.isLoadingScreenVisible);
  const onTrade = useUIStore((s) => s.wardrobeTab) === 'trade';
  const { shopGiftReady } = useWardrobeBadges();

  return (
    <>
      {!onTrade && (
      <button
        type="button"
        data-fly-fade
        onClick={() => {
          hapticTick();
          router.push('/shop');
        }}
        className={cn(
          'group fixed right-4 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[90] flex flex-col items-center gap-0.5 focus-visible:outline-none md:hidden',
          loading && 'pointer-events-none',
        )}
      >
        <span
          className={cn(
            'relative group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2',
            ROUND_BUTTON,
            'group-active:scale-95',
          )}
        >
          <Icon name="store" className="h-7 w-7" />
          {shopGiftReady && (
            <GiftBadge className="absolute -right-2 -top-2 animate-in zoom-in duration-300" />
          )}
        </span>
        <span className="text-[11px] font-black leading-none text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.55)]">
          Shop
        </span>
      </button>
      )}
    </>
  );
}
