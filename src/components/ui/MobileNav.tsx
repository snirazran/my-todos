'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, History, LayoutDashboard, ScrollText, Shirt } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { useUIStore } from '@/lib/uiStore';
import { useInventory } from '@/hooks/useInventory';
import useSWR from 'swr';

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { isQuestsOpen, openQuests, openWardrobe } = useUIStore();
  const { unseenCount, unseenContainerCount } = useInventory(!!user, true);
  const inventoryBadge = unseenCount + unseenContainerCount;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data: questsData } = useSWR<{
    claimableCount?: number;
    activeCount?: number;
  }>(
    user ? `/api/quests?view=home&timezone=${encodeURIComponent(timezone)}` : null,
    (url: string) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false },
  );
  const questClaimableCount = questsData?.claimableCount ?? 0;
  const questActiveCount = questsData?.activeCount ?? 0;

  if (pathname === '/login' || pathname === '/register') return null;

  const handleNavigation = (path: string) => {
    if (!user) {
      router.push('/login');
      return;
    }
    router.push(path);
  };

  const navItems = [
    {
      href: '/',
      label: 'Today',
      icon: Home,
      // Home is safe for everyone
    },
    {
      href: '/planner',
      label: 'Planner',
      icon: LayoutDashboard,
      protected: true,
    },
    {
      label: 'Quests',
      icon: ScrollText,
      onClick: () => {
        if (!user) {
          router.push('/login');
          return;
        }
        if (pathname !== '/') router.push('/');
        openQuests();
      },
      isActive: isQuestsOpen,
    },
    {
      href: '/history',
      label: 'History',
      icon: History,
      protected: true,
    },
    {
      label: 'Inventory',
      icon: Shirt,
      onClick: () => {
        // Inventory is allowed for guests (WardrobePanel handles guest state)
        if (pathname !== '/') router.push('/');
        openWardrobe();
      },
      isActive: false,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 z-50 w-full bg-background/90 backdrop-blur-lg border-t border-border md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5 h-16">
        {navItems.map((item) => {
          const isActive = item.href ? pathname === item.href : item.isActive;
          const Icon = item.icon;

          const content = (
            <>
              <div className="relative">
                <Icon
                  className={`w-6 h-6 mb-1 ${isActive ? 'fill-current/20' : ''}`}
                />
                {item.label === 'Inventory' && inventoryBadge > 0 && (
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
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </>
          );

          // Custom onClick handler (Inventory)
          if (item.onClick) {
            return (
              <button
                key={item.label}
                onClick={item.onClick}
                className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {content}
              </button>
            );
          }

          // Protected Routes Logic
          return (
            <button
              key={item.href}
              onClick={() => {
                if (item.protected && !user) {
                  router.push('/login');
                } else {
                  router.push(item.href!);
                }
              }}
              className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {content}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
