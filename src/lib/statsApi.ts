import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

const MIN_KEY_LENGTH = 32;

let cachedKeys: Buffer[] | null = null;

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}

function configuredKeys() {
  if (cachedKeys) return cachedKeys;
  const raw = (process.env.STATS_API_KEYS ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  const weak = raw.filter((key) => key.length < MIN_KEY_LENGTH).length;
  if (weak) {
    console.error(
      `STATS_API_KEYS: ignoring ${weak} key(s) shorter than ${MIN_KEY_LENGTH} characters`,
    );
  }
  cachedKeys = raw.filter((key) => key.length >= MIN_KEY_LENGTH).map(digest);
  return cachedKeys;
}

export function statsApiEnabled() {
  return configuredKeys().length > 0;
}

export function verifyStatsApiKey(authorization: string | null) {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? '');
  if (!match) return false;
  const presented = digest(match[1]);
  let valid = false;
  configuredKeys().forEach((key) => {
    if (timingSafeEqual(presented, key)) valid = true;
  });
  return valid;
}

export function clientIp(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

const MAX_TRACKED = 5000;

export type RateLimitState = { limited: boolean; retryAfterSeconds: number };

export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  const state = (key: string, now: number): RateLimitState => {
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) return { limited: false, retryAfterSeconds: 0 };
    return {
      limited: entry.count >= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  };

  return {
    check: (key: string) => state(key, Date.now()),
    hit: (key: string): RateLimitState => {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        if (hits.size > MAX_TRACKED) {
          hits.forEach((value, tracked) => {
            if (value.resetAt <= now) hits.delete(tracked);
          });
        }
        hits.set(key, { count: 1, resetAt: now + windowMs });
      } else {
        entry.count += 1;
      }
      const after = hits.get(key)!;
      return {
        limited: after.count > limit,
        retryAfterSeconds: Math.max(1, Math.ceil((after.resetAt - now) / 1000)),
      };
    },
  };
}
