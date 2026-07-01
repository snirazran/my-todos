'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Check, X, Loader2, UserPlus, Users } from 'lucide-react';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';

type IncomingRequest = {
  id: string;
  fromUserId: string;
  name: string;
  frogName: string;
  createdAt: string;
};

type BuddyInvite = {
  bondId: string;
  direction: 'incoming' | 'outgoing';
  withName: string;
  text: string;
  repeatLabel: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function FriendRequestsInbox({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data, mutate } = useSWR<{ incoming: IncomingRequest[] }>(
    open ? '/api/friends/request' : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: buddyData, mutate: mutateBuddy } = useSWR<{
    incoming: BuddyInvite[];
  }>(open ? '/api/buddy/invite' : null, fetcher, { revalidateOnFocus: false });

  const [busyId, setBusyId] = useState<string | null>(null);

  const respond = async (requestId: string, action: 'accept' | 'decline') => {
    setBusyId(requestId);
    try {
      const res = await fetch('/api/friends/request', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action }),
      });
      if (res.ok) {
        await mutate();
        mutateFriendsCaches();
      }
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  const respondBuddy = async (bondId: string, action: 'accept' | 'decline') => {
    setBusyId(bondId);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/buddy/${bondId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: tz }),
      });
      if (res.ok) {
        await mutateBuddy();
        mutateFriendsCaches();
      }
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  const incoming = data?.incoming ?? [];
  const buddyInvites = (buddyData?.incoming ?? []).filter(
    (b) => b.direction === 'incoming',
  );
  const loading = !data || !buddyData;
  const isEmpty = incoming.length === 0 && buddyInvites.length === 0;

  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      closeAriaLabel="Close friend alerts"
      className="sm:max-w-lg"
    >
      {({ bindScroll }) => (
        <div className="flex max-h-[80dvh] flex-col">
          <div className="px-6 pb-2 pt-5 text-center">
            <h2 className="text-xl font-black tracking-tight">Friend alerts</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Friend &amp; buddy requests
            </p>
          </div>

          <div
            ref={bindScroll}
            className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3"
          >
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : isEmpty ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                  <UserPlus className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-sm font-bold text-muted-foreground">
                  No alerts right now
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {incoming.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-4 py-3"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-base font-black text-white">
                      {(req.name || req.frogName || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black">
                        {req.name || req.frogName}
                      </p>
                      <p className="truncate text-xs font-medium text-muted-foreground">
                        wants to be your friend
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => respond(req.id, 'decline')}
                        disabled={busyId === req.id}
                        aria-label="Decline"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" strokeWidth={3} />
                      </button>
                      <button
                        onClick={() => respond(req.id, 'accept')}
                        disabled={busyId === req.id}
                        aria-label="Accept"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
                      >
                        {busyId === req.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" strokeWidth={3} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}

                {buddyInvites.map((inv) => (
                  <div
                    key={inv.bondId}
                    className="flex items-center gap-3 rounded-2xl border border-[#4f9149]/30 bg-[#4f9149]/8 px-4 py-3"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#4f9149]/15 text-[#4f9149]">
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black">
                        {inv.withName} wants to team up
                      </p>
                      <p className="truncate text-xs font-medium text-muted-foreground">
                        {inv.text}
                        {inv.repeatLabel ? ` · ${inv.repeatLabel}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => respondBuddy(inv.bondId, 'decline')}
                        disabled={busyId === inv.bondId}
                        aria-label="Decline"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" strokeWidth={3} />
                      </button>
                      <button
                        onClick={() => respondBuddy(inv.bondId, 'accept')}
                        disabled={busyId === inv.bondId}
                        aria-label="Accept"
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4f9149] text-white transition-colors hover:bg-[#457f40] disabled:opacity-50"
                      >
                        {busyId === inv.bondId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" strokeWidth={3} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </BaseSheet>
  );
}
