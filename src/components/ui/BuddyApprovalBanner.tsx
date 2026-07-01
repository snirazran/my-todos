'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Repeat, Check, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { useBuddyState } from '@/hooks/useBuddyState';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';

/**
 * Shows a small banner when a buddy has requested a schedule change on a shared
 * task and it's this user's turn to approve. Mounted globally.
 */
export function BuddyApprovalBanner() {
  const { user } = useAuth();
  const byTaskId = useBuddyState(!!user);
  const [busy, setBusy] = useState(false);

  const pending = Object.values(byTaskId).find(
    (s) => s.pendingRepeatChange && !s.pendingRepeatChange.requestedByMe,
  );

  const respond = async (action: 'repeat-approve' | 'repeat-decline') => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/buddy/${pending.bondId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: tz }),
      });
      if (res.ok) mutateFriendsCaches();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[1400] mx-auto flex w-[min(100%-1.5rem,28rem)] items-center gap-3 rounded-2xl border border-[#4f9149]/30 bg-white px-4 py-3 shadow-xl"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#4f9149]/12 text-[#4f9149]">
            <Repeat className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black leading-tight text-slate-800">
              {pending.partnerName} wants to change a shared task&apos;s schedule
            </p>
            <p className="text-xs font-semibold text-slate-400">
              Approve to update it for both of you
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => respond('repeat-decline')}
              disabled={busy}
              aria-label="Decline"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-60"
            >
              <X className="h-4 w-4" strokeWidth={3} />
            </button>
            <button
              type="button"
              onClick={() => respond('repeat-approve')}
              disabled={busy}
              aria-label="Approve"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4f9149] text-white transition-colors hover:bg-[#457f40] disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" strokeWidth={3} />
              )}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
