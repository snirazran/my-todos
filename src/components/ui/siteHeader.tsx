// components/SiteHeader.tsx
'use client';

import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import { Home, History, LayoutDashboard, Shirt, Sparkles, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useUIStore } from '@/lib/uiStore';
import { useInventory } from '@/hooks/useInventory';

export default function SiteHeader() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { openWardrobe } = useUIStore();
  const { unseenCount } = useInventory();

  const navItems = [
    {
      href: '/',
      label: 'Today',
      icon: Home,
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
        if (pathname !== '/') router.push('/');
        openWardrobe();
      },
      isActive: false,
    },
  ];

  // Fixed height so pages can reserve space (mobile/desktop)
  // mobile: h-14 (=3.5rem), md: h-16 (=4rem)
  return (
    <header className="sticky md:relative top-0 z-[90] w-full h-14 md:h-16 backdrop-blur-xl border-b border-border/40 bg-background/95">
      <div className="flex items-center justify-between h-full gap-4 px-6 py-3 mx-auto max-w-7xl md:px-10">
        {/* ───────── Logo ───────── */}
        <Link
          href="/"
          className="relative inline-flex items-center gap-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg shrink-0"
        >
          <span className="text-2xl font-black tracking-tighter text-transparent bg-gradient-to-r from-primary via-emerald-500 to-primary bg-clip-text transition-all group-hover:opacity-80">
            FrogTask
          </span>
          <Sparkles
            className="h-5 w-5 text-emerald-400 animate-[float_3s_ease-in-out_infinite]"
            aria-hidden
          />
        </Link>

        {/* ───────── Desktop Navigation (Centered) ───────── */}
        <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          {navItems.map((item) => {
            const isActive = item.href ? pathname === item.href : item.isActive;
            const Icon = item.icon;

            const buttonClass = `
              relative flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all
              ${isActive
                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }
            `;

            if (item.onClick) {
              return (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className={buttonClass}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {item.label === 'Inventory' && unseenCount > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm ml-1">
                      {unseenCount > 9 ? '9+' : unseenCount}
                    </span>
                  )}
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href!}
                className={buttonClass}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* ───────── Right Side (Desktop: User Menu, Mobile: Hamburger) ───────── */}
        <div className="flex items-center gap-2 shrink-0">
          <RightActions
            session={session}
            status={status}
            onSignIn={() => signIn()}
            onSignOut={() => signOut()}
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
  );
}

// ─── Sub-Components ───

import { Menu, X, Check, Laptop, Moon, Sun, User } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function RightActions({ session, status, onSignIn, onSignOut }: { session: any, status: string, onSignIn: () => void, onSignOut: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const cycleTheme = () => {
    const modes = ['light', 'dark', 'system'];
    const nextIndex = (modes.indexOf(theme || 'light') + 1) % modes.length;
    setTheme(modes[nextIndex]);
  };

  const currentIcon = theme === 'system' ? Laptop : theme === 'dark' ? Moon : Sun;
  const currentLabel = theme === 'system' ? 'System' : theme === 'dark' ? 'Dark Mode' : 'Light Mode';
  const currentColor = theme === 'system' ? '' : theme === 'dark' ? 'text-violet-400' : 'text-amber-500';

  if (status === 'loading') return <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />;

  // NOT AUTHENTICATED
  if (!session) {
    return (
      <div className="flex items-center gap-2">
        {/* Desktop: Theme Toggle adjacent to Sign In */}
        <div className="hidden md:block">
          <ThemeToggle />
        </div>
        <Button
          onClick={onSignIn}
          className="gap-2 font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 rounded-full"
          size="sm"
        >
          <LogIn className="w-4 h-4" />
          Sign in
        </Button>
        {/* Mobile: Hamburger for Theme (since Sign In is visible) */}
        <div className="md:hidden">
          <MobileMenuButton isOpen={isOpen} setIsOpen={setIsOpen} />
          <MobileSheet
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            onSignOut={onSignOut}
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
        className="hidden md:flex items-center gap-2 pl-2 pr-1 py-1 rounded-full border border-border/50 bg-background hover:bg-accent/50 transition-all group"
      >
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-sm group-hover:shadow-md transition-all">
          {session.user?.image ? (
            <img src={session.user.image} alt="User" className="w-full h-full rounded-full object-cover" />
          ) : (
            <span>{session.user?.name?.[0] || 'U'}</span>
          )}
        </div>
        <div className={`mr-2 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          <span className="sr-only">Open menu</span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="text-muted-foreground"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </button>

      {/* Mobile Trigger */}
      <div className="md:hidden">
        <MobileMenuButton isOpen={isOpen} setIsOpen={setIsOpen} />
      </div>

      {/* Desktop Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <div className="hidden md:block absolute right-0 top-full mt-2 w-64 origin-top-right z-50">
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="p-3 bg-popover border border-border rounded-2xl shadow-xl ring-1 ring-black/5"
            >
              <div className="px-2 py-1.5 mb-2 border-b border-border/50">
                <p className="font-bold text-sm text-foreground truncate">{session.user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{session.user?.email}</p>
              </div>

              <div className="space-y-1">
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
                >
                  <span className="text-[10px] uppercase font-black text-muted-foreground tracking-wider group-hover:text-foreground transition-colors">Color Mode</span>
                  <div className="relative h-9 w-9 flex items-center justify-center">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {theme === 'dark' ? (
                        <motion.div
                          key="moon"
                          initial={{ y: 10, opacity: 0, rotate: 45 }}
                          animate={{ y: 0, opacity: 1, rotate: 0 }}
                          exit={{ y: -10, opacity: 0, rotate: -45 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          className="absolute"
                        >
                          <Moon className="h-[1.2rem] w-[1.2rem] text-violet-400" />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="sun"
                          initial={{ y: 10, opacity: 0, rotate: 45 }}
                          animate={{ y: 0, opacity: 1, rotate: 0 }}
                          exit={{ y: -10, opacity: 0, rotate: -45 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          className="absolute"
                        >
                          <Sun className="h-[1.2rem] w-[1.2rem] text-amber-500" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </button>

                <button
                  onClick={() => {
                    onSignOut();
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Menu Sheet */}
      <MobileSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSignOut={onSignOut}
        user={session.user}
        showAuth={true}
        theme={theme}
        setTheme={setTheme}
      />
    </div>
  );
}

function MobileMenuButton({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (v: boolean) => void }) {
  return (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className="p-2 -mr-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
    >
      {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
    </button>
  );
}

function MobileSheet({ isOpen, onClose, onSignOut, user, showAuth, theme, setTheme }: any) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="md:hidden fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="md:hidden fixed z-[101] top-0 right-0 bottom-0 w-[85%] max-w-xs bg-background border-l border-border/50 shadow-2xl p-6 flex flex-col gap-6 h-[100dvh]"
            style={{ backgroundColor: 'hsl(var(--background))' }} // Force solid background using valid HSL
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black tracking-tight">Menu</h2>
              <button onClick={onClose} className="p-2 -mr-2 rounded-full hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>

            {showAuth && user && (
              <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-sm text-lg">
                  {user.image ? (
                    <img src={user.image} alt="User" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <span>{user.name?.[0] || 'U'}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Appearance</label>
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="w-full items-center justify-between flex p-4 rounded-xl border border-border/50 bg-card/50 hover:bg-accent/50 transition-colors group"
                >
                  <span className="font-bold text-sm group-hover:text-foreground transition-colors">Color Mode</span>
                  <div className="relative h-9 w-9 flex items-center justify-center">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {theme === 'dark' ? (
                        <motion.div
                          key="moon"
                          initial={{ y: 10, opacity: 0, rotate: 45 }}
                          animate={{ y: 0, opacity: 1, rotate: 0 }}
                          exit={{ y: -10, opacity: 0, rotate: -45 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          className="absolute"
                        >
                          <Moon className="h-[1.2rem] w-[1.2rem] text-violet-400" />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="sun"
                          initial={{ y: 10, opacity: 0, rotate: 45 }}
                          animate={{ y: 0, opacity: 1, rotate: 0 }}
                          exit={{ y: -10, opacity: 0, rotate: -45 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          className="absolute"
                        >
                          <Sun className="h-[1.2rem] w-[1.2rem] text-amber-500" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </button>
              </div>
            </div>

            <div className="mt-auto">
              {showAuth && (
                <button
                  onClick={() => {
                    onSignOut();
                    onClose();
                  }}
                  className="w-full flex items-center justify-center gap-2 p-4 rounded-xl font-bold bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
