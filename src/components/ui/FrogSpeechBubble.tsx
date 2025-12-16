'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProgressLogic } from '@/hooks/useProgressLogic';

interface FrogSpeechBubbleProps {
  rate: number;
  done: number;
  total: number;
  giftsClaimed: number;
}

const MESSAGES = {
  start: [
    'Ribbit! Ready to hop into action?',
    "A fresh day! Let's catch some tasks.",
    'Hungry for success... and flies!',
    "Your lily pad is looking empty. Let's fill it!",
    "I'm starving! Feed me tasks!",
  ],
  early: [
    'Good start! Keep hopping!',
    'One down! *Gulp*',
    'Warming up those frog legs!',
    'Slow and steady wins the... fly?',
    'Delicious! More please!',
  ],
  mid: [
    "Halfway there! You're un-frog-gettable!",
    'Hop, hop, hooray! Keep it up!',
    "You're on a roll! (Or a leap?)",
    'Look at you go!',
    'My belly is getting full!',
  ],
  near_finish: [
    "Almost there! Don't croak now!",
    'So close I can taste the victory!',
    'One last giant leap!',
    'Finish strong!',
    'Just a few more bites!',
  ],
  done: [
    'All done! Time to chill on the lily pad.',
    'You are the task master! Ribbit!',
    'Fly feast complete! Great job.',
    'Nothing left but to relax. You earned it!',
    "I'm stuffed! Zzz...",
  ],
  gift_ready: [
    'Ooooh! A shiny gift! Open it!',
    'Present for me? No, for you!',
    "It's gift time! *Happy croak*",
    "Don't leave that gift waiting!",
    'Shiny! Want! Now!',
  ],
  locked_gift: (tasksNeeded: number) => [
    `Just ${tasksNeeded} more ${
      tasksNeeded === 1 ? 'hop' : 'hops'
    } to a treat!`,
    `Eye on the prize! ${tasksNeeded} left.`,
    `Gifts await... ${tasksNeeded} tasks to go!`,
    `I smell a gift in ${tasksNeeded} tasks...`,
  ],
};

export function FrogSpeechBubble({ rate, done, total, giftsClaimed, isCatching }: FrogSpeechBubbleProps & { isCatching?: boolean }) {
  const slots = useProgressLogic(done, total, giftsClaimed);
  const [message, setMessage] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const prevDoneRef = useRef(done);
  const prevGiftsRef = useRef(giftsClaimed);
  const prevCatchingRef = useRef(!!isCatching);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  const getMessage = (currentDone: number) => {
    // 1. Gift Ready?
    const readySlot = slots.find((s) => s.status === 'READY');
    if (readySlot) return getRandom(MESSAGES.gift_ready);

    // 2. Next Gift Locked/Pending?
    const nextSlot = slots.find((s) => s.status === 'PENDING' || s.status === 'LOCKED');
    if (nextSlot) {
       let tasksNeeded = 0;
       if (nextSlot.status === 'PENDING') {
         tasksNeeded = (nextSlot.target as number) - currentDone;
       } else {
         // @ts-ignore
         tasksNeeded = (nextSlot.neededToUnlock as number);
       }
       
       if (tasksNeeded > 0 && tasksNeeded <= 2) {
          const templates = MESSAGES.locked_gift(tasksNeeded);
          return templates[Math.floor(Math.random() * templates.length)];
       }
    }

    // 3. General Progress
    // Recalculate rate based on currentDone
    const currentRate = total > 0 ? (currentDone / total) * 100 : 0;
    
    if (total === 0) return getRandom(MESSAGES.start);
    if (currentDone === total && total > 0) return getRandom(MESSAGES.done);
    if (currentRate < 30) return getRandom(MESSAGES.early);
    if (currentRate < 80) return getRandom(MESSAGES.mid);
    return getRandom(MESSAGES.near_finish);
  };

  useEffect(() => {
    // Trigger if:
    // 1. done count INCREASED
    // 2. gifts claimed changed
    // 3. isCatching switched to true (start of animation)
    
    const doneIncreased = done > prevDoneRef.current;
    const giftsChanged = giftsClaimed !== prevGiftsRef.current;
    const catchingStarted = !!isCatching && !prevCatchingRef.current;
    
    // Also show on initial load if there are tasks and we haven't shown a message yet
    const isInitial = prevDoneRef.current === done && prevGiftsRef.current === giftsClaimed && total > 0 && !message;

    if (doneIncreased || giftsChanged || isInitial || catchingStarted) {
      // If we are catching, anticipate the next done count
      const effectiveDone = catchingStarted ? done + 1 : done;
      const newMessage = getMessage(effectiveDone);
      
      setMessage(newMessage);
      setIsVisible(true);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 5000); // Show for 5 seconds
    } else if (done < prevDoneRef.current) {
        // Explicitly hide on undo
        setIsVisible(false);
    }
    
    prevDoneRef.current = done;
    prevGiftsRef.current = giftsClaimed;
    prevCatchingRef.current = !!isCatching;
  }, [done, total, giftsClaimed, rate, slots, message, isCatching]);

  return (
    <AnimatePresence>
      {isVisible && message && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 5, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="absolute -top-4 left-[0%] -translate-x-1/2 z-50 w-64 pointer-events-none"
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
