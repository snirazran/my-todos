'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Loader2, UserPlus, Check, Gift } from 'lucide-react';
import useSWR from 'swr';
import confetti from 'canvas-confetti';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import { GiftRive } from '@/components/ui/gift-box/GiftBox';
import QuickAddSheet from '@/components/ui/QuickAddSheet';
import { BuddyUpFlow } from '@/components/ui/BuddyUpFlow';
import { BaseSheet } from '@/components/ui/BaseSheet';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import type { QuickAddSubmit } from '@/components/ui/quick-add/types';
import type { BuddyCreateParams } from '@/lib/models/TaskBond';
import type { FriendSummary } from '@/lib/friends/indices';

const BUDDY = '#4f9149';

type WardrobeIndices = Partial<
  Record<'skin' | 'hat' | 'body' | 'hand_item', number>
>;

type GiftOption = {
  id: string;
  name: string;
  itemId: string;
  item?: {
    slot: 'skin' | 'hat' | 'body' | 'hand_item' | 'container';
    riveIndex: number;
    icon?: string;
  } | null;
  imageUrl?: string;
};
type InviteConfig = { giftOptions: GiftOption[] };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function toBuddyTask(d: QuickAddSubmit): BuddyCreateParams {
  const base = { text: d.text, repeatEndDate: d.repeatEndDate ?? undefined };
  if (d.repeat === 'monthly') return { ...base, repeat: 'monthly', dates: d.dates };
  if (d.repeat === 'custom')
    return { ...base, repeatRule: d.repeatRule, dates: d.dates };
  const days = (d.days ?? []).filter((x) => x !== -1);
  return { ...base, repeat: 'weekly', days };
}

async function shareInviteUrl(url: string) {
  try {
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      await (navigator as any).share({
        title: "Let's chase a goal together on Frogress!",
        text: 'I set up a shared goal for us — tap to join me and grab a gift.',
        url,
      });
      return;
    }
  } catch {
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    /* ignore */
  }
}

