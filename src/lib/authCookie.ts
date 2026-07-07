'use client';

import type { User } from 'firebase/auth';

const REFRESH_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

export async function establishSessionCookie(user: User) {
  const idToken = await user.getIdToken();
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    throw new Error('Failed to establish session');
  }
}

export async function clearSessionCookie() {
  try {
    await fetch('/api/auth/session', { method: 'DELETE' });
  } catch {}
}

export function sessionCookieNeedsRefresh() {
  const match = document.cookie.match(/(?:^|;\s*)session_exp=([^;]+)/);
  if (!match) return true;
  const expiresAt = Number(match[1]);
  return (
    !Number.isFinite(expiresAt) || expiresAt - Date.now() < REFRESH_THRESHOLD_MS
  );
}
