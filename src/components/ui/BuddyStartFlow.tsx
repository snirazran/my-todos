'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, UserPlus, Check, Share2 } from 'lucide-react';
import useSWR from 'swr';
import confetti from 'canvas-confetti';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { BuddyUpFlow } from '@/components/ui/BuddyUpFlow';
import {
  BuddyGoalSheet,
  type BuddyGoalDraft,
  type BuddyGiftOption,
} from '@/components/ui/buddy/BuddyGoalSheet';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import type { FriendSummary } from '@/lib/friends/indices';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { shareLink, type ShareResult } from '@/lib/share';

const BUDDY = '#4f9149';

type WardrobeIndices = Partial<
  Record<'skin' | 'hat' | 'body' | 'hand_item', number>
>;

type InviteConfig = { giftOptions: BuddyGiftOption[] };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

async function shareInviteUrl(url: string, goal: string): Promise<ShareResult> {
  const result = await shareLink({
    title: "Let's chase a goal together on Frogress!",
    text: `I set up "${goal}" as a shared goal for us — tap to join me and grab a gift.`,
    url,
    dialogTitle: 'Invite your goal buddy',
  });
  if (result === 'shared' || result === 'copied') {
    trackAnalyticsEvent('referral_invite_shared', {
      method: result === 'shared' ? 'native_share' : 'copy_link',
      share_surface: 'buddy_invite',
    });
  }
  return result;
}

export function BuddyStartFlow({
  open,
  onClose,
  friends,
  indices,
  source = 'nudge',
}: {
  open: boolean;
  onClose: () => void;
  friends: FriendSummary[];
  indices?: WardrobeIndices;
  source?: string;
}) {
  const [mode, setMode] = useState<'choose' | 'picked' | 'invite'>('choose');
  const [picked, setPicked] = useState<FriendSummary | null>(null);
  const [visitedInvite, setVisitedInvite] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(friends.length === 0 ? 'invite' : 'choose');
      setVisitedInvite(friends.length === 0);
      setPicked(null);
      trackAnalyticsEvent('buddy_flow_opened', {
        source,
        friend_count: friends.length,
      });
    }
  }, [open, friends.length, source]);

  const backToChoose = friends.length > 0 ? () => setMode('choose') : null;

  return (
    <>
      <ChooseSheet
        open={open && mode === 'choose'}
        friends={friends}
        onClose={onClose}
        onPick={(f) => {
          trackAnalyticsEvent('buddy_friend_picked', {
            source,
            method: 'existing_friend',
          });
          setPicked(f);
          setMode('picked');
        }}
        onInvite={() => {
          trackAnalyticsEvent('buddy_friend_picked', {
            source,
            method: 'invite_link',
          });
          setVisitedInvite(true);
          setMode('invite');
        }}
      />

      {picked && (
        <BuddyUpFlow
          open={open && mode === 'picked'}
          friend={picked}
          onClose={onClose}
          onBack={backToChoose}
        />
      )}

      {visitedInvite && (
        <BuddyInviteFlow
          open={open && mode === 'invite'}
          indices={indices}
          onClose={onClose}
          onBack={backToChoose}
          source={source}
        />
      )}
    </>
  );
}

