'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Loader2, Bell, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import Frog from '@/components/ui/frog';
import Fly from '@/components/ui/fly';
import QuickAddSheet from '@/components/ui/QuickAddSheet';
import type { QuickAddSubmit } from '@/components/ui/quick-add/types';
import type { FriendSummary } from '@/lib/friends/indices';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';
import { useWardrobeIndices } from '@/hooks/useWardrobeIndices';
import { useAuth } from '@/components/auth/AuthContext';
import { useRegisterOpenSheet } from '@/lib/sheetStore';

type Phase = 'compose' | 'review' | 'sent';

function repeatLabel(d: QuickAddSubmit): string {
  if (d.repeat === 'monthly') return 'monthly';
  if (d.repeat === 'custom') return 'custom';
  const days: number[] = (d.days ?? []).filter((x) => x !== -1);
  if (days.length === 7) return 'daily';
  if (days.length === 5 && [1, 2, 3, 4, 5].every((x) => days.includes(x)))
    return 'weekdays';
  if (days.length === 2 && [0, 6].every((x) => days.includes(x)))
    return 'weekend';
  return 'weekly';
}

async function checkNotifGranted(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const s = await FirebaseMessaging.checkPermissions();
      return s.receive === 'granted';
    }
    return (
      typeof Notification !== 'undefined' && Notification.permission === 'granted'
    );
  } catch {
    return false;
  }
}

async function requestNotif(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const s = await FirebaseMessaging.requestPermissions();
      return s.receive === 'granted';
    }
    if (typeof Notification !== 'undefined') {
      return (await Notification.requestPermission()) === 'granted';
    }
    return false;
  } catch {
    return false;
  }
}

function inviteBody(d: QuickAddSubmit, friendId: string) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const base = {
    friendId,
    text: d.text,
    repeatEndDate: d.repeatEndDate ?? undefined,
    timezone,
  };
  if (d.repeat === 'monthly') return { ...base, repeat: 'monthly', dates: d.dates };
  if (d.repeat === 'custom')
    return { ...base, repeatRule: d.repeatRule, dates: d.dates };
  const days = (d.days ?? []).filter((x) => x !== -1);
  return { ...base, repeat: 'weekly', days };
}

