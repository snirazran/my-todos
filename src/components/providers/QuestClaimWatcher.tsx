'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Trophy } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { useNotification } from '@/components/providers/NotificationProvider';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function QuestClaimWatcher() {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const router = useRouter();

  const timezone =
    typeof window !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';
  const key = user
    ? `/api/quests?view=home&timezone=${encodeURIComponent(timezone)}`
    : null;

  const { data, mutate } = useSWR<{ claimableCount?: number }>(key, fetcher);
  const claimable =
    typeof data?.claimableCount === 'number' ? data.claimableCount : undefined;

  const prevRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const handler = () => {
      void mutate();
    };
    window.addEventListener('quests-maybe-changed', handler);
    return () => window.removeEventListener('quests-maybe-changed', handler);
  }, [mutate]);

  useEffect(() => {
    if (claimable === undefined) return;
    const prev = prevRef.current;
    prevRef.current = claimable;
    if (prev === undefined || claimable <= prev) return;
    showNotification(
      <ClaimRewardToast onClaim={() => router.push('/quests')} />,
      undefined,
      { durationMs: 6000 },
    );
  }, [claimable, showNotification, router]);

  return null;
}

function ClaimRewardToast({ onClaim }: { onClaim: () => void }) {
  return (
    <div className="flex w-full items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-b from-amber-400 to-amber-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_5px_rgba(180,83,9,0.4)]">
        <Trophy className="h-5 w-5 text-white" strokeWidth={2.5} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-[14px] font-black text-foreground">
          Reward unlocked!
        </span>
        <span className="truncate text-[11px] font-bold text-muted-foreground">
          You reached a goal — claim your prize
        </span>
      </div>
      <button
        type="button"
        onClick={onClaim}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 px-4 text-[10px] font-black uppercase tracking-[0.15em] text-white shadow-[0_3px_0_0_#b45309] transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_0_0_#b45309] active:translate-y-[2px] active:shadow-none"
      >
        <span className="mr-[-0.15em]">Claim</span>
      </button>
    </div>
  );
}
