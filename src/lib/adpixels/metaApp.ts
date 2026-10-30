'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { adPixelsConsented } from '@/lib/adpixels/consent';

type FrogMetaPlugin = {
  activate(): Promise<{ active?: boolean }>;
  logEvent(options: {
    name: string;
    params?: Record<string, string | number>;
  }): Promise<{ logged?: boolean }>;
  getAnonymousId(): Promise<{ id?: string }>;
};

const FrogMeta = registerPlugin<FrogMetaPlugin>('FrogMeta');

function enabled() {
  return Capacitor.getPlatform() === 'ios' && adPixelsConsented();
}

export function activateMetaApp() {
  if (!enabled()) return;
  FrogMeta.activate().catch(() => {});
}

export function logMetaAppEvent(
  name: string,
  params?: Record<string, string | number>,
) {
  if (!enabled()) return;
  FrogMeta.logEvent({ name, params }).catch(() => {});
}

export async function metaAnonymousId(): Promise<string | undefined> {
  if (!enabled()) return undefined;
  try {
    const { id } = await FrogMeta.getAnonymousId();
    return id || undefined;
  } catch {
    return undefined;
  }
}
