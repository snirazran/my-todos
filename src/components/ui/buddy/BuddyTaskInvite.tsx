'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Loader2, ChevronRight, Check, UserPlus, Share2, Gift } from 'lucide-react';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { shareLink } from '@/lib/share';
import type { FriendSummary } from '@/lib/friends/indices';

type GiftOption = {
  id: string;
  name: string;
  itemId: string;
  item?: {
    slot: 'skin' | 'hat' | 'body' | 'hand_item' | 'container';
    riveIndex: number;
    icon?: string;
  } | null;
};

const BUDDY = '#4f9149';
const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Shares a task the user already has: one tap on a friend sends the invite. */
export function BuddyTaskInvite({
  open,
  taskId,
  taskText,
  onClose,
}: {
  open: boolean;
  taskId: string;
  taskText: string;
  onClose: () => void;
}) {
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'friends' | 'link' | 'linkReady'>('friends');
  const [giftId, setGiftId] = useState<string | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copiedOnly, setCopiedOnly] = useState(false);

  const { data } = useSWR<{ friends: FriendSummary[] }>(
    open ? '/api/friends' : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const friends = data?.friends ?? [];

  const { data: config } = useSWR<{ giftOptions: GiftOption[] }>(
    open && view === 'link' ? '/api/invite/config' : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const reset = () => {
    setSentTo(null);
    setError(null);
    setView('friends');
    setGiftId(null);
    setInviteUrl(null);
    setCopiedOnly(false);
  };

  const shareTaskLink = async (url: string) => {
    const result = await shareLink({
      title: "Let's do this together on Frogress!",
      text: `I'm doing "${taskText}" — join me and grab a gift.`,
      url,
      dialogTitle: 'Invite your goal buddy',
    });
    if (result === 'shared' || result === 'copied') {
      trackAnalyticsEvent('referral_invite_shared', {
        method: result === 'shared' ? 'native_share' : 'copy_link',
        share_surface: 'buddy_invite',
      });
    }
    setCopiedOnly(result === 'copied');
  };

  const createLink = async () => {
    if (!giftId || creatingLink) return;
    setCreatingLink(true);
    setError(null);
    trackAnalyticsEvent('buddy_friend_picked', {
      source: 'task_detail',
      method: 'invite_link',
    });
    try {
      const res = await fetch('/api/invite/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftOptionId: giftId, buddyTaskFromId: taskId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error || 'Could not create the invite');
        return;
      }
      const url = `${window.location.origin}/?ref=${encodeURIComponent(body.code)}`;
      setInviteUrl(url);
      setView('linkReady');
      await shareTaskLink(url);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setCreatingLink(false);
    }
  };

  const send = async (friend: FriendSummary) => {
    if (sendingTo) return;
    setSendingTo(friend.userId);
    setError(null);
    trackAnalyticsEvent('buddy_friend_picked', {
      source: 'task_detail',
      method: 'existing_task',
    });
    try {
      const res = await fetch('/api/buddy/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendId: friend.userId,
          fromTaskId: taskId,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error || 'Could not send invitation');
        return;
      }
      mutateFriendsCaches();
      setSentTo(friend.name || friend.frogName || 'your friend');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSendingTo(null);
    }
  };

  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => {
        if (v) return;
        if (view === 'link') {
          setView('friends');
          setError(null);
          return;
        }
        reset();
        onClose();
      }}
      closeAriaLabel="Close"
      className="sm:max-w-md"
      zIndex={1500}
      hideHandle
    >
      {({ bindScroll, entered }) => (
        <div className="flex max-h-[82dvh] flex-col">
          <div className="relative shrink-0 px-6 pb-4 pt-9 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-28"
              style={{
                background: `radial-gradient(120% 100% at 50% 0%, ${BUDDY}22 0%, transparent 72%)`,
              }}
            />
            {sentTo ? (
              <>
                <h2 className="relative text-xl font-black tracking-tight text-foreground">
                  Invitation sent to {sentTo}!
                </h2>
                <p className="relative mt-1.5 text-sm font-medium text-muted-foreground">
                  This task now shows{' '}
                  <span className="font-bold text-foreground">
                    waiting for {sentTo}
                  </span>{' '}
                  until they accept. Then you both catch double flies for it.
                </p>
              </>
            ) : view === 'linkReady' ? (
              <>
                <h2 className="relative text-xl font-black tracking-tight text-foreground">
                  Invite link ready!
                </h2>
                <p className="relative mt-1.5 text-sm font-medium text-muted-foreground">
                  {copiedOnly
                    ? 'We copied it for you — paste it anywhere. '
                    : 'Send it to whoever you want to team up with. '}
                  When they join, this exact task becomes your shared goal.
                </p>
              </>
            ) : view === 'link' ? (
              <>
                <h2 className="relative text-xl font-black tracking-tight text-foreground">
                  Pick a welcome gift
                </h2>
                <p className="relative mt-1.5 text-sm font-medium text-muted-foreground">
                  They unlock it when they join you on{' '}
                  <span className="font-bold text-[#4f9149]">{taskText}</span>.
                </p>
              </>
            ) : (
              <>
                <h2 className="relative text-xl font-black tracking-tight text-foreground">
                  Do this with a friend
                </h2>
                <p className="relative mt-1 line-clamp-2 text-sm font-bold tracking-tight text-[#4f9149]">
                  {taskText}
                </p>
                <p className="relative mt-1.5 text-sm font-medium text-muted-foreground">
                  Pick who joins you — every time you both finish it, you both
                  catch double flies.
                </p>
              </>
            )}
          </div>

          {sentTo ? (
            <div className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
              <button
                type="button"
                onClick={() => {
                  reset();
                  onClose();
                }}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-[17px] font-black tracking-tight text-white shadow-[0_4px_0_#34631f] transition-all active:translate-y-0.5 active:shadow-none"
              >
                <Check className="h-5 w-5" strokeWidth={3} />
                Done
              </button>
            </div>
          ) : view === 'linkReady' ? (
            <div className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
              <button
                type="button"
                onClick={() => inviteUrl && shareTaskLink(inviteUrl)}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-[17px] font-black tracking-tight text-white shadow-[0_4px_0_#34631f] transition-all active:translate-y-0.5 active:shadow-none"
              >
                <Share2 className="h-5 w-5" strokeWidth={2.5} />
                Share the link
              </button>
              <button
                type="button"
                onClick={() => {
                  reset();
                  onClose();
                }}
                className="mt-2 h-12 w-full rounded-2xl text-base font-black tracking-tight text-muted-foreground transition-colors hover:text-foreground"
              >
                Done
              </button>
            </div>
          ) : view === 'link' ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div
                ref={bindScroll}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1"
              >
                <div className="grid grid-cols-3 gap-2">
                  {(config?.giftOptions ?? []).map((g) => {
                    const selected = giftId === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setGiftId(g.id)}
                        className={`aspect-square overflow-hidden rounded-[18px] border-4 bg-muted/40 p-1 transition-all active:scale-95 ${
                          selected
                            ? 'border-[#4f9149] ring-4 ring-inset ring-[#4f9149]/20'
                            : 'border-border/50 hover:border-[#4f9149]/50'
                        }`}
                      >
                        <GiftPreview
                          item={g.item ?? null}
                          active={selected && entered}
                        />
                      </button>
                    );
                  })}
                  {!config && (
                    <div className="col-span-3 flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>
              <div className="shrink-0 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
                {error && (
                  <p className="mb-2 text-center text-[13px] font-bold text-rose-500">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  disabled={!giftId || creatingLink}
                  onClick={createLink}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] text-[17px] font-black tracking-tight text-white shadow-[0_4px_0_#34631f] transition-all active:translate-y-0.5 active:shadow-none disabled:pointer-events-none disabled:opacity-50"
                >
                  {creatingLink && <Loader2 className="h-5 w-5 animate-spin" />}
                  Share invite link
                </button>
              </div>
            </div>
          ) : (
            <div
              ref={bindScroll}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-1"
            >
              {error && (
                <p className="mb-2 text-center text-[13px] font-bold text-rose-500">
                  {error}
                </p>
              )}
              {!data && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {data && friends.length === 0 && (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#4f9149]/40 bg-[#4f9149]/5 px-5 py-7 text-center">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[#4f9149]/15 text-[#4f9149]">
                    <UserPlus className="h-5 w-5" strokeWidth={2.5} />
                  </span>
                  <p className="text-sm font-black tracking-tight text-foreground">
                    No friends yet
                  </p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    Add a friend on the Friends page, then share this task with
                    them.
                  </p>
                </div>
              )}
              <ul className="space-y-2">
                {friends.map((f) => (
                  <li key={f.userId}>
                    <button
                      type="button"
                      disabled={!!sendingTo}
                      onClick={() => send(f)}
                      className="flex w-full items-center gap-2 rounded-2xl border border-border/50 bg-card py-1.5 pl-1.5 pr-3 text-left transition-all hover:-translate-y-0.5 hover:border-[#4f9149]/40 hover:shadow-md active:scale-[0.99] disabled:opacity-60"
                    >
                      <span className="flex h-14 w-16 shrink-0 items-end justify-center overflow-hidden">
                        {entered && (
                          <Frog
                            className="-translate-y-1"
                            width={112}
                            height={92}
                            indices={f.indices}
                            paused
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black tracking-tight text-foreground">
                          {f.name || f.frogName}
                        </span>
                        {!!f.frogName && f.frogName !== f.name && (
                          <span className="block truncate text-xs font-semibold text-muted-foreground">
                            {f.frogName}
                          </span>
                        )}
                      </span>
                      {sendingTo === f.userId ? (
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#4f9149]" />
                      ) : (
                        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => setView('link')}
                className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-dashed border-[#4f9149]/40 bg-[#4f9149]/5 px-4 py-3.5 text-left transition-transform active:scale-[0.99]"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#4f9149]/15 text-[#4f9149]">
                  <UserPlus className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black tracking-tight text-foreground">
                    Someone not on Frogress
                  </span>
                  <span className="block text-xs font-semibold text-muted-foreground">
                    Send a link with a gift skin
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </button>

              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[#4f9149]/25 bg-[#4f9149]/[0.07] px-3.5 py-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/80 dark:bg-card">
                  <Fly size={30} interactive={false} paused />
                </span>
                <p className="text-[13px] font-semibold leading-snug text-foreground">
                  They get their own copy — your notes, tags and reminders stay
                  private.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </BaseSheet>
  );
}

function GiftPreview({
  item,
  active = false,
}: {
  item: GiftOption['item'];
  active?: boolean;
}) {
  if (!item) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <Gift className="h-7 w-7" />
      </div>
    );
  }
  if (item.slot === 'container') {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-visible">
        <div className="h-[170%] w-[170%]">
          <GiftRive color={item.riveIndex} isMilestone={false} paused={!active} />
        </div>
      </div>
    );
  }
  const indices =
    item.slot === 'skin'
      ? { skin: item.riveIndex }
      : item.slot === 'hat'
        ? { hat: item.riveIndex }
        : item.slot === 'body'
          ? { body: item.riveIndex }
          : { hand_item: item.riveIndex };
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden">
      <Frog
        className="-translate-y-12"
        width={300}
        height={338}
        indices={indices}
        paused={!active}
      />
    </div>
  );
}
