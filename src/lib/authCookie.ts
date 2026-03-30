'use client';

function buildAuthCookie(value: string, maxAge: number) {
  const parts = [`token=${value}`, 'path=/', `max-age=${maxAge}`, 'SameSite=Lax'];

  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export function setAuthTokenCookie(token: string) {
  document.cookie = buildAuthCookie(token, 604800);
}

export function clearAuthTokenCookie() {
  document.cookie = buildAuthCookie('', 0);
}
