'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, History, LayoutDashboard, Shirt } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useUIStore } from '@/lib/uiStore';
import { useInventory } from '@/hooks/useInventory';

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { openWardrobe } = useUIStore();
  const { unseenCount } = useInventory(); // Always fetch

  const handleNavigation = (path: string) => {
    if (!session) {
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
      href: '/manage-tasks',
      label: 'Weekly',
      icon: LayoutDashboard,
      protected: true,
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
    <nav className="fixed bottom-0 left-0 z-50 w-full bg-white/90 backdrop-blur-lg border-t border-slate-200 dark:bg-slate-900/90 dark:border-slate-800 md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4 h-16">
        {navItems.map((item) => {
          const isActive = item.href ? pathname === item.href : item.isActive;
          const Icon = item.icon;
          
          const content = (
            <>
              <div className="relative">
                <Icon className={`w-6 h-6 mb-1 ${isActive ? 'fill-current/20' : ''}`} />
                {item.label === 'Inventory' && unseenCount > 0 && (
                  <span className="absolute -top-1 -right-2 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full border-2 border-white dark:border-slate-900 animate-in zoom-in duration-300 shadow-sm">
                    {unseenCount > 9 ? '9+' : unseenCount}
                  </span>
                )}
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
                    ? 'text-violet-600 dark:text-violet-400'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
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
                if (item.protected && !session) {
                  router.push('/login');
                } else {
                  router.push(item.href!);
                }
              }}
              className={`flex flex-col items-center justify-center w-full h-full transition-colors ${
                isActive
                  ? 'text-violet-600 dark:text-violet-400'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
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
