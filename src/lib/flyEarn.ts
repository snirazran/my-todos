let earnWindowUntil = 0;

export function markFlyEarn(windowMs = 8000) {
  earnWindowUntil = Math.max(earnWindowUntil, Date.now() + windowMs);
}

export function isFlyEarnActive() {
  return Date.now() < earnWindowUntil;
}

let flownFlies = 0;
let flownUntil = 0;

export function markFliesFlown(amount: number, windowMs = 8000) {
  if (Date.now() >= flownUntil) flownFlies = 0;
  flownFlies += amount;
  flownUntil = Date.now() + windowMs;
}

export function takeFlownFlies(gain: number) {
  if (Date.now() >= flownUntil) flownFlies = 0;
  const taken = Math.min(Math.max(0, gain), flownFlies);
  flownFlies -= taken;
  return taken;
}
