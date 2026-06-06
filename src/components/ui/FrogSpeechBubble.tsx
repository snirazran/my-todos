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
  fixedMessage?: string;
  className?: string;
  messageClassName?: string;
}

export function FrogSpeechBubble({
  done,
  total,
  readyQuests = 0,
  isCatching,
  clickedAt = 0,
  fixedMessage,
  className = '',
  messageClassName = '',
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

  const displayMessage = fixedMessage ?? message;
  const textSizeClass =
    displayMessage.length > 48
      ? 'text-[10px]'
      : displayMessage.length > 40
        ? 'text-[11px]'
        : displayMessage.length > 32
          ? 'text-xs'
          : 'text-[13px]';
  const shouldShow = fixedMessage ? true : isVisible;

  return (
    <AnimatePresence>
      {shouldShow && displayMessage && (
        <motion.div
          // Center on the frog with left-1/2 + a Framer-managed x:-50% (kept in
          // every state so the pop transform can't drop it). No fixed width, so
          // the bubble sizes to its content (w-max) and only breaks at the
          // explicit newline — not by being squeezed to the frog's width.
          initial={{ opacity: 1, y: 10, scale: 0.9, x: '-50%' }}
          animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
          exit={{ opacity: 0, y: 5, scale: 0.9, x: '-50%' }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={`pointer-events-none absolute left-1/2 top-4 z-[100] w-max min-w-[11rem] max-w-[calc(100vw-1.5rem)] ${className}`}
        >
          <div className="relative rounded-[18px] border border-border/50 bg-card px-3.5 py-3 shadow-sm">
            <p className={`whitespace-nowrap text-center font-bold leading-none text-foreground ${textSizeClass} ${messageClassName}`}>
              {displayMessage.split('\n').map((line, index) => (
                <React.Fragment key={`${line}-${index}`}>
                  {index > 0 ? <br /> : null}
                  {line}
                </React.Fragment>
              ))}
            </p>

            {/* Arrow — centered under the bubble, which is centered over the frog. */}
            <div className="absolute left-1/2 -bottom-2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-border/50 bg-card" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