export function BuddyUpFlow({
  open,
  friend,
  onClose,
}: {
  open: boolean;
  friend: FriendSummary | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { indices: myIndices } = useWardrobeIndices(!!user);
  const [phase, setPhase] = useState<Phase>('compose');
  const phaseRef = useRef<Phase>('compose');
  const [draft, setDraft] = useState<QuickAddSubmit | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifGranted, setNotifGranted] = useState(false);
  const sentBtnRef = useRef<HTMLButtonElement>(null);
  useRegisterOpenSheet(open && phase !== 'compose');

  const goPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    if (open) {
      goPhase('compose');
      setDraft(null);
      setError(null);
      setSending(false);
    }
  }, [open]);

  useEffect(() => {
    if (phase !== 'sent') return;
    void checkNotifGranted().then(setNotifGranted);
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

  const friendName = friend?.name || friend?.frogName || 'your friend';

  const handleSend = async () => {
    if (!friend || !draft || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/buddy/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteBody(draft, friend.userId)),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not send invitation');
        return;
      }
      mutateFriendsCaches();
      goPhase('sent');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSending(false);
    }
  };

  if (!open || !friend) {
    // Keep QuickAddSheet mounted only while composing.
    return null;
  }

  if (typeof document === 'undefined') return null;

  return (
    <>
      <QuickAddSheet
        open={phase === 'compose'}
        onOpenChange={(v) => {
          // Only treat a close as "cancel" if we're still composing — a submit
          // transitions to 'review' first (checked via ref to avoid stale state).
          if (!v && phaseRef.current === 'compose') onClose();
        }}
        defaultRepeat="weekly"
        defaultRepeatDaily
        submitLabel="Next"
        onSubmit={(d) => {
          setDraft(d);
          goPhase('review');
        }}
      />

      {createPortal(
        <AnimatePresence>
          {phase === 'review' && (
            <motion.div
              key="buddy-review"
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
                className="relative flex w-full flex-col overflow-hidden bg-[#4f9149] md:h-auto md:max-h-[calc(100dvh-2rem)] md:w-[min(100vw-2rem,30rem)] md:rounded-[28px] md:shadow-2xl"
              >
                <button
                  type="button"
                  onClick={() => goPhase('compose')}
                  aria-label="Back"
                  className="absolute left-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30 md:top-4"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>

                <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pb-4 pt-[calc(env(safe-area-inset-top)+3.5rem)] md:pt-14">
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/70">
                  To
                </p>
                <div className="mt-2 flex items-center gap-2 rounded-full bg-black/15 py-1.5 pl-1.5 pr-4">
                  <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white/20">
                    <Frog
                      className="-translate-y-[20px]"
                      width={144}
                      height={130}
                      indices={friend.indices}
                      paused
                    />
                  </span>
                  <span className="flex flex-col leading-tight">
                    <span className="text-lg font-black text-white">
                      {friend.name || friend.frogName}
                    </span>
                    {friend.name &&
                      friend.frogName &&
                      friend.name !== friend.frogName && (
                        <span className="text-[11px] font-semibold text-white/60">
                          {friend.frogName}
                        </span>
                      )}
                  </span>
                </div>

                <div className="relative mt-16 translate-y-[11px]">
                  <Frog width={196} height={176} indices={myIndices} />
                  <div className="absolute -right-[5.5rem] top-1 z-20 max-w-[200px] rotate-[6deg] rounded-2xl bg-white px-3.5 py-2 text-left text-[13px] font-black leading-snug tracking-tight text-[#4f9149] shadow-[0_3px_0_rgba(25,60,25,0.25)]">
                    Wanna be my Goal Buddy? Let&apos;s build this habit together!
                    <span className="absolute -bottom-1.5 left-4 h-3 w-3 rotate-45 bg-white" />
                  </div>
                </div>

                <div className="mt-4 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-white/20 bg-white/95 px-4 py-3 shadow-lg dark:border-border dark:bg-card/95">
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-base font-black text-slate-800 dark:text-card-foreground">
                      {draft?.text}
                    </p>
                    <p className="text-sm font-semibold capitalize text-slate-400 dark:text-muted-foreground">
                      {draft ? repeatLabel(draft) : ''}
                    </p>
                  </div>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-muted">
                    <span className="-translate-y-[2px]">
                      <Fly size={34} interactive={false} paused />
                    </span>
                  </span>
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
                  disabled={sending}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-lg font-black tracking-tight text-[#4f9149] shadow-[0_5px_0_rgba(0,0,0,0.15)] transition-all active:translate-y-0.5 disabled:opacity-70"
                >
                  {sending && <Loader2 className="h-5 w-5 animate-spin" />}
                  Send invitation
                </button>
                <p className="mt-3 text-center text-[13px] font-medium text-white/70">
                  Your invite will expire in 24 hours
                </p>
              </div>
              </motion.div>
            </motion.div>
          )}

          {phase === 'sent' && (
            <motion.div
              key="buddy-sent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1600] flex items-end justify-center bg-[#4f9149]/95 backdrop-blur-sm sm:items-center"
              onClick={onClose}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-none rounded-t-[28px] bg-background px-6 pb-[calc(env(safe-area-inset-bottom)+1.75rem)] pt-8 text-center sm:max-w-md sm:rounded-[28px]"
              >
                <div className="mx-auto mb-4 w-fit">
                  <Frog width={130} height={120} indices={friend.indices} paused />
                </div>
                <h2 className="text-xl font-black tracking-tight text-foreground">
                  Your invitation has been sent to {friendName}!
                </h2>
                <p className="mt-1.5 text-[15px] font-medium text-muted-foreground">
                  {notifGranted
                    ? "We'll let you know when they accept."
                    : 'Get notified when they accept your invitation!'}
                </p>
                {notifGranted ? (
                  <button
                    ref={sentBtnRef}
                    type="button"
                    onClick={onClose}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] py-3.5 text-base font-black tracking-tight text-white shadow-[0_4px_0_#34631f] transition-all active:translate-y-0.5 active:shadow-none"
                  >
                    <Check className="h-5 w-5" strokeWidth={3} />
                    Done
                  </button>
                ) : (
                  <>
                    <button
                      ref={sentBtnRef}
                      type="button"
                      onClick={async () => {
                        await requestNotif();
                        onClose();
                      }}
                      className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4f9149] py-3.5 text-base font-black tracking-tight text-white shadow-[0_4px_0_#34631f] transition-all active:translate-y-0.5 active:shadow-none"
                    >
                      <Bell className="h-5 w-5" />
                      Turn on notifications
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="mt-2 h-12 w-full rounded-2xl text-base font-black tracking-tight text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Maybe later
                    </button>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
