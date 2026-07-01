'use client';

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';

const APP_HOSTS = ['frogress.com', 'www.frogress.com'];

function applyDeepLink(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (!APP_HOSTS.includes(url.hostname)) return;

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
