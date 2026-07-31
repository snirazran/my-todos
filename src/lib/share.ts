'use client';

import { Capacitor } from '@capacitor/core';

export type ShareResult = 'shared' | 'copied' | 'dismissed' | 'failed';

export type SharePayload = {
  title?: string;
  text?: string;
  url: string;
  /** iOS action-sheet title. */
  dialogTitle?: string;
};

/**
 * Open the OS share sheet (WhatsApp, Messages, Mail…) for a link. Native uses
 * the Capacitor Share plugin; the web falls back to the Web Share API and, as a
 * last resort, the clipboard.
 */
export async function shareLink(payload: SharePayload): Promise<ShareResult> {
  const { title, text, url, dialogTitle } = payload;

  if (Capacitor.isNativePlatform()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({
        title,
        text,
        url,
        dialogTitle: dialogTitle ?? title,
      });
      return 'shared';
    } catch (err) {
      if (isDismissal(err)) return 'dismissed';
    }
  }

  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator) : null;
  if (nav?.share) {
    try {
      await nav.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (isDismissal(err)) return 'dismissed';
    }
  }

  try {
    await nav?.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

function isDismissal(err: unknown): boolean {
  const message = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /abort|cancel|dismiss/i.test(message);
}
