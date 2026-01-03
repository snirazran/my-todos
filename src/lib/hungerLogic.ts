import { UserDoc } from '@/lib/types/UserDoc';

export const MAX_HUNGER_MS = 24 * 60 * 60 * 1000; // 24 hours
export const TASK_HUNGER_REWARD_MS = 4 * 60 * 60 * 1000; // 4 hours
export const PENALTY_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
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

  // Initialize if missing or invalid
  let currentHunger = (typeof wardrobe.hunger === 'number' && !isNaN(wardrobe.hunger)) 
    ? wardrobe.hunger 
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
  
  // If no time passed (or negative due to clock skew), return current state
  if (elapsed <= 0) {
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
  // If we have hunger remaining, drain it first.
  let timeInStarvation = 0;

  if (currentHunger > 0) {
    if (elapsed >= currentHunger) {
      // Drained completely
      timeInStarvation = elapsed - currentHunger;
      currentHunger = 0;
    } else {
      // Partially drained
      currentHunger -= elapsed;
      timeInStarvation = 0;
    }
  } else {
    // Already empty, all elapsed time is starvation
    timeInStarvation = elapsed;
  }

  // 2. Calculate penalties for starvation time
  // "when its empty for each 24/6 its empty..."
  // This implies discrete intervals. 
  // However, we need to track "partial" intervals to avoid cheating by frequent refreshing.
  // The simplest robust way is to treat hunger as potentially negative during calculation,
  // where negative values represent "time spent starving".
  
  // Actually, keeping `currentHunger` at 0 and using `lastHungerUpdate` is sufficient 
  // IF we adjust `lastHungerUpdate` correctly.
  
  let newStolen = 0;
  
  if (timeInStarvation > 0) {
    // How many full penalty intervals occurred?
    const penalties = Math.floor(timeInStarvation / PENALTY_INTERVAL_MS);
    
    if (penalties > 0) {
      newStolen = penalties * FLIES_PER_PENALTY;
      
      // Cap stolen flies at current balance? 
      // "the frog starts to eat up your balance... 1 fly at a time"
      // Usually you can't eat what doesn't exist.
      const actualStolen = Math.min(newStolen, currentFlies);
      
      currentFlies -= actualStolen;
      accumulatedStolen += actualStolen; // We track attempts even if balance was 0? Or just actual?
      // Let's track actual stolen for the message "I ate your flies".
      
      // IMPORTANT: We need to carry over the remainder of the time so the next interval counts correctly.
      // The "effective" update time becomes Now - Remainder.
      // remainder = timeInStarvation % PENALTY_INTERVAL_MS
      // so lastHungerUpdate should be set to (Now - remainder).
    }
  }

  // Calculate the "effective" update time to persist.
  // If we applied penalties, we advance time by the *penalized* amount.
  // Effectively: newLastUpdate = oldLastUpdate + (elapsed - remainder)
  // Wait, simpler: 
  // lastHungerUpdate should be NOW. But if we are in starvation mode, 
  // we want to preserve the "progress" towards the next penalty.
  //
  // Alternative Model: `hunger` goes negative.
  // +100ms -> Positive hunger.
  // -100ms -> Starving for 100ms.
  // Penalty triggers at -4h, -8h, etc.
  // Let's stick to the 0 clamp + explicit logic because we store it as 0 in DB usually.
  
  // Let's refine the Update Time logic.
  let nextLastHungerUpdate = now;

  if (currentHunger === 0 && timeInStarvation > 0) {
    // We are starving.
    const penalties = Math.floor(timeInStarvation / PENALTY_INTERVAL_MS);
    const remainder = timeInStarvation % PENALTY_INTERVAL_MS;
    
    // If we didn't trigger a penalty yet, we just update the timestamp to Now, 
    // but we MUST ensure the system knows we are "x ms into starvation".
    // Since we don't store "starvationTime", we have a problem.
    // If we just update `lastHungerUpdate` to Now, we lose the accumulated starvation time.
    
    // SOLUTION: Store `hunger` as negative value?
    // UserDoc type says `hunger` is number.
    // If we allow negative:
    // Max: 24h. Empty: 0. Starving: -X.
    // Penalty triggers when crossing -4h threshold.
    
    // Let's use the negative hunger model internally here? 
    // Or just adopt it for the DB. It's much cleaner.
    // "hunger" becomes "satiety time relative to now-ish".
    
    // Let's re-eval with Negative Hunger Model.
    // user.wardrobe.hunger can be negative.
    // 
    // 1. Recover `trueHunger`. 
    //    If DB has `hunger > 0`, it's simple.
    //    If DB has `hunger <= 0`, it represents deficit.
    //
    //    Wait, `elapsed` is always positive (time passed).
    //    `newHunger` = `oldHunger` - `elapsed`.
    //
    //    Example: 
    //    Hunger = 1h. Elapsed = 5h.
    //    NewHunger = -4h. 
    //    This means we crossed 0 (1h ago) and reached -4h (one full penalty interval).
    //    
    //    Penalty Calc:
    //    Thresholds are at -4h, -8h, -12h...
    //    We need to know how many thresholds were crossed in this update?
    //    No, simpler: `fliesToEat` = `floor(abs(newHunger) / 4h)`.
    //    
    //    BUT we have to handle the "already eaten" part.
    //    If we just store -4h, next time we load (elapsed 1h), we are at -5h.
    //    Total eaten should be floor(5/4) = 1.
    //    But we already ate 1 at -4h? 
    //    
    //    So we need to "consume" the negative hunger when we eat a fly?
    //    "The frog starts to eat... 1 fly at a time".
    //    If we deduct a fly, do we "reset" the hunger timer? "when its empty for each 24/6 its empty".
    //    This usually implies a repeating interval.
    //    
    //    Interpretation A: Continuous debt.
    //    Hunger = -4h -> Eat 1 fly. Hunger becomes 0? No, that would mean he's full?
    //    Hunger becomes 0 (relative to the penalty cycle).
    //    So yes, if we eat a fly, we effectively "paid" for that 4h of starvation.
    //    So `hunger` goes back to `hunger + 4h`.
    //    
    //    Example:
    //    Start: Hunger 1h.
    //    Wait 6h.
    //    Hunger = 1 - 6 = -5h.
    //    Debt = 5h.
    //    Penalties = floor(5h / 4h) = 1 fly.
    //    Remainder debt = 1h.
    //    New Hunger = -1h.
    //    Stolen += 1.
    //    
    //    This works perfectly.
    
    let simulatedHunger = (typeof wardrobe.hunger === 'number' ? wardrobe.hunger : MAX_HUNGER_MS) - elapsed;
    
    if (simulatedHunger < 0) {
      const deficit = Math.abs(simulatedHunger);
      const penalties = Math.floor(deficit / PENALTY_INTERVAL_MS);
      
      if (penalties > 0) {
        // Calculate flies to steal
        const theftAmount = penalties * FLIES_PER_PENALTY;
        // Check balance
        const actualTheft = Math.min(theftAmount, currentFlies);
        
        currentFlies -= actualTheft;
        accumulatedStolen += actualTheft;
        
        // "Pay" the debt to reset the interval
        // We add back the time covered by the penalties
        simulatedHunger += (penalties * PENALTY_INTERVAL_MS);
      }
    }
    
    currentHunger = simulatedHunger;
  } else {
    // Normal drain, no starvation yet
    currentHunger -= elapsed;
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
