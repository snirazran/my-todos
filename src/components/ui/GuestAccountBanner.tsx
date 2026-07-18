'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ShieldAlert, X } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';

const SNOOZE_KEY = 'guestBannerSnoozedAt';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export function GuestAccountBanner() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [snoozed, setSnoozed] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SNOOZE_KEY);
      const at = raw ? Number(raw) : 0;
      setSnoozed(Number.isFinite(at) && Date.now() - at < SNOOZE_MS);
    } catch {
      setSnoozed(false);
    }
  }, []);

  const dismiss = () => {
    setSnoozed(true);
    try {
      window.localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {}
  };

  const show = !loading && !!user?.isAnonymous && !snoozed;

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden px-2 md:px-0"
        >
          <div className="mb-1 flex items-center gap-2.5 rounded-2xl border border-amber-300/60 bg-amber-50 py-2 pl-3 pr-1.5 dark:border-amber-500/30 dark:bg-amber-500/10">
            <ShieldAlert
              className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
              strokeWidth={2.5}
            />
            <p className="min-w-0 flex-1 text-xs font-bold leading-tight text-amber-900 dark:text-amber-100">
              Your frog isn&apos;t backed up — it lives only on this device.
            </p>
            <button
              type="button"
              onClick={() => router.push('/login?upgrade=1')}
              className="h-8 shrink-0 rounded-xl bg-amber-500 px-3 text-xs font-black tracking-tight text-white shadow-sm transition-all hover:brightness-105 active:scale-[0.97]"
            >
              Save it
            </button>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-amber-700/70 transition-colors hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-200/70 dark:hover:text-amber-100"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
