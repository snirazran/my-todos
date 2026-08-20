export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebaseAdmin';

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const MAX_TRACKED_CLIENTS = 5000;

const hits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string) {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || entry.resetAt <= now) {
    if (hits.size > MAX_TRACKED_CLIENTS) {
      hits.forEach((value, tracked) => {
        if (value.resetAt <= now) hits.delete(tracked);
      });
    }
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

function clientKey(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for');
  return (
    forwarded?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NO_ACCOUNT = { exists: false, providers: [] as string[] };

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  if (isRateLimited(clientKey(req))) {
    return json({ ...NO_ACCOUNT, unavailable: true }, 429);
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const email =
    typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return json(NO_ACCOUNT);
  }

  try {
    const record = await getAdminAuth().getUserByEmail(email);
    const providers = record.providerData
      .map((provider) => provider.providerId)
      .filter((id): id is string => !!id);
    return json({ exists: true, providers });
  } catch (error) {
    const code =
      error && typeof error === 'object'
        ? (error as { code?: unknown }).code
        : null;
    if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
      return json(NO_ACCOUNT);
    }
    console.error('Email lookup failed:', error);
    return json({ ...NO_ACCOUNT, unavailable: true });
  }
}