function ChooseSheet({
  open,
  friends,
  onClose,
  onPick,
  onInvite,
}: {
  open: boolean;
  friends: FriendSummary[];
  onClose: () => void;
  onPick: (f: FriendSummary) => void;
  onInvite: () => void;
}) {
  return (
    <BaseSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      closeAriaLabel="Close"
      className="sm:max-w-md"
      zIndex={1200}
      hideHandle
    >
      {({ bindScroll, entered }) => (
        <div className="flex max-h-[82dvh] flex-col">
          <div className="relative shrink-0 px-6 pb-5 pt-9 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-28"
              style={{
                background: `radial-gradient(120% 100% at 50% 0%, ${BUDDY}22 0%, transparent 72%)`,
              }}
            />
            <p className="relative text-[10px] font-black uppercase tracking-[0.18em] text-[#4f9149]">
              Goal buddy · Step 1 of 2
            </p>
            <h2 className="relative mt-1 text-xl font-black tracking-tight text-foreground">
              Who are you doing it with?
            </h2>
            <p className="relative mt-1 text-sm font-medium text-muted-foreground">
              Next you&apos;ll pick the goal you both repeat.
            </p>
          </div>

          <div
            ref={bindScroll}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2"
          >
            <ul className="space-y-2">
              {friends.map((f) => (
                <li key={f.userId}>
                  <button
                    type="button"
                    onClick={() => onPick(f)}
                    className="flex w-full items-center gap-2 rounded-2xl border border-border/50 bg-card py-1.5 pl-1.5 pr-3 text-left transition-all hover:-translate-y-0.5 hover:border-[#4f9149]/40 hover:shadow-md active:scale-[0.99]"
                  >
                    <span className="flex h-14 w-16 shrink-0 items-end justify-center overflow-hidden">
                      {entered && (
                        <Frog
                          className="-translate-y-1 animate-in fade-in duration-200"
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
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={onInvite}
              className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-dashed border-[#4f9149]/40 bg-[#4f9149]/5 px-4 py-3.5 text-left transition-transform active:scale-[0.99]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4f9149]/15 text-[#4f9149]">
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
          </div>
        </div>
      )}
    </BaseSheet>
  );
}

function BuddyInviteFlow({
  open,
  indices,
  onClose,
  onBack,
  source,
}: {
  open: boolean;
  indices?: WardrobeIndices;
  onClose: () => void;
  onBack: (() => void) | null;
  source: string;
}) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ url: string; goal: string } | null>(null);
  const [copiedOnly, setCopiedOnly] = useState(false);
  const sentBtnRef = useRef<HTMLButtonElement>(null);
  useRegisterOpenSheet(open && sent);

  const { data: config } = useSWR<InviteConfig>('/api/invite/config', fetcher, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (!sent) return;
    const rect = sentBtnRef.current?.getBoundingClientRect();
    confetti({
      particleCount: 90,
      spread: 80,
      startVelocity: 42,
      origin: rect
        ? { x: (rect.left + rect.width / 2) / window.innerWidth, y: 0.4 }
        : { y: 0.4 },
      zIndex: 99999,
      colors: ['#4f9149', '#8fc36d', '#ffd166', '#ffffff'],
    });
  }, [sent]);

  const handleSend = async (draft: BuddyGoalDraft) => {
    if (sending || !draft.giftOptionId) return;
    setSending(true);
    setError(null);
    trackAnalyticsEvent('buddy_goal_composed', {
      source,
      method: 'invite_link',
      day_count: draft.days.length,
    });
    try {
      const res = await fetch('/api/invite/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          giftOptionId: draft.giftOptionId,
          buddyTask: { text: draft.text, repeat: 'weekly', days: draft.days },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not create the invite');
        return;
      }
      const url = `${window.location.origin}/?ref=${encodeURIComponent(data.code)}`;
      setInvite({ url, goal: draft.text });
      const result = await shareInviteUrl(url, draft.text);
      setCopiedOnly(result === 'copied');
      setSent(true);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSending(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return (
    <>
      <BuddyGoalSheet
        open={open && !sent}
        onClose={onClose}
        onBack={onBack}
        onSubmit={handleSend}
        sending={sending}
        error={error}
        giftOptions={config?.giftOptions}
        giftLoading={!config}
        submitLabel="Share invite link"
      />

      {createPortal(
        <AnimatePresence>
          {open && sent && (
            <motion.div
              key="buddy-invite-sent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-[1600] flex items-end justify-center bg-[#4f9149]/95 backdrop-blur-sm sm:items-center"
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-none rounded-t-[28px] bg-background px-6 pb-[calc(env(safe-area-inset-bottom)+1.75rem)] pt-8 text-center sm:max-w-md sm:rounded-[28px]"
              >
                <div className="relative mx-auto mb-3 flex h-20 w-32 items-end justify-center">
                  <div className="relative z-10 translate-x-3">
                    <Frog width={112} height={100} indices={indices} paused />
                  </div>
                  <div className="relative z-0 -ml-8 -translate-x-2 scale-90">
                    <Frog width={112} height={100} paused />
                  </div>
                  <span className="absolute -top-1 left-1/2 z-20 -translate-x-1/2">
                    <Fly size={26} y={-2} paused />
                  </span>
                </div>
                <h2 className="text-xl font-black tracking-tight text-foreground">
                  Invite link ready!
                </h2>
                <p className="mt-1.5 text-[15px] font-medium text-muted-foreground">
                  {copiedOnly
                    ? 'We copied it for you — paste it anywhere. '
                    : 'Send it to whoever you want to team up with. '}
                  Once they join, the goal is shared and you both start earning
                  together.
                </p>
                <button
                  ref={sentBtnRef}
                  type="button"
                  onClick={async () => {
                    if (!invite) return;
                    const result = await shareInviteUrl(invite.url, invite.goal);
                    setCopiedOnly(result === 'copied');
                  }}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] py-3.5 text-base font-black tracking-tight text-white shadow-[0_4px_0_#34631f] transition-all active:translate-y-0.5 active:shadow-none"
                >
                  <Share2 className="h-5 w-5" strokeWidth={2.5} />
                  Share the link
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-2 h-12 w-full rounded-2xl text-base font-black tracking-tight text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className="inline-flex items-center gap-2">
                    <Check className="h-5 w-5" strokeWidth={3} />
                    Done
                  </span>
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
