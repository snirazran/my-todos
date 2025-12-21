'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProgressLogic } from '@/hooks/useProgressLogic';
import { FROG_MESSAGES } from '@/lib/frogMessages';

interface FrogSpeechBubbleProps {
  rate: number;
  done: number;
  total: number;
  giftsClaimed: number;
  clickedAt?: number;
}

export function FrogSpeechBubble({
  rate,
  done,
  total,
  giftsClaimed,
  isCatching,
  clickedAt = 0,
}: FrogSpeechBubbleProps & { isCatching?: boolean }) {
  const slots = useProgressLogic(done, total, giftsClaimed);
  const [message, setMessage] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const prevDoneRef = useRef(done);
  const prevGiftsRef = useRef(giftsClaimed);
  const prevCatchingRef = useRef(!!isCatching);
  const prevClickedRef = useRef(clickedAt);
  const lastHandledDoneRef = useRef<number | null>(null);
  const lastMessageRef = useRef('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getRandom = (arr: string[]) => {
    const candidates = arr.filter((msg) => msg !== lastMessageRef.current);
    if (candidates.length === 0) return arr[0];
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    lastMessageRef.current = picked;
    return picked;
  };

  const getMessage = (currentDone: number, isC?: boolean) => {
    // 0. Catching? (Highest priority if active)
    if (isC) return getRandom(FROG_MESSAGES.catching);

    // 1. Gift Ready?
    const readySlot = slots.find((s) => s.status === 'READY');
    if (readySlot) return getRandom(FROG_MESSAGES.gift_ready);

    // 2. Next Gift Locked/Pending?
    const nextSlot = slots.find(
      (s) => s.status === 'PENDING' || s.status === 'LOCKED'
    );
    if (nextSlot) {
      let tasksNeeded = 0;
      if (nextSlot.status === 'PENDING') {
        tasksNeeded = (nextSlot.target as number) - currentDone;
      } else {
        // @ts-ignore
        tasksNeeded = nextSlot.neededToUnlock as number;
      }

      if (tasksNeeded > 0 && tasksNeeded <= 2) {
        const templates = FROG_MESSAGES.locked_gift(tasksNeeded);
        return templates[Math.floor(Math.random() * templates.length)];
      }
    }

    // 3. General Progress
    // Recalculate rate based on currentDone
    const currentRate = total > 0 ? (currentDone / total) * 100 : 0;

    if (total === 0) return getRandom(FROG_MESSAGES.start);
    if (currentDone === total && total > 0)
      return getRandom(FROG_MESSAGES.done);
    if (currentRate < 30) return getRandom(FROG_MESSAGES.early);
    if (currentRate < 80) return getRandom(FROG_MESSAGES.mid);
    return getRandom(FROG_MESSAGES.near_finish);
  };

  useEffect(() => {
    const doneIncreased = done > prevDoneRef.current;
    const giftsChanged = giftsClaimed !== prevGiftsRef.current;
    const catchingStarted = !!isCatching && !prevCatchingRef.current;
    const frogClicked = clickedAt > prevClickedRef.current;

    // Handle Clicks (Tickles) - Highest Priority
    if (frogClicked) {
      setMessage(getRandom(FROG_MESSAGES.click));
      setIsVisible(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsVisible(false), 3000);
    }
    // Also show on initial load if there are tasks and we haven't shown a message yet
    else if (
      prevDoneRef.current === done &&
      prevGiftsRef.current === giftsClaimed &&
      total > 0 &&
      !message
    ) {
      setMessage(getRandom(FROG_MESSAGES.welcome));
      setIsVisible(true);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 5000);
    } else if (catchingStarted) {
      // Anticipate the next done count and mark it as handled
      const effectiveDone = done + 1;
      lastHandledDoneRef.current = effectiveDone;

      const newMessage = getMessage(effectiveDone, true);
      setMessage(newMessage);
      setIsVisible(true);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 5000);
    } else if (doneIncreased) {
      // Only show if we haven't already handled this specific done count via anticipation
      if (done !== lastHandledDoneRef.current) {
        const newMessage = getMessage(done);
        setMessage(newMessage);
        setIsVisible(true);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setIsVisible(false);
        }, 5000);
      }
    } else if (giftsChanged) {
      const newMessage = getMessage(done);
      setMessage(newMessage);
      setIsVisible(true);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 5000);
    } else if (done < prevDoneRef.current) {
      // Explicitly hide on undo
      setIsVisible(false);
    }

    prevDoneRef.current = done;
    prevGiftsRef.current = giftsClaimed;
    prevCatchingRef.current = !!isCatching;
    prevClickedRef.current = clickedAt;
  }, [done, total, giftsClaimed, rate, slots, message, isCatching, clickedAt]);

  const isLongMessage = message.length > 33;

  return (
    <AnimatePresence>
      {isVisible && message && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 5, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={`absolute ${
            isLongMessage ? '-top-10' : '-top-4'
          } -left-[5%] -translate-x-1/2 z-50 w-72 pointer-events-none`}
        >
          <div className="relative bg-white/80 dark:bg-slate-900/60 backdrop-blur-2xl rounded-[20px] p-4 shadow-sm border border-white/50 dark:border-slate-800/50">
            <p className="text-sm font-bold leading-snug text-center text-slate-800 dark:text-slate-100">
              {message}
            </p>

            {/* Speech Bubble Arrow */}
            <div className="absolute w-4 h-4 transform rotate-45 -translate-x-1/2 border-b border-r -bottom-2 left-1/2 bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border-white/50 dark:border-slate-800/50" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
