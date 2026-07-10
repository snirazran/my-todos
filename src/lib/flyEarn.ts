let earnWindowUntil = 0;

export function markFlyEarn(windowMs = 8000) {
  earnWindowUntil = Math.max(earnWindowUntil, Date.now() + windowMs);
}

export function isFlyEarnActive() {
  return Date.now() < earnWindowUntil;
}
