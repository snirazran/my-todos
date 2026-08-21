'use client';

/**
 * The widget's add bar opens `https://frogress.com/?quickadd=1`.
 *
 * Treating that as a destination caused an infinite reload: the deep link
 * handler navigated to it, the home page stripped the query param, and then the
 * launch URL — which Capacitor keeps returning after a reload — no longer
 * matched the address bar, so it navigated again.
 *
 * So it is handled as a command instead of a URL. Nothing here touches the
 * address bar. The flag survives a navigation (needed when the app was on some
 * other page and has to land on Today first); the event covers the case where
 * the home page is already mounted, so tapping Add twice in a row still works.
 */

export const QUICK_ADD_EVENT = 'frogress:quickadd';
const PENDING_KEY = 'frogress_quickadd_pending';

export function isQuickAddLink(url: URL): boolean {
  return url.searchParams.get('quickadd') === '1';
}

export function requestQuickAdd(): void {
  try {
    sessionStorage.setItem(PENDING_KEY, '1');
  } catch {
    /* ignore */
  }
  if (window.location.pathname !== '/') {
    // QuickAddSheet only lives on Today, so land there first; the flag rides
    // across the navigation.
    window.location.href = `${window.location.origin}/`;
    return;
  }
  window.dispatchEvent(new Event(QUICK_ADD_EVENT));
}

/** True once, if a quick-add is waiting. Clears the flag as it reads it. */
export function consumeQuickAdd(): boolean {
  try {
    if (sessionStorage.getItem(PENDING_KEY) !== '1') return false;
    sessionStorage.removeItem(PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearQuickAdd(): void {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
