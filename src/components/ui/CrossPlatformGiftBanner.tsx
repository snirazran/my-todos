'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import {
  CROSS_GIFT_SWR_KEY,
  currentPlatform,
} from '@/components/providers/CrossGiftProvider';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { trackGrowthEvent } from '@/lib/growthTrack';
import { whenAutoPopupsAllowed } from '@/lib/popupGate';
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
    return whenAutoPopupsAllowed(
      () => {
        setVisible(true);
        trackGrowthEvent('xplat_banner_shown', { platform });
      },
      { initialDelayMs: SHOW_DELAY_MS, dropAfterMs: 60_000 },
    );
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

  const toggleQr = async () => {
    if (qrUrl) {
      setQrUrl(null);
      return;
    }
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
        <motion.aside
          aria-label="Get the Frogress app"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={
            reduceMotion
              ? { opacity: 0 }
              : {
                  opacity: 0,
                  y: -12,
                  transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
                }
          }
          transition={
            reduceMotion
              ? { duration: 0.15 }
              : { type: 'spring', stiffness: 420, damping: 34 }
          }
          className="pointer-events-none fixed inset-x-0 top-[76px] z-40 hidden justify-center px-6 md:flex"
        >
          <div className="pointer-events-auto relative w-full max-w-[540px] overflow-hidden rounded-[22px] border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06),0_18px_40px_-20px_rgba(15,23,42,0.45)] dark:shadow-[0_18px_40px_-16px_rgba(0,0,0,0.8)]">
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/20" />
            <div className="flex items-center gap-3 py-2.5 pl-3 pr-2">
              <motion.img
                src="/gift1.webp"
                alt=""
                width={42}
                height={40}
                className="h-10 w-[42px] shrink-0 drop-shadow-[0_5px_6px_rgba(52,99,31,0.22)]"
                animate={
                  reduceMotion
                    ? undefined
                    : { rotate: [0, -9, 7, -4, 0], y: [0, -3, 0, -1, 0] }
                }
                transition={{
                  duration: 0.9,
                  delay: 0.45,
                  repeat: 2,
                  repeatDelay: 5,
                  ease: [0.32, 0.72, 0, 1],
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-[0.08em] text-primary">
                  App gift
                </p>
                <p className="truncate text-[15px] font-black tracking-tight text-foreground">
                  A gift is waiting on your phone
                </p>
              </div>
              <button
                type="button"
                onClick={() => void toggleQr()}
                aria-expanded={!!qrUrl}
                aria-controls="cross-gift-qr"
                className="flex h-10 shrink-0 items-center rounded-xl bg-[#447d3f] px-4 text-[14px] font-black text-white shadow-[0_3px_0_0_#2c511a] transition-[transform,box-shadow,background-color] hover:-translate-y-px hover:bg-[#3d7038] hover:shadow-[0_4px_0_0_#2c511a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-[3px] active:shadow-none"
              >
                {qrUrl ? 'Hide code' : 'Get the app'}
              </button>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss app gift"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="h-4 w-4" strokeWidth={2.75} />
              </button>
            </div>

            <AnimatePresence initial={false}>
              {qrUrl && (
                <motion.div
                  id="cross-gift-qr"
                  key="qr"
                  initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={
                    reduceMotion
                      ? { duration: 0.12 }
                      : { type: 'spring', stiffness: 420, damping: 38 }
                  }
                  className="overflow-hidden"
                >
                  <div className="mx-3 mb-3 flex items-center gap-4 rounded-2xl bg-muted/50 p-3 ring-1 ring-inset ring-border/50">
                    <div className="grid h-[112px] w-[112px] shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-border/60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrUrl}
                        alt="QR code to get the Frogress app"
                        width={100}
                        height={100}
                        className="h-full w-full"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-black text-foreground">
                        Scan with your phone
                      </p>
                      <p className="mt-1 text-pretty text-[13px] font-semibold leading-snug text-muted-foreground">
                        Sign in with this account and your frog will unwrap it.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
