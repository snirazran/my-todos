import { UserDoc } from '@/lib/types/UserDoc';

export const MAX_HUNGER_MS = 48 * 60 * 60 * 1000; // 48 hours (6 units * 8h)
export const TASK_HUNGER_REWARD_MS = 8 * 60 * 60 * 1000; // 8 hours (1 unit)
export const PENALTY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const FLIES_PER_PENALTY = 1;

export type HungerStatus = {
  hunger: number; // Current hunger (ms remaining)
  stolenFlies: number; // Total pending stolen flies
  maxHunger: number;
};

/**
 * Calculates current hunger state and penalties based on elapsed time.
 * Returns the computed state and a MongoDB update object if changes are needed.
 */
export function calculateHunger(user: UserDoc) {
  const now = Date.now();
  const wardrobe = user.wardrobe || { 
    equipped: {}, 
    inventory: {}, 
    flies: 0, 
    hunger: MAX_HUNGER_MS, 
    lastHungerUpdate: new Date(), 
    stolenFlies: 0 
  };

  // Initialize if missing or invalid, and clamp to current MAX_HUNGER
  let currentHunger = (typeof wardrobe.hunger === 'number' && !isNaN(wardrobe.hunger)) 
    ? Math.min(wardrobe.hunger, MAX_HUNGER_MS)
    : MAX_HUNGER_MS;
    
  let lastUpdate = now;
  if (wardrobe.lastHungerUpdate) {
     const t = new Date(wardrobe.lastHungerUpdate).getTime();
     if (!isNaN(t)) lastUpdate = t;
  }
  
  let accumulatedStolen = (typeof wardrobe.stolenFlies === 'number' && !isNaN(wardrobe.stolenFlies))
    ? wardrobe.stolenFlies 
    : 0;
    
  let currentFlies = (typeof wardrobe.flies === 'number' && !isNaN(wardrobe.flies))
    ? wardrobe.flies
    : 0;

  // Time elapsed since last check
  const elapsed = now - lastUpdate;
  
  // If no time passed (or negative due to clock skew), check if we clamped and need to save
  if (elapsed <= 0) {
    if (currentHunger !== wardrobe.hunger) {
       return {
         updates: { 
             'wardrobe.hunger': currentHunger,
             'wardrobe.lastHungerUpdate': new Date(now)
         },
         status: {
           hunger: currentHunger,
           stolenFlies: accumulatedStolen,
           maxHunger: MAX_HUNGER_MS
         }
       };
    }

    return {
      updates: {},
      status: {
        hunger: currentHunger,
        stolenFlies: accumulatedStolen,
        maxHunger: MAX_HUNGER_MS
      }
    };
  }

  // 1. Drain hunger
  // Simply subtract time passed. If it goes negative, that represents starvation debt.
  currentHunger -= elapsed;

  // 2. Check for penalties if negative
  let newStolen = 0;
  
  if (currentHunger < 0) {
      const deficit = Math.abs(currentHunger);
      const penalties = Math.floor(deficit / PENALTY_INTERVAL_MS);
      
      if (penalties > 0) {
          // Charge penalties
          newStolen = penalties * FLIES_PER_PENALTY;
          
          // We can only steal what they have? 
          // Logic: "The frog eats your flies". If you have 0, he can't eat.
          // But does the debt persist? 
          // "stay there. for every day that its at 0 the frog eat 1"
          // Let's assume we consume the time regardless of whether we successfully stole.
          // Otherwise, debt accumulates forever until they get a fly, then INSTANTLY lose it.
          // That feels fair: "I was starving for 3 days, I eat your next 3 flies".
          
          const actualStolen = Math.min(newStolen, currentFlies);
          
          currentFlies -= actualStolen;
          accumulatedStolen += actualStolen;
          
          // "Pay" the debt to reset the interval
          // We add back the time covered by the penalties so we don't double-charge
          currentHunger += (penalties * PENALTY_INTERVAL_MS);
      }
  }

  // Construct update object
  const updates: Record<string, any> = {};
  let hasChanges = false;

  if (currentHunger !== wardrobe.hunger) {
    updates['wardrobe.hunger'] = currentHunger;
    hasChanges = true;
  }
  
  if (currentFlies !== wardrobe.flies) {
    updates['wardrobe.flies'] = currentFlies;
    hasChanges = true;
  }
  
  if (accumulatedStolen !== wardrobe.stolenFlies) {
    updates['wardrobe.stolenFlies'] = accumulatedStolen;
    hasChanges = true;
  }

  // Always update the timestamp to Now if we processed time
  if (elapsed > 0) {
    updates['wardrobe.lastHungerUpdate'] = new Date(now);
    hasChanges = true;
  }

  return {
    updates: hasChanges ? updates : {},
    status: {
      hunger: currentHunger,
      stolenFlies: accumulatedStolen,
      maxHunger: MAX_HUNGER_MS
    }
  };
}