export function BuddyStartFlow({
  open,
  onClose,
  friends,
  indices,
}: {
  open: boolean;
  onClose: () => void;
  friends: FriendSummary[];
  indices?: WardrobeIndices;
}) {
  const [mode, setMode] = useState<'choose' | 'picked' | 'invite'>('choose');
  const [picked, setPicked] = useState<FriendSummary | null>(null);

  useEffect(() => {
    if (open) {
      setMode(friends.length === 0 ? 'invite' : 'choose');
      setPicked(null);
    }
  }, [open, friends.length]);

  if (!open) return null;

  return (
    <>
      <ChooseSheet
        open={mode === 'choose'}
        friends={friends}
        onClose={onClose}
        onPick={(f) => {
          setPicked(f);
          setMode('picked');
        }}
        onInvite={() => setMode('invite')}
      />

      {mode === 'picked' && (
        <BuddyUpFlow open friend={picked} onClose={onClose} />
      )}

      {mode === 'invite' && (
        <BuddyInviteFlow
          indices={indices}
          onClose={onClose}
          onBack={friends.length > 0 ? () => setMode('choose') : null}
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
      {({ bindScroll }) => (
        <div className="flex max-h-[82dvh] flex-col">
          <div className="relative shrink-0 px-6 pb-5 pt-9 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-28"
              style={{
                background: `radial-gradient(120% 100% at 50% 0%, ${BUDDY}22 0%, transparent 72%)`,
              }}
            />
            <h2 className="relative text-xl font-black tracking-tight text-foreground">
              Pick your goal buddy
            </h2>
            <p className="relative mt-1 text-sm font-medium text-muted-foreground">
              Share a repeating task — you both earn flies for it.
            </p>
          </div>

          <div
            ref={bindScroll}
            className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2"
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
                      <Frog
                        className="-translate-y-1"
                        width={112}
                        height={92}
                        indices={f.indices}
                        paused
                      />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-black tracking-tight text-foreground">
                      {f.frogName || f.name}
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
                  Invite a friend instead
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

type InvitePhase = 'compose' | 'gift' | 'sent';

function BuddyInviteFlow({
  indices,
  onClose,
  onBack,
}: {
  indices?: WardrobeIndices;
  onClose: () => void;
  onBack: (() => void) | null;
}) {
  const [phase, setPhase] = useState<InvitePhase>('compose');
  const phaseRef = useRef<InvitePhase>('compose');
  const [draft, setDraft] = useState<QuickAddSubmit | null>(null);
  const [giftId, setGiftId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentBtnRef = useRef<HTMLButtonElement>(null);
  useRegisterOpenSheet(phase !== 'compose');

  const { data: config } = useSWR<InviteConfig>('/api/invite/config', fetcher, {
    revalidateOnFocus: false,
  });

  const goPhase = (p: InvitePhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    if (phase !== 'sent') return;
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
  }, [phase]);

  const handleSend = async () => {
    if (!draft || !giftId || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/invite/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          giftOptionId: giftId,
          buddyTask: toBuddyTask(draft),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not create the invite');
        return;
      }
      const url = `${window.location.origin}/?ref=${encodeURIComponent(data.code)}`;
      await shareInviteUrl(url);
      goPhase('sent');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSending(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return (
    <>
      <QuickAddSheet
        open={phase === 'compose'}
        onOpenChange={(v) => {
          if (!v && phaseRef.current === 'compose') {
            if (onBack) onBack();
            else onClose();
          }
        }}
        defaultRepeat="weekly"
        defaultRepeatDaily
        submitLabel="Next"
        onSubmit={(d) => {
          setDraft(d);
          goPhase('gift');
        }}
      />

      {createPortal(
        <AnimatePresence>
          {phase === 'gift' && (
            <motion.div
              key="buddy-invite-gift"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-[1600] flex items-stretch justify-center bg-black/50 md:items-center md:p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 12 }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                className="relative flex w-full flex-col overflow-hidden bg-[#4f9149] text-white md:h-auto md:max-h-[calc(100dvh-2rem)] md:w-[min(100vw-2rem,30rem)] md:rounded-[28px] md:shadow-2xl"
              >
                <button
                  type="button"
                  onClick={() => goPhase('compose')}
                  aria-label="Back"
                  className="absolute left-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30 md:top-4"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>

                <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-4 pt-[calc(env(safe-area-inset-top)+3.5rem)] text-center md:pt-14">
                  <div className="relative mb-1">
                    <Frog width={150} height={135} indices={indices} paused={!!giftId} />
                    <div className="absolute -right-24 top-2 z-20 max-w-[190px] rotate-[6deg] rounded-2xl bg-white px-3.5 py-2 text-left text-[13px] font-black leading-snug tracking-tight text-[#4f9149] shadow-[0_3px_0_rgba(25,60,25,0.25)]">
                      Send them a gift so they say yes!
                      <span className="absolute -bottom-1.5 left-4 h-3 w-3 rotate-45 bg-white" />
                    </div>
                  </div>

                  <h2 className="mt-2 text-xl font-black tracking-tight">
                    Pick a gift skin
                  </h2>
                  <p className="mt-1 max-w-xs text-sm font-medium text-white/75">
                    They&apos;ll unlock it when they join and start{' '}
                    <span className="font-bold text-white">{draft?.text}</span> with
                    you.
                  </p>

                  <div className="mt-5 grid w-full max-w-sm grid-cols-3 gap-2.5">
                    {(config?.giftOptions ?? []).map((g) => {
                      const selected = giftId === g.id;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setGiftId(g.id)}
                          className={`aspect-square overflow-hidden rounded-[18px] border-4 bg-black/10 p-1 transition-all active:scale-95 ${
                            selected
                              ? 'border-white ring-4 ring-inset ring-white/25'
                              : 'border-white/15 hover:border-white/60'
                          }`}
                        >
                          <GiftPreview item={g.item ?? null} active={selected} />
                        </button>
                      );
                    })}
                    {!config && (
                      <div className="col-span-3 flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-white/70" />
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className="shrink-0 px-6 pt-3"
                  style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.75rem)' }}
                >
                  {error && (
                    <p className="mb-2 text-center text-sm font-bold text-rose-200">
                      {error}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!giftId || sending}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-lg font-black tracking-tight text-[#4f9149] shadow-[0_5px_0_rgba(0,0,0,0.15)] transition-all active:translate-y-0.5 disabled:opacity-60"
                  >
                    {sending && <Loader2 className="h-5 w-5 animate-spin" />}
                    Create invite link
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}

          {phase === 'sent' && (
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
                <div className="mx-auto mb-3 flex h-20 w-32 items-end justify-center">
                  <div className="relative z-10 translate-x-3">
                    <Frog width={112} height={100} indices={indices} paused />
                  </div>
                  <div className="relative z-0 -ml-8 -translate-x-2 scale-90">
                    <Frog width={112} height={100} paused />
                  </div>
                </div>
                <h2 className="text-xl font-black tracking-tight text-foreground">
                  Invite link ready!
                </h2>
                <p className="mt-1.5 text-[15px] font-medium text-muted-foreground">
                  We copied it for you. Send it to a friend — once they join, the
                  goal is shared and you both start earning together.
                </p>
                <button
                  ref={sentBtnRef}
                  type="button"
                  onClick={onClose}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] py-3.5 text-base font-black tracking-tight text-white shadow-[0_4px_0_#34631f] transition-all active:translate-y-0.5 active:shadow-none"
                >
                  <Check className="h-5 w-5" strokeWidth={3} />
                  Done
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

function GiftPreview({
  item,
  active = false,
}: {
  item: GiftOption['item'];
  active?: boolean;
}) {
  if (!item) {
    return (
      <div className="flex h-full w-full items-center justify-center text-white/70">
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
  const indices: WardrobeIndices =
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
