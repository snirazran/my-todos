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
import { useUIStore } from '@/lib/uiStore';
import { clearAuthTokenCookie } from '@/lib/authCookie';
import { useInventory } from '@/hooks/useInventory';
import GoogleCalendarSync, { getCalendarSyncStatus } from '@/components/ui/GoogleCalendarSync';
import {
  SkinRotationRow,
  SkinRotationDialog,
  getRotationInterval,
  setRotationInterval,
  labelForInterval,
  type RotationInterval,
} from '@/components/ui/SkinRotation';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import useSWR, { mutate as swrMutate } from 'swr';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import WeeklyWrapped from '@/components/ui/WeeklyWrapped';
import type { WeeklyRecapData } from '@/app/api/weekly-recap/route';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import Fly from '@/components/ui/fly';
import { FlyCounter } from '@/components/ui/FlyCounter';
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
    isWeeklyWrappedOpen,
    openWeeklyWrapped,
    closeWeeklyWrapped,
    isDebugMode,
    isLoadingScreenVisible,
  } = useUIStore();
  const { indices } = useWardrobeIndices(!!user);
  const { unseenCount, unseenContainerCount, data: inventoryData } = useInventory(!!user, true);
  const flyBalance = inventoryData?.wardrobe?.flies;
  const inventoryBadge = unseenCount + unseenContainerCount;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [wardrobeDropdownOpen, setWardrobeDropdownOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
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

  // Weekly Recap Fetching
  const { data: recapData } = useSWR<WeeklyRecapData>(
    user ? `/api/weekly-recap?timezone=${encodeURIComponent(timezone)}` : null,
    (url: string) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false },
  );

  const forceShowWrapped = typeof window !== 'undefined' && window.location.search.includes('wrapped=1');
  const showRecapIndicator = !!user && !!recapData && !isWeeklyWrappedOpen;

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
      label: 'Quests',
      iconName: 'quests' as const,
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
      iconName: 'wardrobe' as const,
      onClick: () => {
        if (!user) { router.push('/login'); return; }
        router.push('/wardrobe');
      },
      isActive: pathname === '/wardrobe',
    },
  ];

  // Desktop keeps a full header. Mobile only gets lightweight home-page controls.
  if (pathname === '/onboarding' || pathname === '/welcome' || pathname?.startsWith('/auth/')) return null;

  return (
    <>
      {(pathname === '/' || pathname === '/wardrobe') && (
        <>
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
              onSignOut={() => clearAuthTokenCookie()}
              compactMobileHome
            />
          </div>
          {user && flyBalance !== undefined && (
            <div
              className={cn(
                'fixed right-4 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[90] px-2 py-1 md:hidden',
                isLoadingScreenVisible && 'pointer-events-none',
              )}
              aria-disabled={isLoadingScreenVisible}
            >
              <FlyCounter
                balance={flyBalance}
                variant="mobile"
                onClick={() => setShopOpen(true)}
              />
            </div>
          )}
        </>
      )}
      <header
        className={cn(
          'relative z-[90] hidden w-full h-16 border-b border-border/40 bg-background/95 backdrop-blur-xl md:block',
          isLoadingScreenVisible && 'pointer-events-none',
        )}
        aria-disabled={isLoadingScreenVisible}
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

        <CurrencyShop
          open={shopOpen}
          onOpenChange={setShopOpen}
          balance={flyBalance ?? 0}
          hunger={100} // Dummy value for header shop
          maxHunger={100}
        />

        {/* Global Modal rendering */}
        {isWeeklyWrappedOpen && (isDebugMode ? true : recapData) && createPortal(
          <WeeklyWrapped
            data={(isDebugMode ? true : recapData) === true ? (undefined as any) : recapData!}
            indices={indices}
            onClose={() => {
              closeWeeklyWrapped();
              void swrMutate((key) => typeof key === 'string' && key.startsWith('/api/weekly-recap'));
            }}
          />,
          document.body
        )}

        {/* ───────── Desktop Navigation (Centered) ───────── */}
        <div className="hidden md:flex flex-1 min-w-0 items-center justify-center gap-0.5 lg:gap-1">
          {navItems.map((item) => {
            const isActive = item.href ? pathname === item.href : item.isActive;

            const buttonClass = `
              relative flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all
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
                    <span className="hidden lg:inline">{item.label}</span>
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

            if (item.onClick) {
              return (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className={buttonClass}
                >
                  <Icon name={item.iconName} label={item.label} className="w-8 h-8" />
                  <span className="hidden lg:inline">{item.label}</span>
                  {item.label === 'Quests' && questClaimableCount > 0 ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white shadow-sm ml-1">
                      {questClaimableCount > 99 ? '99+' : questClaimableCount}
                    </span>
                  ) : item.label === 'Quests' && questActiveCount > 0 ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted-foreground px-1 text-[10px] font-bold text-white shadow-sm ml-1">
                      {questActiveCount > 9 ? '9+' : questActiveCount}
                    </span>
                  ) : null}
                </button>
              );
            }

            if (item.protected && !user) {
              return (
                <button
                  key={item.label}
                  onClick={() => router.push('/login')}
                  className={buttonClass}
                >
                  <Icon name={item.iconName} label={item.label} className="w-8 h-8" />
                  <span className="hidden lg:inline">{item.label}</span>
                </button>
              );
            }

            return (
              <Link key={item.href} href={item.href!} className={buttonClass}>
                <Icon name={item.iconName} label={item.label} className="w-8 h-8" />
                <span className="hidden lg:inline">{item.label}</span>
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
            onSignOut={() => clearAuthTokenCookie()} // AuthContext handles state but manual cleanup helps
          />

          {user && flyBalance !== undefined && (
            <FlyCounter balance={flyBalance} variant="desktop" />
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
  onSignOut: () => void;
  compactMobileHome?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { openQuestOnboarding } = useUIStore();
  const { isAdmin } = useIsAdmin();

  // No click-outside listener needed — the settings sheet covers the entire viewport.

  const handleSignOut = async () => {
    await signOut(auth);
    onSignOut();
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

  if (loading)
    return <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />;

  // NOT AUTHENTICATED
  if (!user) {
    return (
      <div className="flex items-center gap-2">
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
            theme={theme}
            setTheme={setTheme}
          />
        </div>
      </div>
    );
  }

  // AUTHENTICATED
  return (
    <div className="relative" ref={menuRef}>
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
        theme={theme}
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
  frogPronouns?: string | null;
  birthday?: string | null;
  isPremium?: boolean;
  premiumUntil?: string | null;
};

const userInfoFetcher = (url: string) => fetch(url).then((r) => r.json());

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
  const [view, setView] = useState<
    'main' | 'preferences' | 'community' | 'profile' | 'helpCenter' | 'contact'
  >('main');
  const [contactTopic, setContactTopic] = useState<'question' | 'bug'>('question');
  const [contactBack, setContactBack] = useState<'main' | 'helpCenter'>('main');
  const [toast, setToast] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const { canEnable: canEnableNotifs, isEnabled: notifsEnabled, isNative, requestEnable, loading: notifLoading } = useNotificationStatus();
  const { data: userInfo, mutate: refreshUserInfo } = useSWR<UserInfo>(
    showAuth && user ? '/api/user' : null,
    userInfoFetcher,
    { revalidateOnFocus: false },
  );

  useEffect(() => setMounted(true), []);

  // Reset to main view whenever the sheet opens
  useEffect(() => {
    if (isOpen) setView('main');
  }, [isOpen]);

  const flashSoon = (label: string) => {
    setToast(`${label} — coming soon`);
    window.setTimeout(() => setToast(null), 1800);
  };

  const handleEnableNotifs = async () => {
    const next = await requestEnable();
    if (next === 'granted') setToast('Notifications enabled');
    else if (next === 'denied') setToast('Notifications were blocked. Enable them from system settings.');
    else setToast('Permission still pending');
    window.setTimeout(() => setToast(null), 2500);
  };

  if (!mounted) return null;

  const displayName = userInfo?.name || user?.displayName || 'You';
  const frogName = userInfo?.frogName || 'Frog';

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 220 }}
          className="fixed z-[101] inset-0 h-[100dvh] w-full overflow-y-auto bg-slate-100 dark:bg-background md:bg-white dark:md:bg-background"
        >
        <div className="mx-auto w-full md:max-w-xl md:min-h-full md:bg-slate-100 md:border-x md:border-border/60 md:shadow-[0_0_0_6px_rgba(15,23,42,0.10)] dark:md:bg-background">
          {/* Top bar */}
          <div
            className="sticky top-0 z-10 bg-slate-100/80 backdrop-blur-xl dark:bg-background/80"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div className="px-4 py-3 flex items-center justify-between">
              <button
                onClick={
                  view === 'contact'
                    ? () => setView(contactBack)
                    : view !== 'main'
                      ? () => setView('main')
                      : onClose
                }
                className="p-2 -ml-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label={view !== 'main' ? 'Back' : 'Close'}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              {view === 'preferences' && (
                <h2 className="text-base font-black tracking-tight">Preferences</h2>
              )}
              {view === 'community' && (
                <h2 className="text-base font-black tracking-tight">Join our frog community</h2>
              )}
              {view === 'profile' && (
                <h2 className="text-base font-black tracking-tight">Profile</h2>
              )}
              {view === 'helpCenter' && (
                <h2 className="text-base font-black tracking-tight">Help center</h2>
              )}
              {view === 'contact' && (
                <h2 className="text-base font-black tracking-tight">Contact us</h2>
              )}
              <div className="w-10" aria-hidden />
            </div>
          </div>

          <div className="px-5 pb-10 space-y-5">
            {/* Toast */}
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

            {view === 'main' ? (
              showAuth && user ? (
                <MainView
                  displayName={displayName}
                  frogName={frogName}
                  isPremium={!!userInfo?.isPremium}
                  premiumUntil={userInfo?.premiumUntil ?? null}
                  isAdmin={!!isAdmin}
                  canEnableNotifs={canEnableNotifs}
                  notifsEnabled={notifsEnabled}
                  isNative={isNative}
                  notifLoading={notifLoading}
                  onEnableNotifs={handleEnableNotifs}
                  onOpenPreferences={() => setView('preferences')}
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
              )
            ) : view === 'preferences' ? (
              <PreferencesView
                theme={theme}
                setTheme={setTheme}
                onOpenQuestOnboarding={() => {
                  onOpenQuestOnboarding();
                  onClose();
                }}
              />
            ) : view === 'community' ? (
              <CommunityPanel />
            ) : view === 'helpCenter' ? (
              <HelpCenterPanel
                onContact={() => {
                  setContactTopic('question');
                  setContactBack('helpCenter');
                  setView('contact');
                }}
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
                  petPronouns: userInfo?.frogPronouns ?? null,
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
                    petPronouns: 'frogPronouns',
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
          <InviteFriendsModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
          <PlusUpgradeModal open={plusOpen} onClose={() => setPlusOpen(false)} />
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
  notifLoading,
  onEnableNotifs,
  onOpenPreferences,
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
  notifLoading: boolean;
  onEnableNotifs: () => void;
  onOpenPreferences: () => void;
  onOpenQuestFocus: () => void;
  onInviteFriends: () => void;
  onOpenCommunity: () => void;
  onOpenProfile: () => void;
  onOpenPlus: () => void;
  onReportIssue: () => void;
  onHelpCenter: () => void;
  onGoAdmin: () => void;
  onSignOut: () => void;
  flashSoon: (label: string) => void;
}) {
  const [plusInfoOpen, setPlusInfoOpen] = useState(false);
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

      {/* Enable notifications promo (mobile only, when not enabled) */}
      {isNative && canEnableNotifs && !notifsEnabled && (
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
            <p className="text-xs font-semibold text-emerald-900/75">Unlock unlimited tags &amp; quests!</p>
          </div>
          <span
            aria-hidden
            className="shrink-0 inline-flex items-center rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-800 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_4px_rgba(0,0,0,0.25)] ring-1 ring-emerald-900/40"
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
        {isNative && (
          <MenuRow
            icon={<Bell className="w-7 h-7 text-amber-500" />}
            label="Notifications"
            trailing={
              <span className="text-[11px] font-bold text-muted-foreground">
                {notifsEnabled ? 'On' : 'Off'}
              </span>
            }
            onClick={onEnableNotifs}
          />
        )}
        <MenuRow
          icon={<User className="w-7 h-7 text-sky-500" />}
          label="Profile"
          onClick={onOpenProfile}
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
          className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 backdrop-blur-sm px-5"
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
        className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl font-bold bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
      >
        <LogOut className="w-7 h-7" />
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
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-full flex items-center justify-between px-4 py-4 bg-card hover:bg-accent/50 transition-colors first:rounded-t-2xl last:rounded-b-2xl"
        >
          <span className="flex items-center gap-3">
            <div className="h-9 w-9 flex items-center justify-center">
              <Icon name="darkMode" label="Color mode" className="w-10 h-10" />
            </div>
            <span className="font-bold text-sm">Color Mode</span>
          </span>
          <span className="text-[11px] font-bold text-muted-foreground capitalize">
            {theme === 'dark' ? 'Dark' : 'Light'}
          </span>
        </button>
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

      <MenuSection title="Integrations">
        <GoogleCalendarSync />
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
    <button
      type="button"
      onClick={onClick}
      className="flex h-24 w-full items-center gap-3 rounded-2xl border border-border/50 bg-card px-4 py-3 text-left transition-all active:scale-[0.98] hover:bg-accent/50"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black leading-tight">{title}</p>
        {subtitle && (
          <p className="mt-0.5 truncate text-[11px] font-bold text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
    </button>
  );
}

function QuickTilesGrid({
  theme,
  setTheme,
  onOpenQuestFocus,
  onOpenPreferences,
}: {
  theme?: string;
  setTheme: (t: string) => void;
  onOpenQuestFocus: () => void;
  onOpenPreferences: () => void;
}) {
  const [rotation, setRotation] = useState<RotationInterval>('disabled');
  const [rotationOpen, setRotationOpen] = useState(false);
  const [gcalEnabled, setGcalEnabled] = useState(() => getCalendarSyncStatus().enabled);

  useEffect(() => {
    setRotation(getRotationInterval());
    const handler = () => setRotation(getRotationInterval());
    window.addEventListener('skin-rotation-change', handler);
    return () => window.removeEventListener('skin-rotation-change', handler);
  }, []);

  useEffect(() => {
    const handler = () => setGcalEnabled(getCalendarSyncStatus().enabled);
    window.addEventListener('gcal-status-change', handler);
    return () => window.removeEventListener('gcal-status-change', handler);
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
        icon={<Icon name="shuffle" label="Skin rotation" className="h-[52px] w-[52px]" />}
        title="Skin rotation"
        subtitle={labelForInterval(rotation)}
        onClick={() => setRotationOpen(true)}
      />
      <QuickTile
        icon={<Icon name="googleCalendar" label="Google Calendar" className="h-8 w-8" />}
        title="Google Calendar"
        subtitle={gcalEnabled ? 'Connected' : 'Sync your events'}
        onClick={() => window.dispatchEvent(new Event('gcal-sync-trigger'))}
      />
      <QuickTile
        icon={<Icon name="darkMode" label="Color mode" className="h-[52px] w-[52px]" />}
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
      <span className="flex-1 text-sm font-bold truncate">{label}</span>
      {trailing}
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </button>
  );
}
