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

      // Logic Updated:
      // i=0 (Gift 1): Always available (if total >= 1).
      //    - 1-3 tasks: Target is LAST task (total).
      //    - 4-5 tasks: Target is 2.
      //    - 6+ tasks: Target is ~33% (round(total/3)).
      // i=1 (Gift 2): Unlocked if total >= 4.
      //    - 4-5 tasks: Target is LAST task (total).
      //    - 6+ tasks: Target is ~66% (round(total*0.66)).
      // i=2 (Gift 3): Unlocked if total >= 6.
      //    - 6+ tasks: Target is LAST task (total).

      const minTasksForSlot = [1, 4, 6];

      if (total < minTasksForSlot[i]) {
        isLocked = true;
        neededToUnlock = minTasksForSlot[i] - total;
        // Project hypothetical targets for locked slots
        if (i === 1) targetForSlot = 4;
        else if (i === 2) targetForSlot = 6;
        else targetForSlot = 1;
      } else {
        isLocked = false;
        neededToUnlock = 0;

        // Calculate targets for unlocked slots
        if (total < 4) {
          // Case 1-3 tasks: Only Gift 1 unlocked, at the end
          targetForSlot = total;
        } else if (total < 6) {
          // Case 4-5 tasks: Gifts at 2 and End
          if (i === 0) targetForSlot = 2;
          else targetForSlot = total; // i=1
        } else {
          // Case 6+ tasks: Spread out
          if (i === 0) targetForSlot = Math.round(total / 3);
          else if (i === 1) targetForSlot = Math.round((total * 2) / 3);
          else targetForSlot = total;
        }
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
