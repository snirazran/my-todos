'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  consumeWelcomeSlot,
  pickFrogLine,
  type FrogSpeechContext,
} from '@/lib/frogSpeech';

interface FrogSpeechBubbleProps {
  rate: number;
  done: number;
  total: number;
  readyQuests?: number;
  clickedAt?: number;
  fixedMessage?: string;
  facts?: FrogSpeechContext;
  className?: string;
  messageClassName?: string;
}

const TAP_CHAIN_WINDOW_MS = 20_000;

export function FrogSpeechBubble({
  done,
  total,
  readyQuests = 0,
  isCatching,
  clickedAt = 0,
  fixedMessage,
  facts,
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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tapCountRef = useRef(0);
  const lastTapAtRef = useRef(0);

  const factsRef = useRef({ done, total, readyQuests, facts });
  factsRef.current = { done, total, readyQuests, facts };

  const speak = (text: string, ms: number) => {
    if (!text) return;
    setMessage(text);
    setIsVisible(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsVisible(false), ms);
  };

  const speakRef = useRef(speak);
  speakRef.current = speak;

  useEffect(() => {
    if (fixedMessage !== undefined) return;
    const timer = setTimeout(() => {
      const slot = consumeWelcomeSlot();
      if (!slot.show) return;
      const current = factsRef.current;
      speakRef.current(
        pickFrogLine('welcome', {
          ...current.facts,
          done: current.done,
          total: current.total,
          readyQuests: current.readyQuests,
          isFirstVisitToday: slot.isFirstVisitToday,
        }),
        6000,
      );
    }, 900);
    return () => clearTimeout(timer);
  }, [fixedMessage]);

  useEffect(() => {
    const doneIncreased = done > prevDoneRef.current;
    const readyQuestsChanged = readyQuests !== prevReadyQuestsRef.current;
    const catchingStarted = !!isCatching && !prevCatchingRef.current;
    const frogClicked = clickedAt > prevClickedRef.current;

    if (frogClicked) {
      const now = Date.now();
      tapCountRef.current =
        now - lastTapAtRef.current < TAP_CHAIN_WINDOW_MS
          ? tapCountRef.current + 1
          : 1;
      lastTapAtRef.current = now;
      speak(
        pickFrogLine('tap', { ...facts, tapCount: tapCountRef.current }),
        3000,
      );
    } else if (catchingStarted) {
      const effectiveDone = done + 1;
      lastHandledDoneRef.current = effectiveDone;
      speak(
        pickFrogLine('catch', { ...facts, done: effectiveDone, total }),
        4000,
      );
    } else if (readyQuestsChanged && readyQuests > 0) {
      speak(pickFrogLine('quest_ready', { ...facts, readyQuests }), 5000);
    } else if (doneIncreased) {
      if (done !== lastHandledDoneRef.current) {
        speak(pickFrogLine('catch', { ...facts, done, total }), 4000);
      }
    } else if (done < prevDoneRef.current) {
      setIsVisible(false);
    }

    prevDoneRef.current = done;
    prevReadyQuestsRef.current = readyQuests;
    prevCatchingRef.current = !!isCatching;
    prevClickedRef.current = clickedAt;
  }, [clickedAt, done, facts, isCatching, readyQuests, total]);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const displayMessage = fixedMessage ?? message;
  const longestLine = displayMessage
    .split('\n')
    .reduce((max, line) => Math.max(max, line.length), 0);
  const textSizeClass =
    longestLine > 48
      ? 'text-[10px]'
      : longestLine > 40
        ? 'text-[11px]'
        : longestLine > 32
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
          // Centered on the frog (x: -50%) with a tiny rightward nudge.
          initial={{ opacity: 1, y: 10, scale: 0.9, x: 'calc(-50% + 4px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, x: 'calc(-50% + 4px)' }}
          exit={{ opacity: 0, y: 5, scale: 0.9, x: 'calc(-50% + 4px)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={`pointer-events-none absolute left-1/2 top-4 z-[100] w-max min-w-[11rem] max-w-[calc(100vw-1.5rem)] ${className}`}
        >
          <div className="relative rounded-[18px] border border-border/50 bg-card px-3.5 py-3 shadow-sm">
            <p className={`whitespace-nowrap text-center font-bold ${displayMessage.includes('\n') ? 'leading-tight' : 'leading-none'} text-foreground ${textSizeClass} ${messageClassName}`}>
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
