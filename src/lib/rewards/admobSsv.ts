import crypto from 'crypto';
import connectMongo from '@/lib/mongoose';
import AdRewardVerificationModel from '@/lib/models/AdRewardVerification';

const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const KEYS_TTL_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_TTL_MS = 15 * 60 * 1000;
const ENFORCED_WAIT_MS = 8000;
const POLL_MS = 500;
const SHADOW_DELAY_MS = 20_000;

let keyCache: { at: number; keys: Map<string, string> } | null = null;

export function adSsvEnforced() {
  return process.env.ADMOB_SSV_ENFORCE === 'true';
}

async function loadKeys(force = false): Promise<Map<string, string>> {
  if (!force && keyCache && Date.now() - keyCache.at < KEYS_TTL_MS) {
    return keyCache.keys;
  }
  const res = await fetch(KEYS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`AdMob verifier keys fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys?: { keyId: number; pem: string }[] };
  const keys = new Map<string, string>();
  for (const key of data.keys ?? []) keys.set(String(key.keyId), key.pem);
  keyCache = { at: Date.now(), keys };
  return keys;
}

export async function verifyAdmobCallback(
  rawQuery: string,
): Promise<URLSearchParams | null> {
  const sigIndex = rawQuery.indexOf('&signature=');
  if (sigIndex < 0) return null;
  const content = rawQuery.slice(0, sigIndex);
  const params = new URLSearchParams(rawQuery);
  const signature = params.get('signature');
  const keyId = params.get('key_id');
  if (!signature || !keyId) return null;

  let pem = (await loadKeys()).get(keyId);
  if (!pem) pem = (await loadKeys(true)).get(keyId);
  if (!pem) return null;

  const valid = crypto.verify(
    'sha256',
    Buffer.from(content, 'utf8'),
    { key: pem, dsaEncoding: 'der' },
    Buffer.from(signature, 'base64url'),
  );
  return valid ? params : null;
}

async function claimVerification(userId: string) {
  return AdRewardVerificationModel.findOneAndUpdate(
    {
      userId,
      consumedAt: null,
      verifiedAt: { $gte: new Date(Date.now() - VERIFICATION_TTL_MS) },
    },
    { $set: { consumedAt: new Date() } },
    { sort: { verifiedAt: 1 } },
  ).lean();
}

export async function consumeAdVerification(
  userId: string,
  placement: string,
): Promise<boolean> {
  await connectMongo();

  if (!adSsvEnforced()) {
    setTimeout(() => {
      claimVerification(userId)
        .then((doc) => {
          if (!doc) {
            console.warn('[admob-ssv] no verification for rewarded view', {
              userId,
              placement,
            });
          }
        })
        .catch((err) => console.error('[admob-ssv] shadow check failed', err));
    }, SHADOW_DELAY_MS);
    return true;
  }

  const deadline = Date.now() + ENFORCED_WAIT_MS;
  for (;;) {
    if (await claimVerification(userId)) return true;
    if (Date.now() >= deadline) {
      console.warn('[admob-ssv] rejected unverified rewarded view', {
        userId,
        placement,
      });
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
