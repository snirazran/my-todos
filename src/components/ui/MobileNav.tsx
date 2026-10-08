'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/components/auth/AuthContext';
import useSWR from 'swr';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useWardrobeBadges } from '@/hooks/useWardrobeBadges';
import { TRADE_MIN_ITEM_COUNT } from '@/lib/skins/catalog';
import { hapticTick } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { useSheetStore } from '@/lib/sheetStore';
import { useUIStore } from '@/lib/uiStore';

const NAV_STUCK_MS = 5000;

export default function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const firstRunGuided = useUIStore((state) => state.isFirstRunGuided);
  const { inventoryBadge } = useWardrobeBadges();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const pathnameRef = useRef(pathname);
  const stuckTimerRef = useRef<number | null>(null);
  const clearStuckTimer = useCallback(() => {
    if (stuckTimerRef.current === null) return;
    window.clearTimeout(stuckTimerRef.current);
    stuckTimerRef.current = null;
  }, []);
  const watchNavigation = useCallback(
    (href: string) => {
      clearStuckTimer();
      stuckTimerRef.current = window.setTimeout(() => {
        stuckTimerRef.current = null;
        if (pathnameRef.current === href.split('?')[0]) return;
        if (navigator.onLine === false) return;
        // A sheet opened since the tap means the user moved on. Reloading out
        // from under it would throw away whatever they are in the middle of.
        if (useSheetStore.getState().count > 0) return;
        window.location.href = href;
      }, NAV_STUCK_MS);
    },
    [clearStuckTimer],
  );

  useEffect(() => {
    pathnameRef.current = pathname;
    clearStuckTimer();
    setPendingHref(null);
  }, [pathname, clearStuckTimer]);

  useEffect(() => clearStuckTimer, [clearStuckTimer]);

  const { data: questsData } = useSWR<{
    claimableCount?: number;
    activeCount?: number;
  }>(
    user ? `/api/quests?view=home&timezone=${encodeURIComponent(timezone)}` : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const questClaimableCount = questsData?.claimableCount ?? 0;
  const questActiveCount = questsData?.activeCount ?? 0;

  const { data: friendRequestsData } = useSWR<{ incoming?: { id: string }[] }>(
    user ? '/api/friends/request' : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const { data: buddyInvitesData } = useSWR<{ incoming?: unknown[] }>(
    user ? '/api/buddy/invite' : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const friendRequestCount =
    (friendRequestsData?.incoming?.length ?? 0) +
    (buddyInvitesData?.incoming?.length ?? 0);

  const { data: friendsData } = useSWR<{ claimable?: number }>(
    user ? `/api/friends?tz=${encodeURIComponent(timezone)}` : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const friendClaimable = friendsData?.claimable ?? 0;

  if (
    pathname === '/welcome' ||
    pathname === '/try' ||
    pathname === '/fly-catch' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/onboarding' ||
    pathname === '/terms' ||
    pathname === '/privacy' ||
    pathname?.startsWith('/auth/')
  ) return null;

  const navItems = [
    {
      href: '/',
      label: 'Today',
      iconName: 'home' as const,
    },
    {
      href: '/planner',
      label: 'Planner',
      iconName: 'date' as const,
      protected: true,
    },
    {
      href: '/quests',
      label: 'Quests',
      iconName: 'quests' as const,
      protected: true,
    },
    {
      href: '/wardrobe',
      label: 'Wardrobe',
      iconName: 'wardrobe' as const,
      protected: true,
    },
    {
      href: '/friends',
      label: 'Friends',
      iconName: 'community' as const,
      protected: true,
    },
  ];

  return (
    <>
      <nav
        data-app-bottom-nav
        aria-hidden={firstRunGuided || undefined}
        className="fixed bottom-0 left-0 z-50 w-full bg-background/90 backdrop-blur-lg md:hidden pb-[env(safe-area-inset-bottom)]"
        style={{
          transform: firstRunGuided ? 'translateY(110%)' : 'translateY(0)',
          pointerEvents: firstRunGuided ? 'none' : undefined,
          transition: 'transform 500ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div className="grid grid-cols-5 h-[76px] py-2.5">
          {navItems.map((item) => {
            const target = item.protected && !user ? '/login' : item.href;
            const isActive = (pendingHref ?? pathname) === item.href;
            const isPending = pendingHref === item.href && pathname !== item.href;

            const content = (
              <div className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-2xl transition-colors ${isActive ? 'bg-primary/10' : ''}`}>
                <div className={cn('relative', isPending && 'animate-pulse [animation-delay:250ms]')}>
                  <Icon
                    name={item.iconName}
                    label={item.label}
                    className={cn('w-9 h-9', item.label === 'Friends' && 'scale-125')}
                  />
                  {item.label === 'Wardrobe' && inventoryBadge > 0 ? (
                    <span className="absolute -top-2 -right-3 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full border-2 border-background animate-in zoom-in duration-300 shadow-sm">
                      {inventoryBadge > 9 ? '9+' : inventoryBadge}
                    </span>
                  ) : null}
                  {item.label === 'Quests' && questClaimableCount > 0 ? (
                    <span className="absolute -top-2 -right-3 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-amber-500 rounded-full border-2 border-background animate-in zoom-in duration-300 shadow-sm">
                      {questClaimableCount > 99 ? '99+' : questClaimableCount}
                    </span>
                  ) : item.label === 'Quests' && questActiveCount > 0 ? (
                    <span className="absolute -top-2 -right-3 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-muted-foreground rounded-full border-2 border-background shadow-sm">
                      {questActiveCount > 9 ? '9+' : questActiveCount}
                    </span>
                  ) : null}
                  {item.label === 'Friends' && friendClaimable > 0 ? (
                    <span className="absolute -top-2 -right-3 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-amber-500 rounded-full border-2 border-background animate-in zoom-in duration-300 shadow-sm">
                      {friendClaimable > 9 ? '9+' : friendClaimable}
                    </span>
                  ) : item.label === 'Friends' && friendRequestCount > 0 ? (
                    <span className="absolute -top-2 -right-3 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full border-2 border-background animate-in zoom-in duration-300 shadow-sm">
                      {friendRequestCount > 9 ? '9+' : friendRequestCount}
                    </span>
                  ) : null}
                </div>
                <span className={`text-[10px] font-bold ${isActive ? 'text-primary' : ''}`}>{item.label}</span>
              </div>
            );

            return (
              <Link
                key={item.href}
                href={target}
                prefetch={true}
                onClick={() => {
                  hapticTick();
                  if (pathname !== target) watchNavigation(target);
                  if (target === item.href && pathname !== item.href) {
                    setPendingHref(item.href);
                  }
                }}
                className={`flex flex-col items-center justify-center w-full h-full transition-[color,transform] active:scale-95 ${
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

