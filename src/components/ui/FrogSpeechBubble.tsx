'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FROG_MESSAGES } from '@/lib/frogMessages';

interface FrogSpeechBubbleProps {
  rate: number;
  done: number;
  total: number;
  readyQuests?: number;
  clickedAt?: number;
}

export function FrogSpeechBubble({
  done,
  total,
  readyQuests = 0,
  isCatching,
  clickedAt = 0,
}: FrogSpeechBubbleProps & { isCatching?: boolean }) {
  const [message, setMessage] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const prevDoneRef = useRef(done);
  const prevReadyQuestsRef = useRef(readyQuests);
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

  const getMessage = (
    currentDone: number,
    isC?: boolean,
    currentReadyQuests = readyQuests,
  ) => {
    if (isC) return getRandom(FROG_MESSAGES.catching);
    if (currentReadyQuests > 0) {
      return getRandom(FROG_MESSAGES.quest_ready);
    }

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
    const readyQuestsChanged = readyQuests !== prevReadyQuestsRef.current;
    const catchingStarted = !!isCatching && !prevCatchingRef.current;
    const frogClicked = clickedAt > prevClickedRef.current;

    if (frogClicked) {
      setMessage(getRandom(FROG_MESSAGES.click));
      setIsVisible(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsVisible(false), 3000);
    }
    else if (
      prevDoneRef.current === done &&
      prevReadyQuestsRef.current === readyQuests &&
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
      const effectiveDone = done + 1;
      lastHandledDoneRef.current = effectiveDone;

      const newMessage = getMessage(effectiveDone, true, readyQuests);
      setMessage(newMessage);
      setIsVisible(true);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 5000);
    } else if (readyQuestsChanged && readyQuests > 0) {
      setMessage(getRandom(FROG_MESSAGES.quest_ready));
      setIsVisible(true);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 5000);
    } else if (doneIncreased) {
      if (done !== lastHandledDoneRef.current) {
        const newMessage = getMessage(done, false, readyQuests);
        setMessage(newMessage);
        setIsVisible(true);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setIsVisible(false);
        }, 5000);
      }
    } else if (done < prevDoneRef.current) {
      setIsVisible(false);
    }

    prevDoneRef.current = done;
    prevReadyQuestsRef.current = readyQuests;
    prevCatchingRef.current = !!isCatching;
    prevClickedRef.current = clickedAt;
  }, [clickedAt, done, isCatching, message, readyQuests, total]);

  const isLongMessage = message.length > 33;

  return (
    <AnimatePresence>
      {isVisible && message && (
        <motion.div
          initial={{ opacity: 1, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 5, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={`absolute ${
            isLongMessage ? '-top-6' : 'top-0'
          } -left-[8%] -translate-x-1/2 z-50 w-72 pointer-events-none`}
        >
          <div className="relative p-4 border shadow-sm bg-card rounded-[20px] border-border/50">
            <p className="text-sm font-bold leading-snug text-center text-foreground">
              {message}
            </p>

            {/* Speech Bubble Arrow */}
            <div className="absolute w-4 h-4 transform rotate-45 -translate-x-1/2 border-b border-r -bottom-2 left-1/2 bg-card border-border/50" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
