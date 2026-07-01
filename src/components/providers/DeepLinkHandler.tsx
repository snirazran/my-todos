'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';

const APP_HOSTS = ['frogress.com', 'www.frogress.com'];
const REFERRAL_STORAGE_KEY = 'frogress_referral_code';
const FRIEND_STORAGE_KEY = 'frogress_friend_code';

function persistInviteParams(url: URL) {
  try {
    const ref = url.searchParams.get('ref')?.trim();
    if (ref) localStorage.setItem(REFERRAL_STORAGE_KEY, ref);
    const friend = url.searchParams.get('friend')?.trim();
    if (friend) localStorage.setItem(FRIEND_STORAGE_KEY, friend);
  } catch {
    /* ignore */
  }
}

function applyDeepLink(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (!APP_HOSTS.includes(url.hostname)) return;

    persistInviteParams(url);

    const target = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (target === current) return;
    if (!url.search && !url.hash && url.pathname === window.location.pathname) return;

    window.location.href = `${window.location.origin}${target}`;
  } catch {
    /* ignore malformed URLs */
  }
}

export function DeepLinkHandler() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let handle: PluginListenerHandle | undefined;

    void App.getLaunchUrl().then((res) => {
      if (res?.url) applyDeepLink(res.url);
    });

    void App.addListener('appUrlOpen', (event) => {
      applyDeepLink(event.url);
    }).then((h) => {
      handle = h;
    });

    return () => {
      void handle?.remove();
    };
  }, []);

  return null;
}
