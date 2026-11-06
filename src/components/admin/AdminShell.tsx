'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  BarChart3,
  Clapperboard,
  Coins,
  FlaskConical,
  Footprints,
  HandHeart,
  ListChecks,
  Menu,
  MessageCircleQuestionMark,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Paintbrush,
  Trophy,
  Wrench,
  X,
} from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

type NavGroup = { title: string | null; items: NavItem[] };

const appIcon = (name: React.ComponentProps<typeof Icon>['name']) => (
  <Icon name={name} className="h-[22px] w-[22px]" />
);

export const ADMIN_NAV: NavGroup[] = [
  {
    title: null,
    items: [{ href: '/admin', label: 'Overview', icon: appIcon('home') }],
  },
  {
    title: 'Players',
    items: [
      { href: '/admin/statistics', label: 'Statistics', icon: <BarChart3 /> },
      { href: '/admin/grants', label: 'Give rewards', icon: <HandHeart /> },
    ],
  },
  {
    title: 'Quests page',
    items: [
      { href: '/admin/quests?tab=daily', label: 'Daily quests', icon: appIcon('quests') },
      { href: '/admin/quests?tab=asks', label: 'Frog asks', icon: <MessageCircleQuestionMark /> },
      { href: '/admin/quests?tab=season', label: 'Season pass', icon: <Trophy /> },
    ],
  },
  {
    title: 'New players',
    items: [
      { href: '/admin/quests?tab=onboarding', label: 'Welcome quests', icon: <Footprints /> },
      { href: '/admin/quests?tab=areas', label: 'Focus areas', icon: appIcon('compass') },
    ],
  },
  {
    title: 'Habits & streaks',
    items: [
      { href: '/admin/quests?tab=streaks', label: 'Daily streak', icon: appIcon('lilyPad') },
      { href: '/admin/quests?tab=leap', label: 'Leap', icon: appIcon('leap') },
      { href: '/admin/modifiers?view=streak', label: 'Task streaks', icon: appIcon('repeat') },
    ],
  },
  {
    title: 'Closet & shop',
    items: [
      { href: '/admin/cosmetics', label: 'Cosmetics', icon: <Paintbrush /> },
      { href: '/admin/gifts', label: 'Gifts', icon: appIcon('closetGifts') },
      { href: '/admin/backgrounds', label: 'Backgrounds', icon: appIcon('closetBackgrounds') },
      { href: '/admin/modifiers?view=shop', label: 'Shop', icon: appIcon('store') },
      { href: '/admin/modifiers?view=trade', label: 'Trade-ups', icon: appIcon('trade') },
    ],
  },
  {
    title: 'Flies',
    items: [
      { href: '/admin/economy', label: 'Fly budget', icon: <Coins /> },
      { href: '/admin/modifiers?view=checklist', label: 'Checklists', icon: <ListChecks /> },
      { href: '/admin/modifiers?view=social', label: 'Friends & buddies', icon: appIcon('community') },
      { href: '/admin/ads', label: 'Ads & Plus', icon: <Clapperboard /> },
    ],
  },
  {
    title: 'Growth',
    items: [
      { href: '/admin/popups', label: 'Popups & offers', icon: <MessageSquare /> },
      { href: '/admin/invites', label: 'Invites', icon: appIcon('inviteFriends') },
    ],
  },
  {
    title: 'Testing',
    items: [
      { href: '/admin/tools', label: 'My test account', icon: <Wrench /> },
      { href: '/admin/leap-lab', label: 'Leap Lab', icon: <FlaskConical /> },
    ],
  },
];

const DEFAULT_PARAMS: Record<string, Record<string, string>> = {
  '/admin/quests': { tab: 'daily' },
  '/admin/modifiers': { view: 'trade' },
};

function isActive(href: string, pathname: string, params: URLSearchParams | null) {
  const [path, query] = href.split('?');
  if (path !== pathname) return false;
  if (!query) return true;
  const wanted = new URLSearchParams(query);
  let match = true;
  wanted.forEach((value, key) => {
    const current = params?.get(key) ?? DEFAULT_PARAMS[path]?.[key] ?? null;
    if (current !== value) match = false;
  });
  return match;
}

export function findAdminNavItem(pathname: string, params: URLSearchParams | null) {
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      if (isActive(item.href, pathname, params)) return { group, item };
    }
  }
  return null;
}

