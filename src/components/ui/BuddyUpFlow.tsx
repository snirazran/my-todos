'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import Frog from '@/components/ui/frog';
import { BuddyGoalSheet, type BuddyGoalDraft } from '@/components/ui/buddy/BuddyGoalSheet';
import type { FriendSummary } from '@/lib/friends/indices';
import { mutate as mutateGlobal } from 'swr';
import { mutateFriendsCaches } from '@/hooks/useFriendsSync';
import { useRegisterOpenSheet } from '@/lib/sheetStore';
import { trackAnalyticsEvent } from '@/lib/analytics/client';

type Phase = 'compose' | 'sent';

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

export function BuddyUpFlow({
  open,
  friend,
  onClose,
  onBack,
}: {
  open: boolean;
  friend: FriendSummary | null;
  onClose: () => void;
  onBack?: (() => void) | null;
}) {
  const [phase, setPhase] = useState<Phase>('compose');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifGranted, setNotifGranted] = useState(false);
  const sentBtnRef = useRef<HTMLButtonElement>(null);
  useRegisterOpenSheet(open && phase === 'sent');

  useEffect(() => {
    if (open) {
      setPhase('compose');
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

  const handleSend = async (draft: BuddyGoalDraft) => {
    if (!friend || sending) return;
    setSending(true);
    setError(null);
    trackAnalyticsEvent('buddy_goal_composed', {
      source: 'existing_friend',
      day_count: draft.days.length,
    });
    try {
      const res = await fetch('/api/buddy/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendId: friend.userId,
          text: draft.text,
          repeat: 'weekly',
          days: draft.days,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not send invitation');
        return;
      }
      mutateFriendsCaches();
      mutateGlobal((key) => typeof key === 'string' && key.startsWith('/api/tasks'));
      setPhase('sent');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSending(false);
    }
  };

  if (!friend) return null;
  if (typeof document === 'undefined') return null;

  return (
    <>
      <BuddyGoalSheet
        open={open && phase === 'compose'}
        onClose={onClose}
        onBack={onBack ?? null}
        onSubmit={handleSend}
        recipientName={friend.name || friend.frogName}
        recipientFrogName={friend.frogName}
        recipientIndices={friend.indices}
        sending={sending}
        error={error}
      />

      {createPortal(
        <AnimatePresence>
          {open && phase === 'sent' && (
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
                  Invitation sent to {friendName}!
                </h2>
                <p className="mt-1.5 text-[15px] font-medium text-muted-foreground">
                  The task is already on your list, marked{' '}
                  <span className="font-bold text-foreground">
                    waiting for {friendName}
                  </span>
                  . It turns into a shared goal the moment they accept.
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
                      Tell me when they accept
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
