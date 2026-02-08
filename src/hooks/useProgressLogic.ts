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
    // Fixed milestone targets: 2, 4, and 6 completed tasks
    const fixedTargets = [2, 4, 6];
    
    return [0, 1, 2].map((i) => {
      const targetForSlot = fixedTargets[i];
      const minTasksForSlot = fixedTargets[i];
      
      // A slot is locked if we don't have enough total tasks to reach it
      const isLocked = total < minTasksForSlot;
      const neededToUnlock = isLocked ? minTasksForSlot - total : 0;

      // Progress percentage based on done vs target
      const percentage = targetForSlot > 0 ? Math.min(100, (done / targetForSlot) * 100) : 0;

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
