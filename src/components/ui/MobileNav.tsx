'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/components/auth/AuthContext';
import { useInventory } from '@/hooks/useInventory';
import useSWR from 'swr';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { useState, useEffect } from 'react';
import { WardrobePopup } from '@/components/ui/WardrobePopup';
import { hapticTick } from '@/lib/haptics';
import { cn } from '@/lib/utils';

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { unseenCount, unseenContainerCount } = useInventory(!!user, true);
  const inventoryBadge = unseenCount + unseenContainerCount;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [wardrobePopupOpen, setWardrobePopupOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // The nav rides above the popup's backdrop while it's open — and must stay
  // raised until the exit animation lands, or the sheet slides down OVER the
  // nav the moment `open` flips false.
  const [navRaised, setNavRaised] = useState(false);
  useEffect(() => {
    if (wardrobePopupOpen) {
      setNavRaised(true);
      return;
    }
    const t = window.setTimeout(() => setNavRaised(false), 300);
    return () => window.clearTimeout(t);
  }, [wardrobePopupOpen]);

  useEffect(() => {
    setPendingHref(null);
    setWardrobePopupOpen(false);
  }, [pathname]);

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
        className={cn(
          'fixed bottom-0 left-0 w-full bg-background/90 backdrop-blur-lg md:hidden pb-[env(safe-area-inset-bottom)]',
          navRaised ? 'z-[100]' : 'z-50',
        )}
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
                  {item.label === 'Wardrobe' && inventoryBadge > 0 && (
                    <span className="absolute -top-2 -right-3 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full border-2 border-background animate-in zoom-in duration-300 shadow-sm">
                      {inventoryBadge > 9 ? '9+' : inventoryBadge}
                    </span>
                  )}
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

            if (item.label === 'Wardrobe' && user) {
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => {
                    hapticTick();
                    setWardrobePopupOpen((prev) => !prev);
                  }}
                  className={`flex flex-col items-center justify-center w-full h-full transition-[color,transform] active:scale-95 ${
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {content}
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={target}
                prefetch={true}
                onClick={(e) => {
                  hapticTick();
                  if (wardrobePopupOpen) {
                    e.preventDefault();
                    setWardrobePopupOpen(false);
                    window.setTimeout(() => {
                      if (target === item.href && pathname !== item.href) {
                        setPendingHref(item.href);
                      }
                      router.push(target);
                    }, 230);
                    return;
                  }
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

      <WardrobePopup
        open={wardrobePopupOpen}
        onClose={() => setWardrobePopupOpen(false)}
        onSelect={(tab) => {
          setWardrobePopupOpen(false);
          window.setTimeout(() => {
            router.push(`/wardrobe?tab=${tab}`);
            document
              .getElementById('main-scroll')
              ?.scrollTo({ top: 0, behavior: 'smooth' });
          }, 230);
        }}
      />
    </>
  );
}

