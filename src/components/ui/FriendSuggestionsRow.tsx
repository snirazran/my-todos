'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { UserPlus, X, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { FrogSnapshot } from '@/components/ui/FrogSnapshot';
import type { FriendSuggestion } from '@/app/api/friends/suggestions/route';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function FriendSuggestionsRow({ enabled }: { enabled: boolean }) {
  const { data, mutate } = useSWR<{ suggestions: FriendSuggestion[] }>(
    enabled ? '/api/friends/suggestions' : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const suggestions = data?.suggestions ?? [];
  if (!suggestions.length) return null;

  const dismiss = async (userId: string) => {
    mutate(
      (curr) =>
        curr
          ? {
              suggestions: curr.suggestions.filter(
                (s) => s.userId !== userId,
              ),
            }
          : curr,
      { revalidate: false },
    );
    await fetch('/api/friends/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dismissUserId: userId }),
    });
  };

  const sendRequest = async (userId: string) => {
    if (busyId || sentTo.has(userId)) return;
    setBusyId(userId);
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId: userId, source: 'suggestion' }),
      });
      if (res.ok) {
        setSentTo((prev) => new Set(prev).add(userId));
      }
    } finally {
      setBusyId(null);
    }
  };

  const mutualLabel = (s: FriendSuggestion) => {
    const names = s.mutualNames.join(', ');
    if (s.mutualCount === 1) return `Friends with ${names}`;
    if (s.mutualCount > s.mutualNames.length)
      return `Friends with ${names} +${s.mutualCount - s.mutualNames.length}`;
    return `Friends with ${names}`;
  };

  return (
    <div className="mt-5 w-full">
      <div className="mb-2.5 px-1.5">
        <h2 className="text-lg font-black tracking-tight text-foreground">
          People you may know
        </h2>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Friends of your friends
        </p>
      </div>
      <div className="w-full overflow-hidden rounded-[18px] border border-border/50 bg-card/40 p-1.5 shadow-sm">
        <ul className="flex flex-col gap-1.5">
          {suggestions.map((s) => {
            const sent = sentTo.has(s.userId);
            return (
              <li
                key={s.userId}
                className="relative flex items-center gap-2 rounded-xl border border-border/50 bg-card py-1.5 pl-1.5 pr-2 sm:gap-2.5"
              >
                <div className="flex h-[64px] w-[80px] shrink-0 items-end justify-center overflow-hidden sm:h-[76px] sm:w-[96px]">
                  <FrogSnapshot
                    className="h-[130%] w-[130%] object-contain"
                    indices={s.indices}
                    width={120}
                    height={120}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-sm font-black leading-tight tracking-tight text-foreground">
                    <span
                      className={cn(
                        'truncate',
                        s.premium && 'plus-name-shimmer',
                      )}
                    >
                      {s.name || s.frogName}
                    </span>
                    {s.premium && (
                      <Icon
                        name="frogPlus"
                        label="Frogress Plus"
                        className="h-5 w-5 shrink-0"
                      />
                    )}
                  </p>
                  <p className="truncate text-xs font-semibold text-muted-foreground">
                    {mutualLabel(s)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => sendRequest(s.userId)}
                  disabled={busyId === s.userId || sent}
                  className={cn(
                    'flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-black transition-colors',
                    sent
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                      : 'bg-[#4f9149] text-white shadow-[0_3px_0_0_#34631f] hover:bg-[#5aa354] active:translate-y-0.5 active:shadow-none',
                  )}
                >
                  {busyId === s.userId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : sent ? (
                    <>
                      <Check className="h-4 w-4" strokeWidth={3} />
                      Sent
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" strokeWidth={2.5} />
                      Add
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(s.userId)}
                  aria-label={`Dismiss ${s.name || s.frogName}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
