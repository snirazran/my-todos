'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  consumeWelcomeSlot,
  pickFrogLine,
  type FrogSpeechContext,
} from '@/lib/frogSpeech';
import { useSheetStore } from '@/lib/sheetStore';
import { useFrogodoroStore } from '@/lib/frogodoroStore';

interface FrogSpeechBubbleProps {
  rate: number;
  done: number;
  total: number;
  readyQuests?: number;
  clickedAt?: number;
  fixedMessage?: string;
  typedChars?: number;
  facts?: FrogSpeechContext;
  className?: string;
  messageClassName?: string;
  side?: boolean;
}

const TAP_CHAIN_WINDOW_MS = 20_000;

export function FrogSpeechBubble({
  done,
  total,
  readyQuests = 0,
  isCatching,
  clickedAt = 0,
  fixedMessage,
  typedChars,
  facts,
  className = '',
  messageClassName = '',
  side = false,
}: FrogSpeechBubbleProps & { isCatching?: boolean }) {
  const reduceMotion = useReducedMotion();
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
      // A sheet/popup is covering the page (e.g. the Frogodoro timer opened
      // right after load) or a focus session is live: greeting now would show
      // welcome text over the timer. Skip WITHOUT consuming the welcome slot,
      // so the greeting still lands on the next uncovered visit.
      if (
        useSheetStore.getState().count > 0 ||
        useFrogodoroStore.getState().timerActive
      ) {
        return;
      }
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
  const shouldShow = fixedMessage ? true : isVisible;
  const typing = typedChars !== undefined;
  let typedSoFar = 0;

  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-4 z-[100] h-0 w-0 ${className}`}
    >
      <AnimatePresence>
        {shouldShow && displayMessage && (
          <div
            key={typing ? 'typed' : displayMessage}
            className={
              side
                ? 'absolute left-0 top-0 w-max -translate-y-1/2'
                : 'absolute bottom-0 left-1 w-max -translate-x-1/2'
            }
          >
            <motion.div
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : side
                    ? { opacity: 0, scale: 0.55, x: -10 }
                    : { opacity: 0, scale: 0.55, y: 10 }
              }
              animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              exit={
                reduceMotion
                  ? { opacity: 0, transition: { duration: 0.12 } }
                  : side
                    ? { opacity: 0, scale: 0.8, x: -6, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }
                    : { opacity: 0, scale: 0.8, y: 6, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }
              }
              transition={{
                opacity: { duration: 0.14, ease: 'easeOut' },
                default: { type: 'spring', stiffness: 520, damping: 26, mass: 0.8 },
              }}
              style={{ transformOrigin: side ? '0% 50%' : '50% 100%' }}
              className={`frog-bubble flex items-center ${side ? 'flex-row-reverse' : 'flex-col'}`}
            >
              <div
                className={`relative rounded-[22px] bg-card px-4 pb-2.5 pt-2 ${
                  side
                    ? 'max-w-[var(--bubble-max,15rem)]'
                    : 'min-w-[7.5rem] max-w-[min(17.5rem,calc(100vw-2rem))]'
                }`}
              >
                <span className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/20" />
                <p
                  className={`whitespace-pre-line text-balance ${side ? 'text-left' : 'text-center'} text-[15px] font-semibold leading-[1.35] tracking-[-0.005em] text-foreground ${messageClassName}`}
                >
                  {displayMessage.split('\n').map((line, index) => {
                    const lineStart = typedSoFar;
                    typedSoFar += line.length + 1;
                    return (
                      <React.Fragment key={`${index}-${line}`}>
                        {index > 0 ? '\n' : null}
                        {renderSpeechLine(line, typing ? typedChars - lineStart : line.length)}
                      </React.Fragment>
                    );
                  })}
                </p>
              </div>
              <span className={side ? 'relative -mr-px block h-[30px] w-3' : 'contents'}>
                <svg
                  aria-hidden
                  width="30"
                  height="12"
                  viewBox="0 0 30 12"
                  className={
                    side
                      ? 'absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2 rotate-90 fill-card'
                      : '-mt-px block fill-card'
                  }
                >
                  <path d="M0 0C7.4 0 10.9 2.5 12.9 9.1c.8 2.5 3.4 2.5 4.2 0C19.1 2.5 22.6 0 30 0Z" />
                </svg>
              </span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function renderSpeechLine(line: string, budget: number) {
  let used = 0;
  return line.split(/(\*[^*\n]+\*)/).map((part, index) => {
    if (!part) return null;
    const action = part.length > 2 && part.startsWith('*') && part.endsWith('*');
    const text = action ? part.slice(1, -1) : part;
    const shown = Math.max(0, Math.min(text.length, budget - used - (action ? 1 : 0)));
    used += part.length;
    const body = (
      <>
        {text.slice(0, shown)}
        {shown < text.length ? <span className="opacity-0">{text.slice(shown)}</span> : null}
      </>
    );
    return action ? (
      <span key={index} className="font-bold text-primary">
        {body}
      </span>
    ) : (
      <React.Fragment key={index}>{body}</React.Fragment>
    );
  });
}
