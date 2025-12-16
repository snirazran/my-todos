'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FrogMessageProps {
  rate: number;
  done: number;
  total: number;
  giftsClaimed: number;
  slots: any[]; // We'll pass the calculated slots to know upcoming goals
}

const MESSAGES = {
  start: [
    "Ribbit! Ready to hop into action?",
    "A fresh day! Let's catch some tasks.",
    "Hungry for success... and flies!",
    "Your lily pad is looking empty. Let's fill it!",
  ],
  early: [
    "Good start! Keep hopping!",
    "One down! *Gulp*",
    "Warming up those frog legs!",
    "Slow and steady wins the... fly?",
  ],
  mid: [
    "Halfway there! You're un-frog-gettable!",
    "Hop, hop, hooray! Keep it up!",
    "You're on a roll! (Or a leap?)",
    "Look at you go!",
  ],
  near_finish: [
    "Almost there! Don't croak now!",
    "So close I can taste the victory!",
    "One last giant leap!",
    "Finish strong!",
  ],
  done: [
    "All done! Time to chill on the lily pad.",
    "You are the task master! Ribbit!",
    "Fly feast complete! Great job.",
    "Nothing left but to relax. You earned it!",
  ],
  gift_ready: [
    "Ooooh! A shiny gift! Open it!",
    "Present for me? No, for you!",
    "It's gift time! *Happy croak*",
    "Don't leave that gift waiting!",
  ],
  locked_gift: (tasksNeeded: number) => [
    `Just ${tasksNeeded} more ${tasksNeeded === 1 ? 'hop' : 'hops'} to a treat!`,
    `Eye on the prize! ${tasksNeeded} left.`,
    `Gifts await... ${tasksNeeded} tasks to go!`,
  ]
};

export function FrogMessage({ rate, done, total, giftsClaimed, slots }: FrogMessageProps) {
  // Select a message category based on state
  const getMessage = () => {
    // 1. Gift Ready?
    const readySlot = slots.find((s: any) => s.status === 'READY');
    if (readySlot) return getRandom(MESSAGES.gift_ready);

    // 2. Next Gift Locked/Pending?
    const nextSlot = slots.find((s: any) => s.status === 'PENDING' || s.status === 'LOCKED');
    if (nextSlot) {
      // Prioritize "next gift" encouragement if it's close (e.g. 1-2 tasks away)
      let tasksNeeded = 0;
       if (nextSlot.status === 'PENDING') {
         tasksNeeded = (nextSlot.target as number) - done;
       } else {
         tasksNeeded = (nextSlot.req as number) - total;
       }
       
       if (tasksNeeded > 0 && tasksNeeded <= 2) {
          const templates = MESSAGES.locked_gift(tasksNeeded);
          return templates[Math.floor(Math.random() * templates.length)];
       }
    }

    // 3. General Progress
    if (total === 0) return getRandom(MESSAGES.start);
    if (done === total && total > 0) return getRandom(MESSAGES.done);
    if (rate < 30) return getRandom(MESSAGES.early);
    if (rate < 80) return getRandom(MESSAGES.mid);
    return getRandom(MESSAGES.near_finish);
  };

  const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  const [message, setMessage] = useState("");

  // Update message only when significant state changes to avoid jitter
  useEffect(() => {
    setMessage(getMessage());
  }, [done, total, giftsClaimed]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative mb-6">
      <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-none p-4 shadow-sm border border-slate-200 dark:border-slate-700 relative z-10">
        <p className="text-slate-700 dark:text-slate-200 font-medium text-base md:text-lg leading-snug">
          {message}
        </p>
      </div>
      {/* Speech Bubble Tail */}
      <svg 
        className="absolute -bottom-3 left-0 w-6 h-4 text-white dark:text-slate-800 z-10" 
        viewBox="0 0 24 16" 
        fill="currentColor"
      >
         <path d="M0 0 L24 0 L0 16 Z" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="1" />
         <path d="M2 0 L22 0 L2 14 Z" fill="currentColor" />
      </svg>
    </div>
  );
}
