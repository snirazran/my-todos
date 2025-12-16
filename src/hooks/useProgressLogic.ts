import { useMemo } from 'react';

export interface ProgressSlot {
  status: 'CLAIMED' | 'READY' | 'LOCKED' | 'PENDING';
  target: number;
  percent: number;
  neededToUnlock: number;
  tasksLeft: number;
}

export function useProgressLogic(done: number, total: number, giftsClaimed: number) {
  const slots = useMemo(() => {
    return [0, 1, 2].map((i) => {
      // Determine the Requirement for this specific slot index
      let targetForSlot = 0;
      let isLocked = false;
      let neededToUnlock = 0;

      // Logic:
      // i=0 (Gift 1): Unlocked if total >= 1. Target is roughly 33% of total.
      // i=1 (Gift 2): Unlocked if total >= 3. Target is roughly 66% of total.
      // i=2 (Gift 3): Unlocked if total >= 6. Target is 100% of total.

      if (i === 0) {
        targetForSlot = Math.max(1, Math.round(total / 3));
        isLocked = total === 0;
        neededToUnlock = 1 - total;
      } else if (i === 1) {
        isLocked = total < 3;
        neededToUnlock = 3 - total;
        // If locked, we project target as if user had minimum 3 tasks (so target=2 or 3)
        // If unlocked, we use real calculation
        targetForSlot = isLocked ? 3 : Math.round(total * 0.66);
      } else if (i === 2) {
        isLocked = total < 6;
        neededToUnlock = 6 - total;
        targetForSlot = isLocked ? 6 : total;
      }

      // CUMULATIVE PROGRESS LOGIC
      // Percent is based on Total Done vs This Specific Target
      const percentage =
        targetForSlot > 0 ? Math.min(100, (done / targetForSlot) * 100) : 0;

      const isClaimed = i < giftsClaimed;
      const isReady = !isClaimed && !isLocked && done >= targetForSlot;

      return {
        status: isClaimed
          ? 'CLAIMED'
          : isReady
          ? 'READY'
          : isLocked
          ? 'LOCKED'
          : 'PENDING',
        target: targetForSlot,
        percent: percentage,
        neededToUnlock: Math.max(0, neededToUnlock),
        tasksLeft: Math.max(0, targetForSlot - done),
      } as ProgressSlot;
    });
  }, [total, done, giftsClaimed]);

  return slots;
}
