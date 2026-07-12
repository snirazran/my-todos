// components/SiteHeader.tsx
'use client';

import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import {
  ShoppingBag,
  Sparkles,
  LogIn,
  LogOut,
} from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { useUIStore } from '@/lib/uiStore';
import { clearSessionCookie } from '@/lib/authCookie';
import { signOutNativeGoogle } from '@/lib/googleAuth';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useInventory } from '@/hooks/useInventory';
import IntegrationsPanel, {
  useCalendarConnections,
} from '@/components/ui/CalendarSyncSection';
import {
  SkinRotationRow,
  SkinRotationDialog,
  StyleShuffleHeaderButton,
  getRotationInterval,
  setRotationInterval,
  labelForInterval,
  type RotationInterval,
} from '@/components/ui/SkinRotation';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import useSWR, { mutate as swrMutate } from 'swr';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { FlyCounter } from '@/components/ui/FlyCounter';
import { StreakChip } from '@/components/ui/streak/StreakChip';
import { PremiumBadge } from '@/components/ui/PremiumBadge';
import { CurrencyShop } from './shop/CurrencyShop';
import { HelpCenterPanel, ContactPanel } from '@/components/ui/HelpCenter';
import { cn } from '@/lib/utils';

const wardrobeItems = [
  { tab: 'inventory' as const, label: 'Inventory', iconName: 'wardrobe' as const, color: 'bg-primary/10' },
  { tab: 'shop' as const, label: 'Shop', icon: ShoppingBag, color: 'text-violet-500 bg-violet-500/10' },
  { tab: 'trade' as const, label: 'Trade', iconName: 'repeat' as const, color: 'bg-amber-500/10' },
];

