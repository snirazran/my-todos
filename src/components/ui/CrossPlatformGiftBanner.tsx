'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ArrowRight, QrCode, Link2, Check } from 'lucide-react';
import useSWR from 'swr';
import QRCode from 'qrcode';
import { useAuth } from '@/components/auth/AuthContext';
import { useNotification } from '@/components/providers/NotificationProvider';
import {
  CROSS_GIFT_SWR_KEY,
  currentPlatform,
} from '@/components/providers/CrossGiftProvider';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { trackGrowthEvent } from '@/lib/growthTrack';
import { detectMobileOS, WEB_APP_URL } from '@/lib/appStores';
import type { CrossGiftStatus } from '@/lib/crossGift';

const DISMISS_KEY = 'frogress_xplat_banner';
const SHOW_DELAY_MS = 6000;
const COOLDOWNS_MS = [0, 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000];
const MAX_DISMISSALS = 3;

type DismissState = { count: number; lastAt: number };

function readDismissState(): DismissState {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
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
  const { stackHeight } = useNotification();
  const pathname = usePathname();
  const { data: status } = useSWR<CrossGiftStatus>(CROSS_GIFT_SWR_KEY, null);
  const [visible, setVisible] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const platform = currentPlatform();
  const isMobileWeb = platform === 'web' && detectMobileOS() !== null;

  const eligible =
    !loading &&
    !!user &&
    pathname === '/' &&
    !!status &&
    !status.claimed &&
    !status.claimable &&
    !status.otherPlatformSeen;

  useEffect(() => {
    if (!eligible) {
      setVisible(false);
      return;
    }
    if (isSnoozed(readDismissState())) return;
    const timer = setTimeout(() => {
      setVisible(true);
      trackGrowthEvent('xplat_banner_shown', { platform });
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [eligible, platform]);

  const dismiss = () => {
    const prev = readDismissState();
    try {
      localStorage.setItem(
        DISMISS_KEY,
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
      const url = await QRCode.toDataURL(`${window.location.origin}/get-app`, {
        width: 320,
        margin: 1,
      });
      setQrUrl(url);
    } catch {}
  };

  const copyWebLink = async () => {
    trackGrowthEvent('xplat_banner_cta', { platform, action: 'copy-link' });
    try {
      await navigator.clipboard.writeText(WEB_APP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          className="fixed right-3 z-[1300] w-[min(100%-1.5rem,28rem)] bottom-[calc(env(safe-area-inset-bottom)+72px+var(--stack-off))] transition-[bottom] duration-300 ease-out md:right-4 md:w-[380px] md:bottom-[calc(env(safe-area-inset-bottom)+16px+var(--stack-off))]"
          style={
            {
              '--stack-off': `${stackHeight > 0 ? stackHeight + 8 : 0}px`,
            } as CSSProperties
          }
        >
          <div className="relative overflow-hidden rounded-2xl border border-[#4f9149]/30 bg-white shadow-xl dark:border-[#4f9149]/40 dark:bg-slate-900">
            {qrUrl ? (
              <div className="flex flex-col items-center gap-2 px-4 py-4">
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label="Dismiss"
                  className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" strokeWidth={3} />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrUrl}
                  alt="QR code to download the Frogress app"
                  className="h-40 w-40 rounded-xl border border-slate-200 dark:border-slate-700"
                />
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Scan with your phone — your gift is waiting
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-3 py-3">
                <span className="-my-2 inline-flex h-16 w-12 shrink-0 items-center justify-center">
                  <GiftRive className="h-full w-full" color={0} />
                </span>
                <div className="min-w-0 flex-1">
                  {platform === 'web' ? (
                    <>
                      <p className="text-sm font-black leading-tight text-slate-800 dark:text-white">
                        A gift is waiting in the app
                      </p>
                      <p className="text-xs font-semibold text-slate-400">
                        Get the app and unwrap it in your pond
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-black leading-tight text-slate-800 dark:text-white">
                        Your pond works on computers too
                      </p>
                      <p className="text-xs font-semibold text-slate-400">
                        Sign in at frogress.com — a gift will be waiting
                      </p>
                    </>
                  )}
                </div>
                {platform === 'web' ? (
                  isMobileWeb ? (
                    <a
                      href="/get-app"
                      onClick={() =>
                        trackGrowthEvent('xplat_banner_cta', {
                          platform,
                          action: 'store',
                        })
                      }
                      className="flex shrink-0 items-center gap-1 rounded-xl bg-[#4f9149] px-3.5 py-2 text-xs font-black uppercase tracking-wide text-white shadow-[0_3px_0_0_#34631f] transition hover:brightness-105 active:translate-y-[2px] active:shadow-none"
                    >
                      Get app
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={3} />
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void showQr()}
                      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#4f9149] px-3.5 py-2 text-xs font-black uppercase tracking-wide text-white shadow-[0_3px_0_0_#34631f] transition hover:brightness-105 active:translate-y-[2px] active:shadow-none"
                    >
                      <QrCode className="h-3.5 w-3.5" strokeWidth={3} />
                      Get app
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => void copyWebLink()}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#4f9149] px-3.5 py-2 text-xs font-black uppercase tracking-wide text-white shadow-[0_3px_0_0_#34631f] transition hover:brightness-105 active:translate-y-[2px] active:shadow-none"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        Copied
                      </>
                    ) : (
                      <>
                        <Link2 className="h-3.5 w-3.5" strokeWidth={3} />
                        Copy link
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label="Dismiss"
                  className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" strokeWidth={3} />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
