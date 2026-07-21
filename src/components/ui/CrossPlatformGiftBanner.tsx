'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, QrCode } from 'lucide-react';
import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import {
  CROSS_GIFT_SWR_KEY,
  currentPlatform,
} from '@/components/providers/CrossGiftProvider';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { trackGrowthEvent } from '@/lib/growthTrack';
import type { CrossGiftStatus } from '@/lib/crossGift';

const DISMISS_KEY_PREFIX = 'frogress_xplat_banner';
const SHOW_DELAY_MS = 8000;
const COOLDOWNS_MS = [0, 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000];
const MAX_DISMISSALS = 3;

type DismissState = { count: number; lastAt: number };

function readDismissState(storageKey: string): DismissState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.count === 'number' && typeof parsed?.lastAt === 'number') {
        return parsed;
      }
    }
  } catch {}
  return { count: 0, lastAt: 0 };
}

function isSnoozed(state: DismissState): boolean {
  if (state.count >= MAX_DISMISSALS) return true;
  if (state.count === 0) return false;
  const cooldown = COOLDOWNS_MS[Math.min(state.count, COOLDOWNS_MS.length - 1)];
  return Date.now() - state.lastAt < cooldown;
}

export function CrossPlatformGiftBanner() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const { data: status } = useSWR<CrossGiftStatus>(CROSS_GIFT_SWR_KEY, null);
  const [visible, setVisible] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const platform = currentPlatform();
  const userId = user?.uid ?? null;
  const dismissKey = userId ? `${DISMISS_KEY_PREFIX}:${userId}` : null;

  const eligible =
    platform === 'web' &&
    isDesktop &&
    !loading &&
    !!user &&
    pathname === '/' &&
    !!status &&
    !status.claimed &&
    !status.claimable &&
    !status.otherPlatformSeen;

  useEffect(() => {
    setVisible(false);
    setQrUrl(null);
    if (!eligible || !dismissKey) {
      return;
    }
    if (isSnoozed(readDismissState(dismissKey))) return;
    const timer = setTimeout(() => {
      setVisible(true);
      trackGrowthEvent('xplat_banner_shown', { platform });
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dismissKey, eligible, platform]);

  const dismiss = () => {
    if (!dismissKey) return;
    const prev = readDismissState(dismissKey);
    try {
      localStorage.setItem(
        dismissKey,
        JSON.stringify({ count: prev.count + 1, lastAt: Date.now() }),
      );
    } catch {}
    setVisible(false);
    setQrUrl(null);
    trackGrowthEvent('xplat_banner_dismissed', {
      platform,
      count: prev.count + 1,
    });
  };

  const showQr = async () => {
    trackGrowthEvent('xplat_banner_cta', { platform, action: 'qr' });
    try {
      const { default: QRCode } = await import('qrcode');
      const url = await QRCode.toDataURL(`${window.location.origin}/get-app`, {
        width: 320,
        margin: 1,
      });
      setQrUrl(url);
    } catch {}
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={
            reduceMotion
              ? { duration: 0.15 }
              : { type: 'spring', stiffness: 320, damping: 26 }
          }
          className="absolute inset-x-0 top-16 z-20 hidden md:block"
        >
          <aside
            aria-label="Get the Frogress app"
            className="border-b border-primary/20 bg-background/90 text-foreground shadow-sm backdrop-blur-xl dark:border-primary/30"
          >
            <div className="mx-auto flex min-h-14 max-w-7xl items-center gap-2.5 px-6 py-1.5 md:px-10">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg ring-1 ring-primary/10"
              >
                🎁
              </span>

              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                  App gift
                </span>
                <span
                  aria-hidden="true"
                  className="h-4 w-px shrink-0 bg-border"
                />
                <p className="truncate text-sm font-semibold tracking-tight">
                  A gift is waiting in the Frogress app
                </p>
                <p className="hidden shrink-0 text-xs font-medium text-muted-foreground xl:block">
                  Visit your frog on your phone to unwrap it.
                </p>
              </div>

              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => void showQr()}
                  aria-expanded={!!qrUrl}
                  aria-controls="cross-gift-qr"
                  className="flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-[background-color,transform] hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
                >
                  <QrCode
                    aria-hidden="true"
                    className="h-4 w-4"
                    strokeWidth={3}
                  />
                  Get app
                </button>

                <AnimatePresence>
                  {qrUrl && (
                    <motion.div
                      id="cross-gift-qr"
                      role="dialog"
                      aria-label="Scan to get the Frogress app"
                      initial={
                        reduceMotion
                          ? false
                          : { opacity: 0, y: -8, scale: 0.98 }
                      }
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: reduceMotion ? 0.1 : 0.18 }}
                      className="absolute right-0 top-full z-10 mt-2 w-72 rounded-2xl border border-primary/25 bg-popover p-4 text-popover-foreground shadow-2xl"
                    >
                      <button
                        type="button"
                        onClick={() => setQrUrl(null)}
                        aria-label="Close QR code"
                        className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <X
                          aria-hidden="true"
                          className="h-4 w-4"
                          strokeWidth={3}
                        />
                      </button>
                      <div className="flex flex-col items-center gap-2 pt-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={qrUrl}
                          alt="QR code to download the Frogress app"
                          width={160}
                          height={160}
                          className="h-40 w-40 rounded-xl border border-border"
                        />
                        <p className="text-center text-sm font-black">
                          Scan with your phone
                        </p>
                        <p className="text-pretty text-center text-xs font-semibold text-muted-foreground">
                          Sign in with the same account to find your gift.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss app gift banner"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>
          </aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
