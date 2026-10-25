// components/SiteHeader.tsx
'use client';

import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import {
  LogIn,
  LogOut,
} from 'lucide-react';
import { TRADE_MIN_ITEM_COUNT } from '@/lib/skins/catalog';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { useUIStore } from '@/lib/uiStore';
import { WEEK_START_LABEL, type WeekStartDay } from '@/lib/weekStart';
import { clearSessionCookie } from '@/lib/authCookie';
import { signOutNativeGoogle } from '@/lib/googleAuth';
import { signOutNativeApple } from '@/lib/appleAuth';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useInventory } from '@/hooks/useInventory';
import { useFriendPondBadge } from '@/hooks/useFriendPondBadge';
import IntegrationsPanel, {
  useCalendarConnections,
} from '@/components/ui/CalendarSyncSection';
import { useAiConnections } from '@/components/ui/AiConnectionsSection';
import {
  SkinRotationRow,
  SkinRotationDialog,
  StyleShuffleHeaderButton,
  useShuffleInterval,
  labelForInterval,
} from '@/components/ui/SkinRotation';
import { PlusUpgradeModal } from '@/components/ui/PlusUpgradeModal';
import useSWR, { mutate as swrMutate } from 'swr';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import {
  motion,
  AnimatePresence,
  useAnimationControls,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import { ChevronRight, CalendarDays, ShieldCheck } from 'lucide-react';
import { openPrivacyOptions, privacyOptionsAvailable, subscribeAdConsent } from '@/lib/ads';
import Fly from '@/components/ui/fly';
import { FlyCounter } from '@/components/ui/FlyCounter';
import {
  MobileHeaderActions,
  HEADER_CONTROL_ICON_BUTTON,
} from '@/components/ui/MobileHeaderActions';
import { StreakChip } from '@/components/ui/streak/StreakChip';
import { CurrencyShop } from './shop/CurrencyShop';
import { HelpCenterPanel, ContactPanel } from '@/components/ui/HelpCenter';
import { QuestOnboardingPopup } from '@/components/ui/QuestOnboardingPopup';
import type {
  FocusCategoryTagMap,
  MacroCategoryDefinition,
  MacroCategoryId,
} from '@/lib/quests/types';
import { cn } from '@/lib/utils';

export default function SiteHeader() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => setPendingHref(null), [pathname]);
  const {
    isLoadingScreenVisible,
    isWardrobeStuck,
    openFlyShop,
    isFirstRunGuided,
  } = useUIStore();
  const { unseenCount, unseenContainerCount, data: inventoryData } = useInventory(!!user, true);
  const flyBalance = inventoryData?.wardrobe?.flies;
  const inventoryBadge = unseenCount + unseenContainerCount;
  const shopGiftReady = !!inventoryData?.shopGift?.available;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data: questsData } = useSWR<{
    claimableCount?: number;
    activeCount?: number;
  }>(
    user ? `/api/quests?view=home&timezone=${encodeURIComponent(timezone)}` : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  const questClaimableCount = questsData?.claimableCount ?? 0;

  const friendClaimable = useFriendPondBadge();
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

  // Desktop keeps a full header. Mobile only gets lightweight home-page controls.
  if (pathname === '/onboarding' || pathname === '/welcome' || pathname === '/try' || pathname === '/fly-catch' || pathname === '/login' || pathname?.startsWith('/auth/')) return null;

  return (
    <>
      {pathname === '/wardrobe' && <MobileMenuCluster />}
      {pathname === '/wardrobe' &&
        user &&
        flyBalance !== undefined && (
          <MobileHeaderActions disabled={isLoadingScreenVisible}>
            <StyleShuffleHeaderButton />
            <StreakChip variant="mobile" />
            <FlyCounter
              balance={flyBalance}
              variant="mobile"
              onClick={() => openFlyShop()}
              showGoal
            />
          </MobileHeaderActions>
        )}
      <header
        data-app-site-header
        style={{
          opacity: isFirstRunGuided ? 0 : 1,
          pointerEvents: isFirstRunGuided ? 'none' : undefined,
          transition: 'opacity 500ms ease',
        }}
        className={cn(
          'absolute inset-x-0 top-0 z-[90] hidden w-full h-16 bg-background/95 backdrop-blur-xl md:block',
          pathname !== '/planner' &&
            pathname !== '/insights' &&
            !pathname?.startsWith('/admin') &&
            !(pathname === '/wardrobe' && isWardrobeStuck) &&
            'shadow-lg shadow-black/5 dark:shadow-black/20',
        )}
      >
      <div className="flex items-center justify-between h-full gap-4 px-6 py-3 mx-auto max-w-7xl md:px-10">
        {/* ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ Logo ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ */}
        <Link
          href="/"
          className="relative inline-flex items-center gap-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg shrink-0"
        >
          <span className="text-2xl font-black tracking-tighter text-transparent bg-gradient-to-r from-primary via-[#6fae68] to-primary bg-clip-text transition-all group-hover:opacity-80">
            Frogress
          </span>
        </Link>

        <CurrencyShop />

        <nav
          aria-label="Main"
          className="hidden md:flex flex-1 min-w-0 items-center justify-center gap-0.5 xl:gap-1"
        >
          {navItems.map((item) => {
            const href = item.protected && !user ? '/login' : item.href;
            const isActive = pendingHref ? pendingHref === item.href : pathname === item.href;
            const badge: { count: number; tone: string; gift?: boolean } | null =
              item.label === 'Wardrobe' && inventoryBadge > 0
                ? { count: inventoryBadge, tone: 'bg-rose-500' }
                : item.label === 'Wardrobe' && shopGiftReady
                  ? { count: 1, tone: 'bg-amber-500', gift: true }
                  : item.label === 'Quests' && questClaimableCount > 0
                  ? { count: questClaimableCount, tone: 'bg-amber-500' }
                  : item.label === 'Friends' && friendAlerts > 0
                    ? { count: friendAlerts, tone: 'bg-rose-500' }
                    : item.label === 'Friends' && friendClaimable > 0
                      ? { count: friendClaimable, tone: 'bg-amber-500' }
                      : null;

            return (
              <Link
                key={item.label}
                href={href}
                prefetch={true}
                onClick={() => {
                  if (href === item.href && pathname !== item.href) setPendingHref(item.href);
                }}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
                className={cn(
                  'group relative flex items-center gap-2 rounded-full px-2.5 py-1.5 text-sm font-bold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 xl:px-3.5',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                {isActive ? (
                  <motion.span
                    layoutId="site-header-active-tab"
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-primary/10 ring-1 ring-primary/15"
                    transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                  />
                ) : null}
                <span
                  className="relative"
                  data-inventory-target={item.label === 'Wardrobe' ? '' : undefined}
                >
                  <Icon
                    name={item.iconName}
                    label={item.label}
                    className={cn(
                      'h-8 w-8 transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-95',
                      item.label === 'Friends' && 'scale-125 group-hover:scale-125',
                    )}
                  />
                  {badge?.gift ? (
                    <GiftBadge className="absolute -right-2.5 -top-2.5 h-[22px] w-[22px]" />
                  ) : badge ? (
                    <span
                      className={cn(
                        'absolute -right-1.5 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-black leading-none text-white ring-2 ring-background',
                        badge.tone,
                      )}
                      aria-label={`${badge.count} new`}
                    >
                      {badge.count > 9 ? (
                        '9+'
                      ) : (
                        badge.count
                      )}
                    </span>
                  ) : null}
                </span>
                <span className={cn('relative hidden xl:inline', pendingHref === item.href && 'animate-pulse')}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          {user &&
            flyBalance !== undefined &&
            (pathname === '/' ||
              pathname === '/wardrobe' ||
              pathname === '/friends') && (
              <StyleShuffleHeaderButton className="hover:bg-muted" />
            )}

          {user && flyBalance !== undefined && (
            <>
              <StreakChip variant="desktop" />
              <FlyCounter
                balance={flyBalance}
                variant="desktop"
                onClick={() => openFlyShop()}
                showGoal
              />
              <span aria-hidden className="mx-0.5 h-7 w-px bg-border" />
            </>
          )}

          <RightActions
            user={user}
            loading={loading}
            onSignIn={() => router.push('/login')}
            onSignOut={() => window.location.replace('/login')}
          />
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

// ג”€ג”€ג”€ Sub-Components ג”€ג”€ג”€

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
  ArrowRight,
  ShieldAlert,
  Vibrate,
  Volume2,
  Blocks,
} from 'lucide-react';
import {
  useHapticsEnabled,
  setHapticsEnabled,
  hapticImpact,
  hapticTick,
} from '@/lib/haptics';
import {
  useCatchSoundsEnabled,
  setCatchSoundsEnabled,
  primeCatchSounds,
  playPop,
} from '@/lib/catchSounds';
import { useTheme } from 'next-themes';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useNotificationStatus } from '@/hooks/useNotificationStatus';
import { InviteFriendsModal } from '@/components/ui/InviteFriendsModal';
import { CommunityPanel } from '@/components/ui/CommunityModal';
import { ProfilePanel } from '@/components/ui/ProfileModal';
import { PlusMembershipSheet } from '@/components/ui/PlusMembershipSheet';
import { useFrogodoroUiStore } from '@/lib/frogodoroUiStore';
import { useWidgetPinStore } from '@/lib/widget/pinStore';
import { GiftBadge } from '@/components/ui/GiftBadge';

export function MobileMenuCluster({
  position = 'fixed',
}: {
  position?: 'fixed' | 'absolute';
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { isLoadingScreenVisible } = useUIStore();
  return (
    <div
      data-fly-fade
      className={cn(
        'left-4 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[90] flex items-center md:hidden',
        position === 'absolute' ? 'absolute' : 'fixed',
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
  );
}

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
  const { isAdmin } = useIsAdmin();

  // No click-outside listener needed — the settings sheet covers the entire viewport.

  const handleSignOut = async () => {
    setSigningOut(true);
    await Promise.allSettled([
      auth ? signOut(auth) : Promise.resolve(),
      clearSessionCookie(),
      signOutNativeGoogle(),
      signOutNativeApple(),
    ]);
    await swrMutate(() => true, undefined, { revalidate: false });
    await onSignOut();
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
        <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
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
        aria-label="Open profile and settings"
        aria-expanded={isOpen}
        className="group hidden h-10 w-10 items-center justify-center rounded-full ring-2 ring-transparent transition-[box-shadow] hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-primary/60 md:flex"
      >
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt=""
            referrerPolicy="no-referrer"
            className="h-9 w-9 rounded-full object-cover shadow-sm"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#62a65b] to-[#2c511a] text-sm font-black text-white shadow-sm">
            {(user.displayName?.[0] || user.email?.[0] || 'U').toUpperCase()}
          </span>
        )}
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
      aria-label={isOpen ? 'Close menu' : 'Open menu'}
      className={cn(
        HEADER_CONTROL_ICON_BUTTON,
        'text-muted-foreground hover:text-foreground',
      )}
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

const SWIPE_PROJECTION = 0.15;
const SWIPE_MIN_DISTANCE = 48;
const SWIPE_DISMISS_RATIO = 0.35;
const SWIPE_FLING_VELOCITY = 800;
const SWIPE_AXIS_SLOP = 8;

const settleSpring = (velocity: number) =>
  ({
    type: 'spring',
    stiffness: 520,
    damping: 46,
    mass: 1,
    velocity,
    restDelta: 0.5,
    restSpeed: 10,
  }) as const;

const dismissSpring = (velocity: number) =>
  ({
    type: 'spring',
    stiffness: 420,
    damping: 44,
    mass: 1,
    velocity,
    restDelta: 1,
    restSpeed: 20,
  }) as const;

const swipeDragProps = {
  dragDirectionLock: true,
  dragConstraints: { left: 0, right: 0 },
  dragElastic: { left: 0, right: 1 },
  dragMomentum: false,
  dragTransition: { bounceStiffness: 520, bounceDamping: 46 },
  style: { touchAction: 'pan-y' as const },
} as const;

function useSwipeAxisLock(enabled: boolean) {
  const detach = useRef<(() => void) | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  return useCallback((el: HTMLDivElement | null) => {
    detach.current?.();
    detach.current = null;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let axis: 'x' | 'y' | null = null;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      tracking = e.touches.length === 1;
      axis = null;
      if (!tracking) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking || !enabledRef.current || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (axis === null) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_AXIS_SLOP) return;
        axis = dx > 0 && Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (axis === 'x' && e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      tracking = false;
      axis = null;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    detach.current = () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);
}

const shouldDismissSwipe = (offsetX: number, velocityX: number) => {
  if (offsetX < SWIPE_MIN_DISTANCE) return false;
  const width = typeof window !== 'undefined' ? window.innerWidth : 390;
  const projected = offsetX + velocityX * SWIPE_PROJECTION;
  return projected > width * SWIPE_DISMISS_RATIO || velocityX > SWIPE_FLING_VELOCITY;
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
  const [areasOpen, setAreasOpen] = useState(false);
  const [railGuestSignOut, setRailGuestSignOut] = useState(false);
  const openFocusLauncher = useFrogodoroUiStore((state) => state.openFocusLauncher);
  const { canEnable: canEnableNotifs, isEnabled: notifsEnabled, isNative, isWeb, enableOrConfigure, disable: disableNotifs, loading: notifLoading } = useNotificationStatus();
  const { data: userInfo, mutate: refreshUserInfo } = useSWR<UserInfo>(
    showAuth && user ? '/api/user' : null,
    userInfoFetcher,
    { revalidateOnFocus: false },
  );
  const { data: questsData, mutate: mutateQuests } = useSWR<QuestAreasInfo>(
    isOpen && showAuth && user
      ? `/api/quests?view=home&timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`
      : null,
    (url: string) => fetch(url).then((res) => res.json()),
    { revalidateOnFocus: false },
  );
  const { connections } = useCalendarConnections();
  const { aiConnections } = useAiConnections();
  const activeConnections =
    connections.filter((c) => c.status === 'active').length + aiConnections;
  const calendarNeedsAttention = connections.some((c) => c.status !== 'active');

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


  const timerSheetOpen = useFrogodoroUiStore((state) => state.openSheets > 0);
  useEffect(() => {
    if (isOpen && timerSheetOpen) onClose();
  }, [isOpen, timerSheetOpen, onClose]);

  useEffect(() => {
    if (!isOpen || isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isMobile, onClose]);

  const sheetControls = useAnimationControls();
  const subviewControls = useAnimationControls();
  const subviewX = useMotionValue(typeof window !== 'undefined' ? window.innerWidth : 390);
  const pushProgress = (x: number) => {
    const width = window.innerWidth || 1;
    return Math.min(1, Math.max(0, 1 - x / width));
  };
  const mainParallaxX = useTransform(subviewX, (x) => -pushProgress(x) * window.innerWidth * 0.28);
  const mainScrimOpacity = useTransform(subviewX, (x) => pushProgress(x) * 0.16);
  // Reset to main view whenever the sheet opens
  useEffect(() => {
    if (!isOpen) return;
    setView('main');
    subviewX.set(window.innerWidth);
  }, [isOpen, subviewX]);
  const sheetSwipeRef = useSwipeAxisLock(isMobile && view === 'main');
  const subviewSwipeRef = useSwipeAxisLock(isMobile);
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

  const viewTitles: Record<string, string> = {
    main: 'Settings',
    preferences: 'Preferences',
    notifications: 'Notifications',
    community: 'Community',
    profile: 'Profile',
    helpCenter: 'Help center',
    contact: 'Contact us',
    integrations: 'Integrations',
  };

  const mainContent =
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
        isWeb={isWeb}
        notifLoading={notifLoading}
        layout={isMobile ? 'mobile' : 'desktop'}
        onEnableNotifs={handleEnableNotifs}
        onOpenNotifications={() => setView('notifications')}
        onOpenPreferences={() => setView('preferences')}
        onOpenIntegrations={() => setView('integrations')}
        onOpenFocusTimer={openFocusLauncher}
        onOpenQuestFocus={() => setAreasOpen(true)}
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
        isGuest={!!user?.isAnonymous}
        onCreateAccount={() => {
          router.push('/login?upgrade=1');
          onClose();
        }}
        flashSoon={flashSoon}
        theme={theme}
        setTheme={setTheme}
      />
    ) : (
      <SignedOutView onSignIn={onSignIn} onClose={onClose} />
    );

  const subviewContent =
    view === 'preferences' ? (
      <PreferencesView
        theme={theme}
        setTheme={setTheme}
        onOpenQuestOnboarding={() => setAreasOpen(true)}
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
    );

  const overlayExtras = (
    <>
      <AnimatePresence>
        {toast && (
          <div className="pointer-events-none fixed inset-x-0 top-16 z-[1350] flex justify-center px-4">
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 520, damping: 34 }}
              role="status"
              className="rounded-full bg-foreground px-4 py-2 text-xs font-bold text-background shadow-lg"
            >
              {toast}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <InviteFriendsModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <PlusUpgradeModal open={plusOpen} placement="settings_menu" onClose={() => setPlusOpen(false)} />
      {questsData?.onboarding && (
        <QuestOnboardingPopup
          show={areasOpen}
          zIndex={1360}
          isCompleted={!!questsData.onboarding.complete}
          initialSelectedCategoryIds={questsData.onboarding.selectedCategoryIds ?? []}
          initialCategoryTagMap={questsData.onboarding.categoryTagMap ?? []}
          categories={questsData.macroCategories ?? []}
          isPremium={!!questsData.isPremium}
          onClose={() => setAreasOpen(false)}
          onCompleted={() => {
            setAreasOpen(false);
            void mutateQuests();
            void swrMutate(
              (key: unknown) => typeof key === 'string' && key.startsWith('/api/tasks'),
            );
          }}
        />
      )}
      {railGuestSignOut && (
        <GuestSignOutConfirm
          onCancel={() => setRailGuestSignOut(false)}
          onCreateAccount={() => {
            setRailGuestSignOut(false);
            router.push('/login?upgrade=1');
            onClose();
          }}
          onConfirm={() => {
            setRailGuestSignOut(false);
            onSignOut();
            onClose();
          }}
        />
      )}
    </>
  );

  if (!isMobile) {
    const railGroups: {
      heading: string;
      items: {
        id: typeof view;
        label: string;
        icon: React.ReactNode;
        trailing?: React.ReactNode;
      }[];
    }[] = [
      {
        heading: 'General',
        items: [
          {
            id: 'main',
            label: 'Overview',
            icon: <Settings className="h-[18px] w-[18px] text-emerald-500" />,
          },
          {
            id: 'preferences',
            label: 'Preferences',
            icon: <SlidersHorizontal className="h-[18px] w-[18px] text-emerald-500" />,
          },
          ...((isNative || isWeb)
            ? [
                {
                  id: 'notifications' as typeof view,
                  label: 'Notifications',
                  icon: <Bell className="h-[18px] w-[18px] text-amber-500" />,
                  trailing: (
                    <span className="text-[11px] font-bold text-muted-foreground">
                      {notifsEnabled ? 'On' : 'Off'}
                    </span>
                  ),
                },
              ]
            : []),
          {
            id: 'integrations',
            label: 'Integrations',
            icon: <Blocks className="h-[18px] w-[18px] text-emerald-500" />,
            trailing: calendarNeedsAttention ? (
              <span className="text-[11px] font-bold text-amber-600">!</span>
            ) : (
              <span className="text-[11px] font-bold text-muted-foreground">
                {activeConnections > 0 ? activeConnections : 'Off'}
              </span>
            ),
          },
        ],
      },
      {
        heading: 'Account',
        items: [
          {
            id: 'profile',
            label: 'Profile',
            icon: <User className="h-[18px] w-[18px] text-sky-500" />,
          },
          {
            id: 'community',
            label: 'Community',
            icon: <Icon name="community" className="h-[18px] w-[18px]" />,
          },
        ],
      },
      {
        heading: 'Support',
        items: [
          {
            id: 'helpCenter',
            label: 'Help center',
            icon: <HelpCircle className="h-[18px] w-[18px] text-sky-500" />,
          },
          {
            id: 'contact',
            label: 'Report an issue',
            icon: <AlertTriangle className="h-[18px] w-[18px] text-red-500" />,
          },
        ],
      },
    ];

    return createPortal(
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="settings-desktop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-[1340] flex items-center justify-center bg-slate-900/50 p-6 backdrop-blur-sm"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Settings"
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              style={{ height: 'min(86vh, 760px)' }}
              className="flex w-full max-w-5xl max-h-full overflow-hidden rounded-3xl bg-card shadow-2xl ring-1 ring-border/60"
            >
              {/* Section rail */}
              <aside className="flex w-60 shrink-0 flex-col border-r border-border/60 bg-muted/30">
                <div className="px-5 pb-4 pt-5">
                  <p className="truncate text-base font-black tracking-tight">
                    <span>{displayName}</span>
                    <span className="mx-1.5 text-muted-foreground">&amp;</span>
                    <span>{frogName}</span>
                  </p>
                  {userInfo?.isPremium && (
                    <span className="mt-1.5 inline-flex items-center rounded-md bg-gradient-to-b from-emerald-600 to-emerald-800 px-1.5 py-0.5 text-[12px] font-black leading-none text-amber-100 ring-1 ring-emerald-900/40">
                      Plus
                    </span>
                  )}
                </div>

                <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-3">
                  {railGroups.map((group) => (
                    <div key={group.heading}>
                      <p className="px-2 pb-1 text-[12px] font-black text-muted-foreground/70">
                        {group.heading}
                      </p>
                      <div className="space-y-0.5">
                        {group.items.map((item) => {
                          const isActive =
                            view === item.id ||
                            (item.id === 'helpCenter' &&
                              view === 'contact' &&
                              contactBack === 'helpCenter');
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                if (item.id === 'contact') {
                                  setContactTopic('bug');
                                  setContactBack('main');
                                }
                                setView(item.id);
                              }}
                              aria-current={isActive ? 'page' : undefined}
                              className={cn(
                                'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-bold transition-colors',
                                isActive
                                  ? 'bg-card text-foreground shadow-sm ring-1 ring-border/60'
                                  : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
                              )}
                            >
                              <span className="shrink-0">{item.icon}</span>
                              <span className="min-w-0 flex-1 truncate">{item.label}</span>
                              {item.trailing}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {isAdmin && (
                    <div>
                      <p className="px-2 pb-1 text-[12px] font-black text-muted-foreground/70">
                        Admin
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          router.push('/admin');
                          onClose();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-bold text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
                      >
                        <Settings className="h-[18px] w-[18px] shrink-0 text-amber-500" />
                        <span className="min-w-0 flex-1 truncate">Admin settings</span>
                      </button>
                    </div>
                  )}
                </nav>

                {showAuth && user && (
                  <div className="border-t border-border/60 p-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (user?.isAnonymous) {
                          setRailGuestSignOut(true);
                          return;
                        }
                        onSignOut();
                        onClose();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-bold text-rose-500 transition-colors hover:bg-rose-500/10"
                    >
                      <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={2.5} />
                      Sign out
                    </button>
                  </div>
                )}
              </aside>

              {/* Detail pane */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
                  <h2 className="min-w-0 truncate text-lg font-black tracking-tight">
                    {viewTitles[view]}
                  </h2>
                  <button
                    onClick={onClose}
                    className="-mr-2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
                  <div className="mx-auto w-full max-w-2xl">
                    {view === 'main' ? mainContent : subviewContent}
                  </div>
                </div>
              </div>
            </motion.div>
            {overlayExtras}
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
    );
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={sheetControls}
          exit={{ x: '100%' }}
          transition={sheetTransition}
          ref={sheetSwipeRef}
          drag={isMobile && view === 'main' ? 'x' : false}
          {...swipeDragProps}
          onDragEnd={(_e, info) => {
            if (shouldDismissSwipe(info.offset.x, info.velocity.x)) {
              sheetControls
                .start({
                  x: window.innerWidth,
                  transition: dismissSpring(info.velocity.x),
                })
                .then(onClose);
            } else {
              sheetControls.start({ x: 0, transition: settleSpring(info.velocity.x) });
            }
          }}
          className="fixed z-[1340] inset-0 h-[100dvh] w-full overflow-hidden bg-slate-100 dark:bg-background will-change-transform"
        >
        <motion.div
          className="absolute inset-0 overflow-y-auto"
          style={{ x: mainParallaxX }}
        >
        <div className="w-full">
          <div
            className="sticky top-0 z-10 bg-slate-100 dark:bg-background"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div className="px-4 py-3 flex items-center justify-between">
              <button
                onClick={onClose}
                className="p-2 -ml-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <ArrowRight className="w-6 h-6" />
              </button>
              <div className="w-10 shrink-0" aria-hidden />
            </div>
          </div>

          <div className="px-5 pb-10 space-y-5">{mainContent}</div>
        </div>
        </motion.div>

        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[15] bg-black"
          style={{ opacity: mainScrimOpacity }}
        />

        <AnimatePresence>
          {view !== 'main' && (
        <motion.div
          key="subview"
          initial={{ x: window.innerWidth }}
          animate={subviewControls}
          exit={{ x: window.innerWidth }}
          transition={sheetTransition}
          ref={subviewSwipeRef}
          drag={isMobile ? 'x' : false}
          {...swipeDragProps}
          style={{ ...swipeDragProps.style, x: subviewX }}
          onDragEnd={(_e, info) => {
            if (shouldDismissSwipe(info.offset.x, info.velocity.x)) {
              const target = view === 'contact' ? contactBack : 'main';
              if (target === 'main') {
                subviewControls
                  .start({
                    x: window.innerWidth,
                    transition: dismissSpring(info.velocity.x),
                  })
                  .then(() => setView('main'));
              } else {
                setView(target);
              }
            } else {
              subviewControls.start({ x: 0, transition: settleSpring(info.velocity.x) });
            }
          }}
          className="absolute inset-0 z-20 overflow-y-auto bg-slate-100 shadow-[-12px_0_32px_rgba(15,23,42,0.12)] dark:bg-background will-change-transform"
        >
        <div className="w-full">
          <div
            className="sticky top-0 z-10 bg-slate-100 dark:bg-background"
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
                    community: 'Community',
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

          <div className="px-5 pb-10 space-y-5">{subviewContent}</div>
        </div>
        </motion.div>
          )}
        </AnimatePresence>

          {overlayExtras}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

type QuestAreasInfo = {
  isPremium?: boolean;
  onboarding?: {
    complete: boolean;
    selectedCategoryIds: MacroCategoryId[];
    categoryTagMap: FocusCategoryTagMap[];
  };
  macroCategories?: MacroCategoryDefinition[];
};

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
  onOpenFocusTimer,
  onOpenQuestFocus,
  onInviteFriends,
  onOpenCommunity,
  onOpenProfile,
  onOpenPlus,
  onReportIssue,
  onHelpCenter,
  onGoAdmin,
  onSignOut,
  isGuest,
  onCreateAccount,
  flashSoon,
  theme,
  setTheme,
  layout = 'mobile',
}: {
  layout?: 'mobile' | 'desktop';
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
  onOpenFocusTimer: () => void;
  onOpenQuestFocus: () => void;
  onInviteFriends: () => void;
  onOpenCommunity: () => void;
  onOpenProfile: () => void;
  onOpenPlus: () => void;
  onReportIssue: () => void;
  onHelpCenter: () => void;
  onGoAdmin: () => void;
  onSignOut: () => Promise<void> | void;
  isGuest: boolean;
  onCreateAccount: () => void;
  flashSoon: (label: string) => void;
}) {
  const [plusInfoOpen, setPlusInfoOpen] = useState(false);
  const [confirmGuestSignOut, setConfirmGuestSignOut] = useState(false);
  const { connections } = useCalendarConnections();
  const { aiConnections } = useAiConnections();
  const activeCalendars = connections.filter((c) => c.status === 'active').length;
  const activeConnections = activeCalendars + aiConnections;
  const needsAttention = connections.some((c) => c.status !== 'active');
  const isDesktop = layout === 'desktop';
  const widgetPinState = useWidgetPinStore((s) => s.pinState);
  const refreshWidgetPinState = useWidgetPinStore((s) => s.refreshPinState);
  const requestWidgetPrompt = useWidgetPinStore((s) => s.requestPrompt);

  useEffect(() => {
    if (isNative) void refreshWidgetPinState();
  }, [isNative, refreshWidgetPinState]);

  return (
    <div className="settings-stagger space-y-5">
      {!isDesktop && (
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Edit profile"
          className="flex w-full items-center gap-3 rounded-2xl border border-border/50 bg-card px-5 py-4 text-left shadow-sm transition-[background-color,transform] hover:bg-accent/50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xl font-black tracking-tight truncate">
              <span>{displayName}</span>
              <span className="text-muted-foreground mx-1.5">&amp;</span>
              <span>{frogName}</span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
              {isPremium && (
                <span className="inline-flex items-center rounded-md bg-gradient-to-b from-emerald-600 to-emerald-800 px-1.5 py-0.5 text-[11px] font-black leading-none text-amber-100 ring-1 ring-emerald-900/40">
                  Plus
                </span>
              )}
              Edit profile
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </button>
      )}

      {isGuest && (
        <PromoCard
          icon={<ShieldAlert className="w-7 h-7 text-amber-200" strokeWidth={2.5} />}
          title={`Keep ${frogName} safe`}
          subtitle="Free account, so your frog and streak follow you to any device."
          actionLabel="Back up"
          onAction={onCreateAccount}
        />
      )}

      {isNative && widgetPinState === 'available' && (
        <PromoCard
          icon={<WidgetPromoIcon />}
          bareIcon
          title="Add the widget"
          subtitle={`Tap a fly to finish a task, with ${frogName} on your home screen.`}
          actionLabel="Add"
          onAction={requestWidgetPrompt}
        />
      )}

      {(isNative || isWeb) && canEnableNotifs && !notifsEnabled && (
        <PromoCard
          icon={<Bell className="w-7 h-7 text-amber-200" strokeWidth={2.5} />}
          title="Turn on reminders"
          subtitle={`A morning plan and an evening check-in from ${frogName}.`}
          actionLabel={notifLoading ? 'Turning on…' : 'Turn on'}
          onAction={onEnableNotifs}
          disabled={notifLoading}
        />
      )}

      <QuickTilesGrid
        theme={theme}
        setTheme={setTheme}
        onOpenQuestFocus={onOpenQuestFocus}
        onOpenPreferences={onOpenPreferences}
        onOpenIntegrations={onOpenIntegrations}
        onOpenFocusTimer={onOpenFocusTimer}
        calendarSubtitle={
          needsAttention
            ? 'Action needed'
            : activeConnections > 0
              ? [
                  activeCalendars > 0 ? 'Calendar' : null,
                  aiConnections > 0 ? 'AI assistant' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'Calendar & AI'
        }
      />

      {!isPremium && (
        <button
          type="button"
          onClick={onOpenPlus}
          aria-label="Unlock Frogress Plus"
          className="plus-upgrade-button group relative isolate w-full text-left rounded-2xl bg-amber-400 px-4 py-4 flex items-center gap-3 text-emerald-950 [--plus-button-base:#d38a0c] transition-transform duration-150 ease-out hover:bg-amber-300 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-primary"
        >
          <span className="-my-4 -ml-1 shrink-0 inline-flex">
            <Icon
              name="frogPlus"
              className="w-16 h-16 drop-shadow-[0_3px_0_rgba(31,98,28,0.35)] animate-wiggle"
            />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-base font-black tracking-tight flex items-center gap-2 text-emerald-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
              Frogress
              <span className="inline-flex items-center rounded-md bg-gradient-to-b from-emerald-600 to-emerald-800 px-1.5 py-0.5 text-[12px] font-black leading-none text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_2px_3px_rgba(0,0,0,0.22)] ring-1 ring-emerald-900/40">
                Plus
              </span>
            </p>
            <p className="mt-0.5 text-xs font-bold leading-snug text-emerald-900/80">
              More outfits. More gift prizes. More reasons to keep going.
            </p>
          </div>
          <span
            aria-hidden
            className="relative inline-flex narrow:hidden shrink-0 items-center overflow-hidden rounded-xl bg-gradient-to-b from-emerald-600 to-emerald-800 px-3.5 py-2 text-[13px] font-black text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_3px_0_0_rgba(20,83,45,0.55)] ring-1 ring-emerald-900/40 transition-[transform,box-shadow] duration-150 group-active:translate-y-0.5 group-active:shadow-none"
          >
            <span className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent animate-promo-shine" />
            <span className="relative">Try Plus</span>
          </span>
        </button>
      )}

      {!isDesktop && (
        <MenuSection title="Settings">
          {(isNative || isWeb) && (
            <MenuRow
              icon={<Bell className="w-7 h-7 text-amber-500" />}
              label="Notifications"
              description="Reminders and focus timer alerts"
              trailing={
                <span className="text-[11px] font-bold text-muted-foreground">
                  {notifsEnabled ? 'On' : 'Off'}
                </span>
              }
              onClick={onOpenNotifications}
            />
          )}
          <MenuRow
            icon={<SlidersHorizontal className="w-7 h-7 text-emerald-500" />}
            label="Preferences"
            description="Theme, week start, sounds & more"
            onClick={onOpenPreferences}
          />
        </MenuSection>
      )}

      {isPremium && (
        <MenuSection title="Membership">
          <MenuRow
            icon={<Icon name="frogPlus" className="w-9 h-9" />}
            label="Frogress Plus"
            description="Manage your membership"
            trailing={
              <span className="inline-flex items-center rounded-md bg-gradient-to-b from-emerald-600 to-emerald-800 px-2 py-1 text-[12px] font-black leading-none text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ring-1 ring-emerald-900/40">
                Active
              </span>
            }
            onClick={() => setPlusInfoOpen(true)}
          />
        </MenuSection>
      )}

      <MenuSection title="Community">
        <MenuRow
          icon={<Icon name="inviteFriends" label="Invite friends" className="w-10 h-10" />}
          label="Invite friends"
          description="Team up and keep each other going"
          onClick={onInviteFriends}
        />
        {!isDesktop && (
          <MenuRow
            icon={<Icon name="community" label="Community" className="w-10 h-10" />}
            label="Join the frog community"
            description="Tips, sneak peeks and fellow frogs"
            onClick={onOpenCommunity}
          />
        )}
        <MenuRow
          icon={
            <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <Fly size={28} interactive={false} alwaysPlay />
            </span>
          }
          label="Fly Catch"
          description="30 seconds. Beat your best score."
          onClick={() => window.location.assign('/fly-catch')}
        />
      </MenuSection>

      <PlusMembershipSheet
        open={plusInfoOpen}
        onClose={() => setPlusInfoOpen(false)}
        fallbackUntil={premiumUntil}
      />

      {!isDesktop && (
        <MenuSection title="Support">
          <MenuRow
            icon={<HelpCircle className="w-7 h-7 text-sky-500" />}
            label="Help center"
            description="Quick answers and how-tos"
            onClick={onHelpCenter}
          />
          <MenuRow
            icon={<AlertTriangle className="w-7 h-7 text-red-500" />}
            label="Report a problem"
            description="We read every report"
            onClick={onReportIssue}
          />
        </MenuSection>
      )}

      {isAdmin && !isDesktop && (
        <MenuSection title="Admin">
          <MenuRow
            icon={<Settings className="w-7 h-7 text-amber-500" />}
            label="Admin Settings"
            onClick={onGoAdmin}
          />
        </MenuSection>
      )}

      {!isDesktop && (
      <button
        onClick={isGuest ? () => setConfirmGuestSignOut(true) : onSignOut}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border/50 bg-card p-4 text-sm font-black text-rose-600 transition-[background-color,transform] hover:bg-rose-50 active:scale-[0.99] dark:text-rose-400 dark:hover:bg-rose-500/10"
      >
        <LogOut className="h-5 w-5" strokeWidth={2.5} />
        Sign out
      </button>
      )}

      {confirmGuestSignOut && (
        <GuestSignOutConfirm
          onCancel={() => setConfirmGuestSignOut(false)}
          onCreateAccount={() => {
            setConfirmGuestSignOut(false);
            onCreateAccount();
          }}
          onConfirm={() => {
            setConfirmGuestSignOut(false);
            onSignOut();
          }}
        />
      )}
    </div>
  );
}

function GuestSignOutConfirm({
  onCancel,
  onCreateAccount,
  onConfirm,
}: {
  onCancel: () => void;
  onCreateAccount: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/60 px-5 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-[28px] bg-card p-6 text-center shadow-2xl ring-1 ring-border/60"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 ring-1 ring-rose-500/20">
          <ShieldAlert className="h-7 w-7 text-rose-500" strokeWidth={2.5} />
        </div>
        <h2 className="mt-3 text-lg font-black tracking-tight text-foreground">
          Your frog will be lost forever
        </h2>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          You&apos;re in Guest Mode — there&apos;s no way to sign back in. Signing
          out permanently deletes your frog, streaks, and all progress. Create a
          free account first to keep them.
        </p>
        <button
          type="button"
          onClick={onCreateAccount}
          className="mt-5 h-12 w-full rounded-2xl bg-primary text-sm font-black text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
        >
          Create free account
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="mt-2 h-11 w-full rounded-2xl text-sm font-bold text-rose-500 transition-colors hover:bg-rose-500/10"
        >
          Sign out and lose progress
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="mt-1 h-11 w-full rounded-2xl text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
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
          transition={{ type: 'spring', stiffness: 600, damping: 30, mass: 0.6 }}
          className="flex w-full items-center justify-between bg-card px-4 py-4 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/50"
        >
          <span className="flex items-center gap-3">
            <div className="flex h-9 w-12 items-center justify-center">
              <AnimatedThemeIcon dark={theme === 'dark'} />
            </div>
            <span className="font-bold text-sm">Color mode</span>
          </span>
          <span className="text-[11px] font-bold text-muted-foreground capitalize">
            {theme === 'dark' ? 'Dark' : 'Light'}
          </span>
        </motion.button>
      </MenuSection>

      <MenuSection title="Calendar">
        <WeekStartRow />
      </MenuSection>

      <MenuSection title="Feedback">
        <HapticsToggleRow />
        <CatchSoundsToggleRow />
      </MenuSection>

      <MenuSection title="Quests">
        <MenuRow
          icon={<Icon name="compass" label="Areas" className="w-10 h-10" />}
          label="Areas"
          description="Pick what your quests focus on"
          onClick={onOpenQuestOnboarding}
        />
      </MenuSection>

      <MenuSection title="Wardrobe">
        <SkinRotationRow />
      </MenuSection>

      <AdPrivacySection />
    </div>
  );
}

function AdPrivacySection() {
  const [available, setAvailable] = useState(() => privacyOptionsAvailable());
  const [busy, setBusy] = useState(false);

  useEffect(
    () => subscribeAdConsent(() => setAvailable(privacyOptionsAvailable())),
    [],
  );

  if (!available) return null;

  return (
    <MenuSection title="Privacy">
      <MenuRow
        icon={<ShieldCheck className="w-7 h-7 text-emerald-500" />}
        label="Ad privacy settings"
        onClick={() => {
          if (busy) return;
          setBusy(true);
          void openPrivacyOptions().finally(() => setBusy(false));
        }}
      />
    </MenuSection>
  );
}

function WeekStartRow() {
  const weekStartsOn = useUIStore((state) => state.weekStartsOn);
  const setWeekStartsOn = useUIStore((state) => state.setWeekStartsOn);
  const [saving, setSaving] = useState(false);

  const choose = async (next: WeekStartDay) => {
    if (next === weekStartsOn || saving) return;
    const previous = weekStartsOn;
    setWeekStartsOn(next);
    setSaving(true);
    try {
      const res = await fetch('/api/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStartsOn: next,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      await swrMutate(
        (key: unknown) =>
          typeof key === 'string' &&
          (key.startsWith('/api/tasks') || key.startsWith('/api/leap')),
      );
    } catch {
      setWeekStartsOn(previous);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card px-4 py-4 first:rounded-t-2xl last:rounded-b-2xl">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-12 items-center justify-center">
          <CalendarDays className="w-7 h-7 text-emerald-500" />
        </div>
        <span className="flex flex-col">
          <span className="font-bold text-sm">Week starts on</span>
          <span className="text-[11px] font-semibold text-muted-foreground">
            Changes your board, planner, streaks and Leap week
          </span>
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        {([0, 1] as WeekStartDay[]).map((day) => (
          <button
            key={day}
            type="button"
            disabled={saving}
            aria-pressed={weekStartsOn === day}
            onClick={() => void choose(day)}
            className={cn(
              'h-10 flex-1 rounded-xl text-[13px] font-black transition disabled:opacity-60',
              weekStartsOn === day
                ? 'bg-[#447d3f] text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/70',
            )}
          >
            {WEEK_START_LABEL[day]}
          </button>
        ))}
      </div>
    </div>
  );
}

function HapticsToggleRow() {
  const enabled = useHapticsEnabled();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Toggle haptic feedback"
      onClick={() => {
        setHapticsEnabled(!enabled);
        if (!enabled) hapticImpact();
      }}
      className="flex w-full items-center justify-between bg-card px-4 py-4 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/50"
    >
      <span className="flex items-center gap-3">
        <div className="flex h-9 w-12 items-center justify-center">
          <Vibrate className="w-7 h-7 text-emerald-500" />
        </div>
        <span className="font-bold text-sm">Haptics</span>
      </span>
      <span
        className={cn(
          'inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
          enabled ? 'bg-[#447d3f]' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ease-spring',
            enabled ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </span>
    </button>
  );
}

function CatchSoundsToggleRow() {
  const enabled = useCatchSoundsEnabled();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="Toggle catch sounds"
      onClick={() => {
        setCatchSoundsEnabled(!enabled);
        if (!enabled) {
          primeCatchSounds();
          playPop();
        }
      }}
      className="flex w-full items-center justify-between bg-card px-4 py-4 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/50"
    >
      <span className="flex items-center gap-3">
        <div className="flex h-9 w-12 items-center justify-center">
          <Volume2 className="w-7 h-7 text-emerald-500" />
        </div>
        <span className="font-bold text-sm">Catch sounds</span>
      </span>
      <span
        className={cn(
          'inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
          enabled ? 'bg-[#447d3f]' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ease-spring',
            enabled ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </span>
    </button>
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
              notifsEnabled ? 'bg-[#447d3f]' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ease-spring',
                notifsEnabled ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
        ) : (
          <span
            className={cn(
              'text-[13px] font-black rounded-full px-2.5 py-1',
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
  bareIcon,
  title,
  titleBadge,
  subtitle,
  actionLabel,
  onAction,
  disabled,
}: {
  icon: React.ReactNode;
  bareIcon?: boolean;
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
      className="group relative isolate flex w-full items-center gap-3 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#6fbf5f_0%,#447d3f_58%,#3f7a3a_100%)] px-4 py-3.5 text-left text-white shadow-[0_3px_0_0_#2c511a] ring-1 ring-[#2c511a]/40 transition-transform duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70 disabled:active:scale-100"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-1/2 bg-gradient-to-b from-white/15 to-transparent"
      />
      {bareIcon ? (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center">{icon}</div>
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-base font-black tracking-tight flex items-center gap-2 drop-shadow-[0_1px_0_rgba(31,74,26,0.35)]">
          {title}
          {titleBadge && (
            <span className="text-[10px] font-black tracking-wider bg-white/90 text-[#3f7a3a] rounded-md px-1.5 py-0.5">
              {titleBadge}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs font-bold leading-snug text-white/90">{subtitle}</p>
      </div>
      <span
        aria-hidden
        className="shrink-0 rounded-xl bg-white px-4 py-2 text-[13px] font-black tracking-tight text-[#3f7a3a] shadow-[0_3px_0_0_rgba(31,74,26,0.55)] transition-[transform,box-shadow] duration-150 group-active:translate-y-0.5 group-active:shadow-none"
      >
        {actionLabel}
      </span>
    </button>
  );
}

function WidgetPromoIcon() {
  return (
    <span aria-hidden className="relative block h-12 w-12">
      <span className="absolute inset-0 -rotate-6 overflow-hidden rounded-[14px] bg-white shadow-[0_3px_0_0_rgba(31,74,26,0.45)] ring-1 ring-black/5">
        <img
          src="/widgets/frog-laptop.svg"
          alt=""
          className="absolute -bottom-0.5 -left-1.5 h-[30px] w-[41px] max-w-none -scale-x-100"
        />
        <span className="absolute right-1.5 top-2 flex flex-col gap-1">
          {[0, 1, 2].map((row) => (
            <span key={row} className="flex items-center gap-0.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  row === 0 ? 'bg-[#00A53C]' : 'border border-[#d9d9d9] bg-[#fafafa]',
                )}
              />
              <span className="h-1 w-3 rounded-full bg-[#e5e5e5]" />
            </span>
          ))}
        </span>
      </span>
      <img
        src="/widgets/plus.svg"
        alt=""
        className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full ring-2 ring-white"
      />
    </span>
  );
}

function QuickTile({
  icon,
  title,
  subtitle,
  onClick,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30, mass: 0.6 }}
      className={cn(
        'flex min-h-24 w-full items-center gap-3 rounded-2xl border border-border/50 bg-card px-4 py-3 text-left transition-colors duration-150 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary narrow:gap-2 narrow:px-3',
        className,
      )}
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
    <span
      aria-hidden
      className="relative block h-7 w-11 overflow-hidden rounded-full border border-amber-400 bg-amber-100 shadow-inner"
    >
      <motion.span
        initial={false}
        animate={{ opacity: dark ? 1 : 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="absolute -inset-px rounded-full border border-slate-500 bg-[#252a3d]"
      />
      <motion.span
        initial={false}
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
    </span>
  );
}

function QuickTilesGrid({
  theme,
  setTheme,
  onOpenQuestFocus,
  onOpenPreferences,
  onOpenIntegrations,
  onOpenFocusTimer,
  calendarSubtitle,
}: {
  theme?: string;
  setTheme: (t: string) => void;
  onOpenQuestFocus: () => void;
  onOpenPreferences: () => void;
  onOpenIntegrations: () => void;
  onOpenFocusTimer: () => void;
  calendarSubtitle: string;
}) {
  const { value: rotation } = useShuffleInterval();
  const [rotationOpen, setRotationOpen] = useState(false);

  return (
    <div className="grid grid-cols-2 gap-3">
      <QuickTile
        icon={<Icon name="patterns" label="Your patterns" className="h-[52px] w-[52px]" />}
        title="Your patterns"
        subtitle="See what’s working"
        onClick={() => window.location.assign('/insights')}
      />
      <QuickTile
        icon={<Icon name="shuffle" label="Style Shuffle" className="h-[52px] w-[52px]" />}
        title="Style Shuffle"
        subtitle={rotation === 'disabled' ? 'Auto-change outfits' : `New look ${labelForInterval(rotation).toLowerCase()}`}
        onClick={() => setRotationOpen(true)}
      />
      <QuickTile
        icon={<Icon name="compass" label="Areas" className="h-[52px] w-[52px]" />}
        title="Areas"
        subtitle="Pick your focus"
        onClick={onOpenQuestFocus}
      />
      <QuickTile
        icon={<Icon name="clock" label="Focus timer" className="h-[52px] w-[52px]" />}
        title="Focus timer"
        subtitle="Focus to earn flies"
        onClick={onOpenFocusTimer}
      />
      <QuickTile
        icon={<Blocks className="h-[30px] w-[30px] text-emerald-500" />}
        title="Integrations"
        subtitle={calendarSubtitle}
        onClick={onOpenIntegrations}
      />
      <QuickTile
        icon={<AnimatedThemeIcon dark={theme === 'dark'} />}
        title="Color mode"
        subtitle={theme === 'dark' ? 'Dark' : 'Light'}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />
      <SkinRotationDialog
        open={rotationOpen}
        onClose={() => setRotationOpen(false)}
      />
    </div>
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-black text-muted-foreground px-1">
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
  description,
  trailing,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex min-h-[60px] items-center gap-3 px-4 py-3 hover:bg-accent/50 active:bg-accent/70 transition-colors text-left focus-visible:outline-none focus-visible:bg-accent/60"
    >
      <div className="h-9 w-9 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold line-clamp-2 leading-tight">{label}</span>
        {description && (
          <span className="mt-0.5 block truncate text-[12px] font-semibold text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
      <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