const COLLAPSE_KEY = 'admin-sidebar-collapsed';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/admin';
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsedPref, setCollapsedPref] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSE_KEY);
      if (stored !== null) setCollapsedPref(stored === '1');
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isDesktop) setDrawerOpen(false);
  }, [isDesktop]);

  const collapsed = collapsedPref ?? pathname.startsWith('/admin/statistics');
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsedPref(next);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  };

  const sidebarWidth = isDesktop ? (collapsed ? 76 : 260) : 0;

  return (
    <div
      className="min-h-screen bg-background text-foreground lg:flex"
      style={{ ['--admin-sidebar-w' as string]: `${sidebarWidth}px` }}
    >
      {isDesktop ? (
        <aside
          className="sticky top-0 h-screen shrink-0 border-r border-border/70 bg-[hsl(var(--primary)/0.05)] transition-[width] duration-200"
          style={{ width: sidebarWidth }}
        >
          <Suspense fallback={null}>
            <SidebarContent collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
          </Suspense>
        </aside>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-40 flex items-center gap-3 border-b border-border/70 bg-background/95 px-4 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))] backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open admin menu"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card shadow-[0_2px_0_0_hsl(var(--border))]"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Suspense fallback={<span className="text-[15px] font-black">Admin</span>}>
            <MobileTitle />
          </Suspense>
        </div>
        {children}
      </div>

      <AnimatePresence>
        {!isDesktop && drawerOpen ? (
          <>
            <motion.div
              key="admin-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-[2px]"
            />
            <motion.aside
              key="admin-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="fixed inset-y-0 left-0 z-[160] w-[290px] max-w-[85vw] border-r border-border bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl"
            >
              <div className="h-full bg-[hsl(var(--primary)/0.05)]">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close admin menu"
                  className="absolute right-3 top-[calc(12px+env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                >
                  <X className="h-5 w-5" />
                </button>
                <Suspense fallback={null}>
                  <SidebarContent collapsed={false} />
                </Suspense>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MobileTitle() {
  const pathname = usePathname() ?? '/admin';
  const params = useSearchParams();
  const found = findAdminNavItem(pathname, params);
  return (
    <div className="min-w-0">
      {found?.group.title ? (
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">{found.group.title}</p>
      ) : null}
      <p className="truncate text-[15px] font-black leading-tight">{found?.item.label ?? 'Admin'}</p>
    </div>
  );
}

function SidebarContent({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname() ?? '/admin';
  const params = useSearchParams();

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex items-center gap-3 px-4 pb-3 pt-5', collapsed && 'justify-center px-0')}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-[20px] shadow-[0_3px_0_0_#2c511a]">
          🐸
        </span>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="text-[16px] font-black leading-tight tracking-tight">Pond Control</p>
            <p className="text-[11px] font-bold text-muted-foreground">Frogress admin</p>
          </div>
        ) : null}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Admin sections">
        {ADMIN_NAV.map((group, groupIndex) => (
          <div key={group.title ?? groupIndex} className={cn(groupIndex > 0 && 'mt-4')}>
            {group.title && !collapsed ? (
              <p className="mb-1 px-3 text-[10.5px] font-black uppercase tracking-[0.14em] text-muted-foreground/75">
                {group.title}
              </p>
            ) : null}
            {group.title && collapsed ? <div className="mx-3 mb-2 h-px bg-border/80" /> : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href, pathname, params);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex items-center gap-3 rounded-xl border px-3 py-[7px] text-[14px] font-bold transition',
                        collapsed && 'justify-center px-0',
                        active
                          ? 'border-primary/25 bg-card text-foreground shadow-[0_2px_0_0_hsl(var(--primary)/0.3)]'
                          : 'border-transparent text-muted-foreground hover:bg-card/70 hover:text-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-[22px] w-[22px] shrink-0 items-center justify-center [&>svg]:h-[19px] [&>svg]:w-[19px]',
                          active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                        )}
                      >
                        {item.icon}
                      </span>
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('flex items-center gap-1 border-t border-border/70 px-3 py-3', collapsed && 'flex-col')}>
        <Link
          href="/"
          title="Back to the app"
          className={cn(
            'flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-bold text-muted-foreground transition hover:bg-card hover:text-foreground',
            collapsed && 'flex-none justify-center px-2',
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          {!collapsed ? 'Back to the app' : null}
        </Link>
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-card hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