export default function SiteHeader() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const {
    isLoadingScreenVisible,
    isWardrobeStuck,
    openFlyShop,
  } = useUIStore();
  const { unseenCount, unseenContainerCount, data: inventoryData } = useInventory(!!user, true);
  const flyBalance = inventoryData?.wardrobe?.flies;
  const inventoryBadge = unseenCount + unseenContainerCount;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [wardrobeDropdownOpen, setWardrobeDropdownOpen] = useState(false);
  const wardrobeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wardrobeRef.current && !wardrobeRef.current.contains(event.target as Node)) {
        setWardrobeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data: questsData } = useSWR<{
    claimableCount?: number;
    activeCount?: number;
  }>(
    user ? `/api/quests?view=home&timezone=${encodeURIComponent(timezone)}` : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const questClaimableCount = questsData?.claimableCount ?? 0;

  const { data: friendsData } = useSWR<{ claimable?: number }>(
    user ? `/api/friends?tz=${encodeURIComponent(timezone)}` : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const friendClaimable = friendsData?.claimable ?? 0;
  const { data: buddyInvitesData } = useSWR<{ incoming?: unknown[] }>(
    user ? '/api/buddy/invite' : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const { data: friendRequestsData } = useSWR<{ incoming?: unknown[] }>(
    user ? '/api/friends/request' : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const friendAlerts =
    (buddyInvitesData?.incoming?.length ?? 0) +
    (friendRequestsData?.incoming?.length ?? 0);
  const questActiveCount = questsData?.activeCount ?? 0;

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
      label: 'Wardrobe',
      iconName: 'wardrobe' as const,
      onClick: () => {
        if (!user) { router.push('/login'); return; }
        router.push('/wardrobe');
      },
      isActive: pathname === '/wardrobe',
    },
    {
      href: '/friends',
      label: 'Friends',
      iconName: 'community' as const,
      protected: true,
    },
  ];

  // Desktop keeps a full header. Mobile only gets lightweight home-page controls.
  if (pathname === '/onboarding' || pathname === '/welcome' || pathname === '/try' || pathname === '/login' || pathname?.startsWith('/auth/')) return null;

  return (
    <>
      {(pathname === '/' || pathname === '/wardrobe' || pathname === '/friends') && (
        <div
          className={cn(
            'fixed left-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[90] flex items-center px-2 py-1 md:hidden',
            isLoadingScreenVisible && 'pointer-events-none',
          )}
          aria-disabled={isLoadingScreenVisible}
        >
          <RightActions
            user={user}
            loading={loading}
            onSignIn={() => router.push('/login')}
            onSignOut={() => window.location.replace('/login')}
            compactMobileHome
          />
        </div>
      )}
      {(pathname === '/' || pathname === '/wardrobe') &&
        user &&
        flyBalance !== undefined && (
          <div
            className={cn(
              'fixed right-4 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[90] flex items-center gap-2 px-2 py-1 md:hidden',
              isLoadingScreenVisible && 'pointer-events-none',
            )}
            aria-disabled={isLoadingScreenVisible}
          >
            {(pathname === '/' || pathname === '/wardrobe') && (
              <StyleShuffleHeaderButton />
            )}
            <PremiumBadge />
            <StreakChip variant="mobile" />
            <FlyCounter
              balance={flyBalance}
              variant="mobile"
              onClick={openFlyShop}
            />
          </div>
        )}
      <header
        className={cn(
          'relative z-[90] hidden w-full h-16 bg-background/95 backdrop-blur-xl md:block',
          pathname !== '/planner' &&
            !(pathname === '/wardrobe' && isWardrobeStuck) &&
            'shadow-lg shadow-black/5 dark:shadow-black/20',
        )}
      >
      <div className="flex items-center justify-between h-full gap-4 px-6 py-3 mx-auto max-w-7xl md:px-10">
        {/* ───────── Logo ───────── */}
        <Link
          href="/"
          className="relative inline-flex items-center gap-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg shrink-0"
        >
          <span className="text-2xl font-black tracking-tighter text-transparent bg-gradient-to-r from-primary via-emerald-500 to-primary bg-clip-text transition-all group-hover:opacity-80">
            Frogress
          </span>
          <Sparkles
            className="h-5 w-5 text-emerald-400 animate-[float_3s_ease-in-out_infinite]"
            aria-hidden
          />
        </Link>

        <CurrencyShop />

        {/* ───────── Desktop Navigation (Centered) ───────── */}
        <div className="hidden md:flex flex-1 min-w-0 items-center justify-center gap-0.5 xl:gap-1">
          {navItems.map((item) => {
            const isActive = item.href ? pathname === item.href : item.isActive;

            const buttonClass = `
              relative flex items-center gap-1.5 xl:gap-2 px-2.5 xl:px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all
              ${
                isActive
                  ? 'bg-primary/10 text-primary hover:bg-primary/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }
            `;

            if (item.label === 'Wardrobe') {
              return (
                <div key={item.label} className="relative" ref={wardrobeRef}>
                  <button onClick={item.onClick} className={buttonClass}>
                    <Icon name={item.iconName} label={item.label} className="w-8 h-8" />
                    <span className="hidden xl:inline">{item.label}</span>
                    {inventoryBadge > 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ml-1">
                        {inventoryBadge > 9 ? '9+' : inventoryBadge}
                      </span>
                    )}
                  </button>

                  <AnimatePresence>
                    {wardrobeDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.96 }}
                        transition={{ duration: 0.18 }}
                        className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-72 origin-top"
                      >
                        <div className="p-3 bg-popover border border-border rounded-2xl shadow-xl ring-1 ring-black/5">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1 pb-2">
                            Style Studio
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {wardrobeItems.map((wItem) => (
                              <button
                                key={wItem.tab}
                                onClick={() => {
                                  setWardrobeDropdownOpen(false);
                                  router.push(`/wardrobe?tab=${wItem.tab}`);
                                }}
                                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-all active:scale-95"
                              >
                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${wItem.color}`}>
                                  {'iconName' in wItem && wItem.iconName ? (
                                    <Icon name={wItem.iconName} label={wItem.label} className="w-5 h-5" />
                                  ) : 'icon' in wItem && wItem.icon ? (
                                    (() => { const WIcon = wItem.icon; return <WIcon className="w-5 h-5" />; })()
                                  ) : null}
                                </div>
                                <span className="text-xs font-bold text-foreground">{wItem.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.protected && !user ? '/login' : item.href!}
                prefetch={true}
                className={buttonClass}
              >
                <Icon
                  name={item.iconName}
                  label={item.label}
                  className={`w-8 h-8 ${item.label === 'Friends' ? 'scale-125' : ''}`}
                />
                <span className="hidden xl:inline">{item.label}</span>
                {item.label === 'Quests' && questClaimableCount > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white shadow-sm ml-1">
                    {questClaimableCount > 99 ? '99+' : questClaimableCount}
                  </span>
                ) : item.label === 'Quests' && questActiveCount > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted-foreground px-1 text-[10px] font-bold text-white shadow-sm ml-1">
                    {questActiveCount > 9 ? '9+' : questActiveCount}
                  </span>
                ) : item.label === 'Friends' && friendAlerts > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm ml-1">
                    {friendAlerts > 9 ? '9+' : friendAlerts}
                  </span>
                ) : item.label === 'Friends' && friendClaimable > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white shadow-sm ml-1">
                    {friendClaimable > 9 ? '9+' : friendClaimable}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        {/* ───────── Right Side (Desktop: User Menu, Mobile: Hamburger) ───────── */}
        <div className="flex items-center gap-3 shrink-0">
          <RightActions
            user={user}
            loading={loading}
            onSignIn={() => router.push('/login')}
            onSignOut={() => window.location.replace('/login')}
          />

          {user &&
            flyBalance !== undefined &&
            (pathname === '/' ||
              pathname === '/wardrobe' ||
              pathname === '/friends') && (
              <StyleShuffleHeaderButton className="hover:bg-muted" />
            )}

          {user && flyBalance !== undefined && (
            <>
              <PremiumBadge />
              <StreakChip variant="desktop" />
              <FlyCounter
                balance={flyBalance}
                variant="desktop"
                onClick={openFlyShop}
              />
            </>
          )}
        </div>
        <style jsx>{`
          @keyframes float {
            0%,
            100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-4px);
            }
          }
        `}</style>
      </div>
      </header>
    </>
  );
}

// ─── Sub-Components ───

import {
  Menu,
  X,
  Check,
  Laptop,
  Moon,
  Sun,
  User,
  Settings,
  Bell,
  BellRing,
  Mail,
  SlidersHorizontal,
  Database,
  Pause,
  CreditCard,
  HelpCircle,
  AlertTriangle,
  ChevronLeft,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useNotificationStatus } from '@/hooks/useNotificationStatus';
import { InviteFriendsModal } from '@/components/ui/InviteFriendsModal';
import { CommunityPanel } from '@/components/ui/CommunityModal';
import { ProfilePanel } from '@/components/ui/ProfileModal';

function RightActions({
  user,
  loading,
  onSignIn,
  onSignOut,
  compactMobileHome = false,
}: {
  user: any;
  loading: boolean;
  onSignIn: () => void;
  onSignOut: () => Promise<void> | void;
  compactMobileHome?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { theme, resolvedTheme, setTheme } = useTheme();
  const activeTheme = resolvedTheme ?? theme;
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { openQuestOnboarding } = useUIStore();
  const { isAdmin } = useIsAdmin();

  // No click-outside listener needed — the settings sheet covers the entire viewport.

  const handleSignOut = async () => {
    setSigningOut(true);
    await Promise.allSettled([
      auth ? signOut(auth) : Promise.resolve(),
      clearSessionCookie(),
      signOutNativeGoogle(),
    ]);
    await swrMutate(() => true, undefined, { revalidate: false });
    await onSignOut();
  };

  const handleOpenQuestOnboarding = () => {
    openQuestOnboarding();
    setIsOpen(false);
    if (pathname !== '/') {
      router.push('/');
    }
  };

  const cycleTheme = () => {
    const modes = ['light', 'dark', 'system'];
    const nextIndex = (modes.indexOf(theme || 'light') + 1) % modes.length;
    setTheme(modes[nextIndex]);
  };

  const currentIcon =
    theme === 'system' ? Laptop : theme === 'dark' ? Moon : Sun;
  const currentLabel =
    theme === 'system'
      ? 'System'
      : theme === 'dark'
        ? 'Dark Mode'
        : 'Light Mode';
  const currentColor =
    theme === 'system'
      ? ''
      : theme === 'dark'
        ? 'text-violet-400'
        : 'text-amber-500';

  const signOutOverlay =
    signingOut && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[200]">
            <LoadingScreen />
          </div>,
          document.body,
        )
      : null;

  if (loading)
    return (
      <>
        {signOutOverlay}
        <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
      </>
    );

  // NOT AUTHENTICATED
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        {signOutOverlay}
        {/* Desktop: Theme Toggle adjacent to Sign In */}
        <div className="hidden md:block">
          <ThemeToggle />
        </div>
        {pathname !== '/login' && !compactMobileHome && (
          <Button
            onClick={onSignIn}
            className="gap-2 font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 rounded-full"
            size="sm"
          >
            <LogIn className="w-4 h-4" />
            Sign in
          </Button>
        )}
        {/* Mobile: Hamburger for Theme (since Sign In is visible) */}
        <div className="md:hidden">
          <MobileMenuButton isOpen={isOpen} setIsOpen={setIsOpen} />
          <MobileSheet
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            onSignOut={handleSignOut}
            onSignIn={onSignIn}
            showAuth={false}
            theme={activeTheme}
            setTheme={setTheme}
          />
        </div>
      </div>
    );
  }

  // AUTHENTICATED
  return (
    <div className="relative" ref={menuRef}>
      {signOutOverlay}
      {/* Desktop Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Open menu"
        className="hidden md:flex h-10 items-center justify-center p-1 rounded-full border border-border/50 bg-background hover:bg-accent/50 transition-all group"
      >
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-sm group-hover:shadow-md transition-all">
          <span>{user.displayName?.[0] || 'U'}</span>
        </div>
      </button>

      {/* Mobile Trigger */}
      <div className="md:hidden">
        <MobileMenuButton isOpen={isOpen} setIsOpen={setIsOpen} />
      </div>

      {/* Settings Sheet (mobile + desktop) */}
      <MobileSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSignOut={handleSignOut}
        user={user}
        showAuth={true}
        theme={activeTheme}
        setTheme={setTheme}
        onSignIn={onSignIn}
        onOpenQuestOnboarding={handleOpenQuestOnboarding}
        pathname={pathname}
        isAdmin={isAdmin}
      />
    </div>
  );
}

function MobileMenuButton({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className="p-2 rounded-full bg-card/80 border border-border/50 shadow-sm backdrop-blur-xl text-muted-foreground hover:text-foreground transition-colors"
    >
      {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
    </button>
  );
}

type UserInfo = {
  name?: string | null;
  frogName?: string | null;
  birthday?: string | null;
  isPremium?: boolean;
  premiumUntil?: string | null;
};

const userInfoFetcher = bootstrapFetcher;

const sheetTransition = {
  duration: 0.3,
  ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
};

function MobileSheet({
  isOpen,
  onClose,
  onSignOut,
  onSignIn,
  user,
  showAuth,
  theme,
  setTheme,
  onOpenQuestOnboarding,
  pathname,
  isAdmin,
}: any) {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  // Register this full-screen menu as an open popup so the Frogodoro timer
  // treats it as a blocker (its finished-session popup then shows globally,
  // above the menu, instead of behind it).
  useRegisterOpenSheet(isOpen);
  const [view, setView] = useState<
    'main' | 'preferences' | 'notifications' | 'community' | 'profile' | 'helpCenter' | 'contact' | 'integrations'
  >('main');
  const [contactTopic, setContactTopic] = useState<'question' | 'bug'>('question');
  const [contactBack, setContactBack] = useState<'main' | 'helpCenter'>('main');
  const [toast, setToast] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const { canEnable: canEnableNotifs, isEnabled: notifsEnabled, isNative, isWeb, enableOrConfigure, disable: disableNotifs, loading: notifLoading } = useNotificationStatus();
  const { data: userInfo, mutate: refreshUserInfo } = useSWR<UserInfo>(
    showAuth && user ? '/api/user' : null,
    userInfoFetcher,
    { revalidateOnFocus: false },
  );

  useEffect(() => setMounted(true), []);

  // Swipe-to-close is enabled on mobile only (the desktop sheet is a centered card).
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Reset to main view whenever the sheet opens
  useEffect(() => {
    if (isOpen) setView('main');
  }, [isOpen]);

  const sheetControls = useAnimationControls();
  const subviewControls = useAnimationControls();
  useEffect(() => {
    if (isOpen) sheetControls.start({ x: 0, transition: sheetTransition });
  }, [isOpen, sheetControls]);
  useEffect(() => {
    if (isOpen && view !== 'main')
      subviewControls.start({ x: 0, transition: sheetTransition });
  }, [isOpen, view, subviewControls]);

  const flashSoon = (label: string) => {
    setToast(`${label} — coming soon`);
    window.setTimeout(() => setToast(null), 1800);
  };

  const handleEnableNotifs = async () => {
    const next = await enableOrConfigure();
    if (next === 'granted') setToast('Notifications enabled');
    else if (next === 'denied')
      setToast(
        isWeb
          ? 'Blocked — allow notifications in your browser site settings.'
          : 'Opening settings — turn notifications on there.',
      );
    else setToast('Permission still pending');
    window.setTimeout(() => setToast(null), 2500);
  };

  const handleDisableNotifs = async () => {
    await disableNotifs();
    setToast('Notifications turned off on this device');
    window.setTimeout(() => setToast(null), 2500);
  };

  if (!mounted) return null;

  const displayName = userInfo?.name || user?.displayName || 'You';
  const frogName = userInfo?.frogName || 'Frog';
  const goBack = () => setView(view === 'contact' ? contactBack : 'main');

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={sheetControls}
          exit={{ x: '100%' }}
          transition={sheetTransition}
          drag={isMobile && view === 'main' ? 'x' : false}
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 0.9 }}
          dragMomentum={false}
          dragTransition={{ bounceStiffness: 400, bounceDamping: 40 }}
          onDragEnd={(_e, info) => {
            if (info.offset.x > 90 || info.velocity.x > 500) {
              sheetControls
                .start({ x: '100%', transition: sheetTransition })
                .then(onClose);
            }
          }}
          style={{ touchAction: 'pan-y' }}
          className="fixed z-[1340] inset-0 h-[100dvh] w-full overflow-hidden bg-slate-100 dark:bg-background md:bg-white dark:md:bg-background will-change-transform"
        >
        <div className="absolute inset-0 overflow-y-auto">
        <div className="mx-auto w-full md:max-w-xl md:min-h-full md:bg-slate-100 md:border-x md:border-border/60 md:shadow-[0_0_0_6px_rgba(15,23,42,0.10)] dark:md:bg-background">
          {/* Top bar */}
          <div
            className="sticky top-0 z-10 bg-slate-100/80 backdrop-blur-xl dark:bg-background/80"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div className="px-4 py-3 flex items-center justify-between">
              <button
                onClick={onClose}
                className="p-2 -ml-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="w-10 shrink-0" aria-hidden />
            </div>
          </div>

          <div className="px-5 pb-10 space-y-5">
            {showAuth && user ? (
                <MainView
                  displayName={displayName}
                  frogName={frogName}
                  isPremium={!!userInfo?.isPremium}
                  premiumUntil={userInfo?.premiumUntil ?? null}
                  isAdmin={!!isAdmin}
                  canEnableNotifs={canEnableNotifs}
                  notifsEnabled={notifsEnabled}
                  isNative={isNative}
                  isWeb={isWeb}
                  notifLoading={notifLoading}
                  onEnableNotifs={handleEnableNotifs}
                  onOpenNotifications={() => setView('notifications')}
                  onOpenPreferences={() => setView('preferences')}
                  onOpenIntegrations={() => setView('integrations')}
                  onOpenQuestFocus={() => {
                    onOpenQuestOnboarding();
                    onClose();
                  }}
                  onInviteFriends={() => setInviteOpen(true)}
                  onOpenCommunity={() => setView('community')}
                  onOpenProfile={() => setView('profile')}
                  onOpenPlus={() => setPlusOpen(true)}
                  onReportIssue={() => {
                    setContactTopic('bug');
                    setContactBack('main');
                    setView('contact');
                  }}
                  onHelpCenter={() => setView('helpCenter')}
                  onGoAdmin={() => {
                    router.push('/admin');
                    onClose();
                  }}
                  onSignOut={() => {
                    onSignOut();
                    onClose();
                  }}
                  flashSoon={flashSoon}
                  theme={theme}
                  setTheme={setTheme}
                />
            ) : (
              <SignedOutView onSignIn={onSignIn} onClose={onClose} />
            )}
          </div>
        </div>
        </div>

        <AnimatePresence>
          {view !== 'main' && (
        <motion.div
          key="subview"
          initial={{ x: '100%' }}
          animate={subviewControls}
          exit={{ x: '100%' }}
          transition={sheetTransition}
          drag={isMobile ? 'x' : false}
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 0.9 }}
          dragMomentum={false}
          dragTransition={{ bounceStiffness: 400, bounceDamping: 40 }}
          onDragEnd={(_e, info) => {
            if (info.offset.x > 90 || info.velocity.x > 500) {
              const target = view === 'contact' ? contactBack : 'main';
              if (target === 'main') {
                subviewControls
                  .start({ x: '100%', transition: sheetTransition })
                  .then(() => setView('main'));
              } else {
                setView(target);
              }
            }
          }}
          style={{ touchAction: 'pan-y' }}
          className="absolute inset-0 overflow-y-auto bg-slate-100 dark:bg-background md:bg-white dark:md:bg-background will-change-transform"
        >
        <div className="mx-auto w-full md:max-w-xl md:min-h-full md:bg-slate-100 md:border-x md:border-border/60 md:shadow-[0_0_0_6px_rgba(15,23,42,0.10)] dark:md:bg-background">
          <div
            className="sticky top-0 z-10 bg-slate-100/80 backdrop-blur-xl dark:bg-background/80"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div className="px-4 py-3 flex items-center justify-between">
              <button
                onClick={goBack}
                className="p-2 -ml-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Back"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h2 className="min-w-0 flex-1 truncate text-center text-base font-black tracking-tight">
                {
                  {
                    preferences: 'Preferences',
                    notifications: 'Notifications',
                    community: 'Join our frog community',
                    profile: 'Profile',
                    helpCenter: 'Help center',
                    contact: 'Contact us',
                    integrations: 'Integrations',
                  }[view]
                }
              </h2>
              <div className="w-10 shrink-0" aria-hidden />
            </div>
          </div>

          <div className="px-5 pb-10 space-y-5">
            {view === 'preferences' ? (
              <PreferencesView
                theme={theme}
                setTheme={setTheme}
                onOpenQuestOnboarding={() => {
                  onOpenQuestOnboarding();
                  onClose();
                }}
              />
            ) : view === 'notifications' ? (
              <NotificationsView
                notifsEnabled={notifsEnabled}
                notifLoading={notifLoading}
                isWeb={isWeb}
                onEnableNotifs={handleEnableNotifs}
                onDisableNotifs={handleDisableNotifs}
                onManageEmail={() => flashSoon('Email notifications')}
              />
            ) : view === 'integrations' ? (
              <IntegrationsPanel />
            ) : view === 'community' ? (
              <CommunityPanel />
            ) : view === 'helpCenter' ? (
              <HelpCenterPanel
                onContact={() => {
                  setContactTopic('question');
                  setContactBack('helpCenter');
                  setView('contact');
                }}
                onNavigate={onClose}
              />
            ) : view === 'contact' ? (
              <ContactPanel
                uid={user?.uid ?? 'guest'}
                isPremium={!!userInfo?.isPremium}
                defaultTopic={contactTopic}
              />
            ) : (
              <ProfilePanel
                data={{
                  petName: userInfo?.frogName ?? null,
                  yourName: userInfo?.name ?? user?.displayName ?? null,
                  birthday: userInfo?.birthday ?? null,
                  isGuest: !user || !!user?.isAnonymous,
                }}
                onCreateAccount={() => {
                  router.push('/login?upgrade=1');
                  onClose();
                }}
                onDeleteData={async () => {
                  try {
                    const res = await fetch('/api/user', { method: 'DELETE' });
                    if (!res.ok) throw new Error('Failed to delete account');
                    onSignOut();
                    onClose();
                  } catch (err) {
                    console.error(err);
                    flashSoon('Could not delete account');
                  }
                }}
                onSave={async (field, value) => {
                  const fieldMap: Record<string, string> = {
                    petName: 'frogName',
                    yourName: 'name',
                    birthday: 'birthday',
                  };
                  const apiField = fieldMap[field];
                  if (!apiField) return;
                  try {
                    await fetch('/api/user', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ [apiField]: value }),
                    });
                    await refreshUserInfo();
                  } catch (err) {
                    console.error('Failed to save profile field', err);
                  }
                }}
              />
            )}
          </div>
        </div>
        </motion.div>
          )}
        </AnimatePresence>

          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="fixed left-1/2 top-16 z-[200] -translate-x-1/2 rounded-full bg-foreground text-background px-4 py-2 text-xs font-bold shadow-lg"
              >
                {toast}
              </motion.div>
            )}
          </AnimatePresence>
          <InviteFriendsModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
          <PlusUpgradeModal open={plusOpen} placement="settings_menu" onClose={() => setPlusOpen(false)} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function MainView({
  displayName,
  frogName,
  isPremium,
  premiumUntil,
  isAdmin,
  canEnableNotifs,
  notifsEnabled,
  isNative,
  isWeb,
  notifLoading,
  onEnableNotifs,
  onOpenNotifications,
  onOpenPreferences,
  onOpenIntegrations,
  onOpenQuestFocus,
  onInviteFriends,
  onOpenCommunity,
  onOpenProfile,
  onOpenPlus,
  onReportIssue,
  onHelpCenter,
  onGoAdmin,
  onSignOut,
  flashSoon,
  theme,
  setTheme,
}: {
  displayName: string;
  frogName: string;
  isPremium: boolean;
  premiumUntil: string | null;
  isAdmin: boolean;
  canEnableNotifs: boolean;
  notifsEnabled: boolean;
  theme?: string;
  setTheme: (t: string) => void;
  isNative: boolean;
  isWeb: boolean;
  notifLoading: boolean;
  onEnableNotifs: () => void;
  onOpenNotifications: () => void;
  onOpenPreferences: () => void;
  onOpenIntegrations: () => void;
  onOpenQuestFocus: () => void;
  onInviteFriends: () => void;
  onOpenCommunity: () => void;
  onOpenProfile: () => void;
  onOpenPlus: () => void;
  onReportIssue: () => void;
  onHelpCenter: () => void;
  onGoAdmin: () => void;
  onSignOut: () => Promise<void> | void;
  flashSoon: (label: string) => void;
}) {
  const [plusInfoOpen, setPlusInfoOpen] = useState(false);
  const { connections } = useCalendarConnections();
  const activeConnections = connections.filter((c) => c.status === 'active').length;
  const needsAttention = connections.some((c) => c.status !== 'active');
  const premiumUntilDate = premiumUntil ? new Date(premiumUntil) : null;
  const premiumUntilLabel = premiumUntilDate
    ? premiumUntilDate.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;
  return (
    <div className="space-y-5">
      {/* User card */}
      <div className="rounded-2xl bg-card border border-border/50 px-5 py-4 shadow-sm">
        <p className="text-xl font-black tracking-tight truncate">
          <span>{displayName}</span>
          <span className="text-muted-foreground mx-1.5">&amp;</span>
          <span>{frogName}</span>
        </p>
      </div>

      {/* Enable notifications promo (mobile + web, when not enabled) */}
      {(isNative || isWeb) && canEnableNotifs && !notifsEnabled && (
        <PromoCard
          icon={<Bell className="w-7 h-7 text-amber-300" strokeWidth={2.5} />}
          title="Enable notifications"
          subtitle={`Get reminded to check in on ${frogName}!`}
          actionLabel={notifLoading ? 'Enabling…' : 'Enable'}
          onAction={onEnableNotifs}
          disabled={notifLoading}
        />
      )}

      {/* Quick action tiles */}
      <QuickTilesGrid
        theme={theme}
        setTheme={setTheme}
        onOpenQuestFocus={onOpenQuestFocus}
        onOpenPreferences={onOpenPreferences}
        onOpenIntegrations={onOpenIntegrations}
        calendarSubtitle={
          needsAttention
            ? 'Action needed'
            : activeConnections > 0
              ? 'Connected'
              : 'Sync your events'
        }
      />

      {/* Frogress Plus promo */}
      {!isPremium && (
        <button
          type="button"
          onClick={onOpenPlus}
          aria-label="Unlock Frogress Plus"
          className="group relative isolate w-full text-left rounded-2xl px-4 py-4 flex items-center gap-3 text-emerald-950 ring-2 ring-amber-200/80 transition-transform active:scale-[0.98]"
        >
          <span
            aria-hidden
            className="absolute inset-0 -z-10 rounded-2xl bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
          />
          <span aria-hidden className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/45 to-transparent" />
          <span className="-my-4 -ml-1 shrink-0 inline-flex">
            <Icon
              name="frogPlus"
              className="w-16 h-16 drop-shadow-[0_3px_0_rgba(31,98,28,0.35)] animate-wiggle [animation-duration:1.8s]"
            />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-base font-black tracking-tight flex items-center gap-2 text-emerald-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
              Frogress
              <span className="inline-flex items-center rounded-md bg-gradient-to-b from-emerald-600 to-emerald-800 px-1.5 py-0.5 text-[10px] font-black uppercase leading-none tracking-[0.18em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_3px_rgba(0,0,0,0.22)] ring-1 ring-emerald-900/40">
                Plus
              </span>
            </p>
            <p className="text-xs font-semibold text-emerald-900/75">All quests at once &amp; double rewards!</p>
          </div>
          <span
            aria-hidden
            className="hidden min-[380px]:inline-flex shrink-0 items-center rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-800 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(0,0,0,0.25)] ring-1 ring-emerald-900/40"
          >
            Try 7 days free
          </span>
        </button>
      )}

      {/* Community */}
      <MenuSection title="Community">
        <MenuRow
          icon={<Icon name="inviteFriends" label="Invite friends" className="w-10 h-10" />}
          label="Invite friends"
          onClick={onInviteFriends}
        />
        <MenuRow
          icon={<Icon name="community" label="Community" className="w-10 h-10" />}
          label="Join our frog community"
          onClick={onOpenCommunity}
        />
      </MenuSection>

      {/* Account */}
      <MenuSection title="Account">
        {(isNative || isWeb) && (
          <MenuRow
            icon={<Bell className="w-7 h-7 text-amber-500" />}
            label="Notifications"
            trailing={
              <span className="text-[11px] font-bold text-muted-foreground">
                {notifsEnabled ? 'On' : 'Off'}
              </span>
            }
            onClick={onOpenNotifications}
          />
        )}
        <MenuRow
          icon={<User className="w-7 h-7 text-sky-500" />}
          label="Profile"
          onClick={onOpenProfile}
        />
        <MenuRow
          icon={<Icon name="googleCalendar" label="Integrations" className="w-7 h-7" />}
          label="Integrations"
          trailing={
            needsAttention ? (
              <span className="text-[11px] font-bold text-amber-600">Action needed</span>
            ) : (
              <span className="text-[11px] font-bold text-muted-foreground">
                {activeConnections > 0 ? `${activeConnections} connected` : 'Off'}
              </span>
            )
          }
          onClick={onOpenIntegrations}
        />
        <MenuRow
          icon={<SlidersHorizontal className="w-7 h-7 text-emerald-500" />}
          label="Preferences"
          onClick={onOpenPreferences}
        />
      </MenuSection>

      {/* Subscriptions */}
      <MenuSection title="Subscriptions">
        <MenuRow
          icon={<Icon name="frogPlus" className="w-9 h-9" />}
          label="Frogress Plus"
          trailing={
            isPremium ? (
              <span className="inline-flex items-center rounded-md bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1 text-[10px] font-black uppercase leading-none tracking-[0.16em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-emerald-900/40">
                Active
              </span>
            ) : undefined
          }
          onClick={isPremium ? () => setPlusInfoOpen(true) : onOpenPlus}
        />
      </MenuSection>

      {plusInfoOpen && createPortal(
        <div
          className="fixed inset-0 z-[1360] flex items-center justify-center bg-black/50 backdrop-blur-sm px-5"
          onClick={() => setPlusInfoOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative isolate w-full max-w-sm rounded-3xl px-6 pt-7 pb-6 text-emerald-950 ring-2 ring-amber-200/80"
          >
            <span
              aria-hidden
              className="absolute inset-0 -z-10 rounded-3xl bg-[linear-gradient(125deg,#fde68a_0%,#fbbf24_45%,#f59e0b_75%,#d97706_100%)]"
            />
            <span aria-hidden className="absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-3xl bg-gradient-to-b from-white/45 to-transparent" />
            <button
              type="button"
              onClick={() => setPlusInfoOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-900/15 text-emerald-900 hover:bg-emerald-900/25"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex flex-col items-center text-center">
              <Icon name="frogPlus" className="h-20 w-20 drop-shadow-[0_3px_0_rgba(31,98,28,0.35)]" />
              <p className="mt-2 text-lg font-black tracking-tight flex items-center gap-2">
                Frogress
                <span className="inline-flex items-center rounded-md bg-gradient-to-b from-emerald-600 to-emerald-800 px-1.5 py-0.5 text-[10px] font-black uppercase leading-none tracking-[0.18em] text-amber-100 ring-1 ring-emerald-900/40">
                  Plus
                </span>
              </p>
              <p className="mt-1 text-sm font-bold text-emerald-900/85">
                Your subscription is active 🎉
              </p>
              {premiumUntilLabel && (
                <div className="mt-4 w-full rounded-xl bg-white/55 px-4 py-3 ring-1 ring-amber-300/60">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-900/70">
                    Renews / Expires
                  </p>
                  <p className="mt-0.5 text-base font-black tracking-tight text-emerald-950">
                    {premiumUntilLabel}
                  </p>
                </div>
              )}
              <p className="mt-4 text-xs font-medium text-emerald-900/70">
                Thanks for supporting Frogress — you&apos;re helping us keep building 🐸
              </p>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Support */}
      <MenuSection title="Support">
        <MenuRow
          icon={<HelpCircle className="w-7 h-7 text-sky-500" />}
          label="Help center"
          onClick={onHelpCenter}
        />
        <MenuRow
          icon={<AlertTriangle className="w-7 h-7 text-red-500" />}
          label="Report an issue"
          onClick={onReportIssue}
        />
      </MenuSection>

      {/* Admin */}
      {isAdmin && (
        <MenuSection title="Admin">
          <MenuRow
            icon={<Settings className="w-7 h-7 text-amber-500" />}
            label="Admin Settings"
            onClick={onGoAdmin}
          />
        </MenuSection>
      )}

      <button
        onClick={onSignOut}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 font-black text-rose-600 shadow-sm transition-all hover:bg-rose-100 active:scale-[0.99] dark:border-rose-400/35 dark:bg-rose-500/15 dark:text-rose-300 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_24px_rgba(0,0,0,0.12)] dark:hover:border-rose-400/50 dark:hover:bg-rose-500/25"
      >
        <LogOut className="h-6 w-6" strokeWidth={2.5} />
        Sign Out
      </button>
    </div>
  );
}

function PreferencesView({
  theme,
  setTheme,
  onOpenQuestOnboarding,
}: {
  theme?: string;
  setTheme: (t: string) => void;
  onOpenQuestOnboarding: () => void;
}) {
  return (
    <div className="space-y-3">
      <MenuSection title="Appearance">
        <motion.button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          whileTap={{ scale: 0.985 }}
          animate={{
            boxShadow:
              theme === 'dark'
                ? 'inset 0 0 0 1px rgba(74, 222, 128, 0.18)'
                : 'inset 0 0 0 1px rgba(245, 158, 11, 0.14)',
          }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          className="flex w-full items-center justify-between bg-card px-4 py-4 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/50"
        >
          <span className="flex items-center gap-3">
            <div className="flex h-9 w-12 items-center justify-center">
              <AnimatedThemeIcon dark={theme === 'dark'} />
            </div>
            <span className="font-bold text-sm">Color Mode</span>
          </span>
          <span className="text-[11px] font-bold text-muted-foreground capitalize">
            {theme === 'dark' ? 'Dark' : 'Light'}
          </span>
        </motion.button>
      </MenuSection>

      <MenuSection title="Quests">
        <MenuRow
          icon={<Icon name="compass" label="Quest Focus" className="w-10 h-10" />}
          label="Quest Focus"
          onClick={onOpenQuestOnboarding}
        />
      </MenuSection>

      <MenuSection title="Wardrobe">
        <SkinRotationRow />
      </MenuSection>
    </div>
  );
}

function NotificationsView({
  notifsEnabled,
  notifLoading,
  isWeb,
  onEnableNotifs,
  onDisableNotifs,
  onManageEmail,
}: {
  notifsEnabled: boolean;
  notifLoading: boolean;
  isWeb: boolean;
  onEnableNotifs: () => void;
  onDisableNotifs: () => void;
  onManageEmail: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Status card */}
      <div className="rounded-2xl bg-card border border-border/50 px-5 py-4 shadow-sm flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10">
          <BellRing className="w-6 h-6 text-amber-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black tracking-tight">
            {isWeb ? 'Browser notifications' : 'Push notifications'}
          </p>
          <p className="text-xs font-medium text-muted-foreground">
            {notifsEnabled
              ? isWeb
                ? 'This browser will get timer & reminder alerts.'
                : 'You’re all set to get reminders.'
              : 'Turn these on to get reminders from your frog.'}
          </p>
        </div>
        {isWeb ? (
          <button
            type="button"
            role="switch"
            aria-checked={notifsEnabled}
            aria-label="Toggle browser notifications"
            disabled={notifLoading}
            onClick={notifsEnabled ? onDisableNotifs : onEnableNotifs}
            className={cn(
              'inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-60',
              notifsEnabled ? 'bg-emerald-500' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'h-5 w-5 rounded-full bg-white shadow transition-transform',
                notifsEnabled ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
        ) : (
          <span
            className={cn(
              'text-[11px] font-black uppercase tracking-wider rounded-full px-2.5 py-1',
              notifsEnabled
                ? 'bg-emerald-500/12 text-emerald-600'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {notifsEnabled ? 'On' : 'Off'}
          </span>
        )}
      </div>

      {!isWeb && (
        <button
          type="button"
          onClick={onEnableNotifs}
          disabled={notifLoading}
          className="w-full h-12 rounded-2xl bg-primary text-sm font-black tracking-wide text-primary-foreground shadow-lg shadow-primary/25 transition-all active:scale-[0.98] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {notifLoading
            ? 'Enabling…'
            : notifsEnabled
              ? 'Manage in system settings'
              : 'Enable notifications'}
        </button>
      )}

      <MenuSection title="More">
        <MenuRow
          icon={<Mail className="w-7 h-7 text-sky-500" />}
          label="Manage email notifications"
          onClick={onManageEmail}
        />
      </MenuSection>
    </div>
  );
}

function SignedOutView({ onSignIn, onClose }: { onSignIn: () => void; onClose: () => void }) {
  return (
    <div className="pt-8">
      <button
        onClick={() => {
          onSignIn();
          onClose();
        }}
        className="w-full flex items-center justify-center gap-2 p-4 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
      >
        <LogIn className="w-5 h-5" />
        Sign In
      </button>
    </div>
  );
}

function PromoCard({
  icon,
  title,
  titleBadge,
  subtitle,
  actionLabel,
  onAction,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  titleBadge?: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onAction}
      disabled={disabled}
      className="w-full text-left rounded-2xl bg-violet-500 dark:bg-violet-600 text-white px-4 py-4 flex items-center gap-3 shadow-sm transition-transform active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
    >
      <div className="flex items-center justify-center w-11 h-11 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-black tracking-tight flex items-center gap-2">
          {title}
          {titleBadge && (
            <span className="text-[10px] font-black tracking-wider bg-white/90 text-violet-700 rounded-md px-1.5 py-0.5">
              {titleBadge}
            </span>
          )}
        </p>
        <p className="text-xs font-medium text-white/90">{subtitle}</p>
      </div>
      <span
        aria-hidden
        className="bg-white text-violet-700 font-black text-xs rounded-xl px-3 py-2 shadow-sm shrink-0"
      >
        {actionLabel}
      </span>
    </button>
  );
}

function QuickTile({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0.9, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      className="flex min-h-24 w-full items-center gap-3 rounded-2xl border border-border/50 bg-card px-4 py-3 text-left transition-all active:scale-[0.98] hover:bg-accent/50 max-[359px]:gap-2 max-[359px]:px-3"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-black leading-tight">{title}</p>
        {subtitle && (
          <p className="mt-0.5 line-clamp-2 text-[11px] font-bold leading-tight text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
    </motion.button>
  );
}

function AnimatedThemeIcon({ dark }: { dark: boolean }) {
  return (
    <motion.span
      aria-hidden
      animate={{
        backgroundColor: dark ? '#252a3d' : '#fef3c7',
        borderColor: dark ? '#64748b' : '#fbbf24',
      }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="relative block h-7 w-11 overflow-hidden rounded-full border shadow-inner"
    >
      <motion.span
        animate={{ x: dark ? 16 : 0, rotate: dark ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 440, damping: 28 }}
        className="absolute left-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow-md"
      >
        <AnimatePresence mode="wait" initial={false}>
          {dark ? (
            <motion.span
              key="moon"
              initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
            >
              <Moon className="h-3.5 w-3.5 fill-violet-500 text-violet-600" />
            </motion.span>
          ) : (
            <motion.span
              key="sun"
              initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
            >
              <Sun className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.span>
    </motion.span>
  );
}

function QuickTilesGrid({
  theme,
  setTheme,
  onOpenQuestFocus,
  onOpenPreferences,
  onOpenIntegrations,
  calendarSubtitle,
}: {
  theme?: string;
  setTheme: (t: string) => void;
  onOpenQuestFocus: () => void;
  onOpenPreferences: () => void;
  onOpenIntegrations: () => void;
  calendarSubtitle: string;
}) {
  const [rotation, setRotation] = useState<RotationInterval>('disabled');
  const [rotationOpen, setRotationOpen] = useState(false);

  useEffect(() => {
    setRotation(getRotationInterval());
    const handler = () => setRotation(getRotationInterval());
    window.addEventListener('skin-rotation-change', handler);
    return () => window.removeEventListener('skin-rotation-change', handler);
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3">
      <QuickTile
        icon={<Icon name="compass" label="Focus areas" className="h-[52px] w-[52px]" />}
        title="Focus areas"
        subtitle="Tailor your quests"
        onClick={onOpenQuestFocus}
      />
      <QuickTile
        icon={<Icon name="shuffle" label="Style Shuffle" className="h-[52px] w-[52px]" />}
        title="Style Shuffle"
        subtitle={labelForInterval(rotation)}
        onClick={() => setRotationOpen(true)}
      />
      <QuickTile
        icon={<Icon name="googleCalendar" label="Calendar sync" className="h-8 w-8" />}
        title="Calendar sync"
        subtitle={calendarSubtitle}
        onClick={onOpenIntegrations}
      />
      <QuickTile
        key={`theme-${theme}`}
        icon={<AnimatedThemeIcon dark={theme === 'dark'} />}
        title="Color mode"
        subtitle={theme === 'dark' ? 'Dark' : 'Light'}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />
      <SkinRotationDialog
        open={rotationOpen}
        currentValue={rotation}
        onClose={() => setRotationOpen(false)}
        onSelect={(v) => {
          setRotationInterval(v);
          setRotation(v);
          setRotationOpen(false);
        }}
      />
    </div>
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground px-1">
        {title}
      </p>
      <div className="rounded-2xl bg-card border border-border/50 overflow-hidden divide-y divide-border/50">
        {children}
      </div>
    </div>
  );
}

function MenuRow({
  icon,
  label,
  trailing,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-accent/50 transition-colors text-left"
    >
      <div className="h-9 w-9 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <span className="min-w-0 flex-1 text-sm font-bold line-clamp-2 leading-tight">{label}</span>
      {trailing && <span className="shrink-0">{trailing}</span>}
      <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
