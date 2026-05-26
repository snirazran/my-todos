'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ShoppingBag } from 'lucide-react';
import Image from 'next/image';
import { useAuth } from '@/components/auth/AuthContext';
import { useInventory } from '@/hooks/useInventory';
import useSWR from 'swr';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { unseenCount, unseenContainerCount } = useInventory(!!user, true);
  const inventoryBadge = unseenCount + unseenContainerCount;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [wardrobePopupOpen, setWardrobePopupOpen] = useState(false);

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

  if (pathname === '/welcome' || pathname === '/login' || pathname === '/register' || pathname === '/onboarding' || pathname?.startsWith('/auth/')) return null;

  const navItems = [
    {
      href: '/',
      label: 'Today',
      iconSrc: '/icons/Home.svg',
    },
    {
      href: '/planner',
      label: 'Planner',
      iconSrc: '/icons/Planner.svg',
      protected: true,
    },
    {
      label: 'Quests',
      iconSrc: '/icons/Quests.svg',
      onClick: () => {
        if (!user) {
          router.push('/login');
          return;
        }
        router.push('/quests');
      },
      isActive: pathname === '/quests',
    },
    {
      label: 'Wardrobe',
      iconSrc: '/icons/Wardrobe.svg',
      onClick: () => {
        if (!user) {
          router.push('/login');
          return;
        }
        router.push('/wardrobe');
      },
      isActive: pathname === '/wardrobe',
    },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 z-50 w-full bg-background/90 backdrop-blur-lg border-t border-border md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4 h-16">
          {navItems.map((item) => {
            const isActive = item.href ? pathname === item.href : item.isActive;

            const content = (
              <>
                <div className="relative">
                  <Image
                    src={item.iconSrc}
                    alt={item.label}
                    width={32}
                    height={32}
                    className={`w-8 h-8 mb-1 ${isActive ? 'opacity-100' : 'opacity-60'}`}
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
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </>
            );

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

      <WardrobePopup
        open={wardrobePopupOpen}
        onClose={() => setWardrobePopupOpen(false)}
        onSelect={(tab) => {
          setWardrobePopupOpen(false);
          router.push(`/wardrobe?tab=${tab}`);
        }}
      />
    </>
  );
}

function WardrobePopup({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (tab: 'inventory' | 'shop' | 'trade') => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const items = [
    {
      tab: 'inventory' as const,
      label: 'Inventory',
      iconSrc: '/icons/Wardrobe.svg',
      color: 'bg-primary/10',
    },
    {
      tab: 'shop' as const,
      label: 'Shop',
      icon: ShoppingBag,
      color: 'text-violet-500 bg-violet-500/10',
    },
    {
      tab: 'trade' as const,
      label: 'Trade',
      iconSrc: '/icons/Repeat.svg',
      color: 'bg-amber-500/10',
    },
  ];

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[48] bg-background/70 backdrop-blur-sm md:hidden"
          />

          {/* Sheet — anchored just above the nav bar */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="fixed left-0 right-0 z-[49] bg-background border-t border-border rounded-t-3xl shadow-2xl md:hidden"
            style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom))' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 pb-3">
              <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <Image src="/icons/Wardrobe.svg" alt="Wardrobe" width={20} height={20} className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground leading-none mb-0.5">
                  Style Studio
                </p>
                <h2 className="text-xl font-black text-foreground leading-none">
                  Wardrobe
                </h2>
              </div>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-3 gap-3 px-4 pb-5">
              {items.map((item) => (
                <button
                  key={item.tab}
                  onClick={() => onSelect(item.tab)}
                  className="flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-card border border-border/50 active:scale-95 transition-all"
                >
                  <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${item.color}`}>
                    {'iconSrc' in item && item.iconSrc ? (
                      <Image src={item.iconSrc} alt={item.label} width={28} height={28} className="w-7 h-7" />
                    ) : 'icon' in item && item.icon ? (
                      (() => { const Icon = item.icon; return <Icon className="w-7 h-7" />; })()
                    ) : null}
                  </div>
                  <span className="text-sm font-bold text-foreground">{item.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
