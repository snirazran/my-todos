'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { normalizeAnalyticsPage } from '@/lib/analytics/events';
import { trackAdPixels } from '@/lib/adpixels/client';
import {
  needsAdConsent,
  readAdConsent,
  setAdConsent,
  type AdConsent,
} from '@/lib/adpixels/consent';

export function AdConsentBanner() {
  const [visible, setVisible] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if (!needsAdConsent()) return;
    if (readAdConsent() !== null) return;
    setVisible(true);
  }, []);

  const choose = (value: AdConsent) => {
    setAdConsent(value);
    setVisible(false);
    if (value === 'granted') {
      trackAdPixels(
        'page_viewed',
        { page: normalizeAnalyticsPage(window.location.pathname) },
        crypto.randomUUID(),
      );
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={
            reduceMotion
              ? { duration: 0.15 }
              : { type: 'spring', stiffness: 320, damping: 28 }
          }
          className="fixed inset-x-0 bottom-0 z-[110] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:p-4"
        >
          <aside
            role="dialog"
            aria-label="Cookie preferences"
            className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur-xl sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tracking-tight">
                Can we use marketing cookies?
              </p>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                They help us understand which ads bring people to Frogress. The
                app works exactly the same either way.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => choose('denied')}
                className="min-h-9 flex-1 rounded-lg px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-none"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => choose('granted')}
                className="min-h-9 flex-1 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-[background-color,transform] hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] sm:flex-none"
              >
                Accept
              </button>
            </div>
          </aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
