'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { CloudUpload, X } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';

const SNOOZE_KEY = 'guestBannerSnoozedAt';
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

type FrogIndices = React.ComponentProps<typeof FrogSnapshot>['indices'];

export function GuestBackupCard({
  indices,
  onSave,
  onDismiss,
}: {
  indices?: FrogIndices;
  onSave: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="relative flex items-center gap-3 rounded-[20px] border border-border/60 bg-card py-2.5 pl-2.5 pr-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
      <span
        aria-hidden
        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-sky-100 to-emerald-50 dark:from-sky-950/60 dark:to-emerald-950/30"
      >
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2">
          <FrogSnapshot
            indices={indices}
            width={64}
            height={58}
            visualOffsetY={0}
          />
        </span>
        <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-card text-sky-500 shadow-sm ring-1 ring-black/5">
          <CloudUpload className="h-3 w-3" strokeWidth={3} />
        </span>
      </span>

      <span className="min-w-0 flex-1 pr-5">
        <span className="block text-[15px] font-black leading-tight tracking-tight text-foreground">
          Back up your frog
        </span>
        <span className="mt-0.5 block text-[12.5px] font-semibold leading-snug text-muted-foreground">
          It only lives on this device
        </span>
      </span>

      <button
        type="button"
        onClick={onSave}
        className="h-10 shrink-0 rounded-xl bg-primary px-3.5 text-[14px] font-black tracking-tight text-primary-foreground shadow-[0_3px_0_0_#34631f] transition-[transform,box-shadow] active:translate-y-0.5 active:shadow-none"
      >
        Save it
      </button>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-card text-muted-foreground/70 shadow-sm ring-1 ring-border/70 transition-colors hover:text-foreground"
      >
        <X className="h-3 w-3" strokeWidth={3} />
      </button>
    </div>
  );
}

export function GuestAccountBanner() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [snoozed, setSnoozed] = useState(true);
  const show = !loading && !!user?.isAnonymous && !snoozed;
  const { indices } = useWardrobeIndices(show);

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

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="px-1.5 pt-1.5 md:px-4"
        >
          <GuestBackupCard
            indices={indices}
            onSave={() => router.push('/login?upgrade=1')}
            onDismiss={dismiss}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
