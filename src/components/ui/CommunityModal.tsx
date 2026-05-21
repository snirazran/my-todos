'use client';

import React, { useEffect, useState } from 'react';
import { ChevronRight, Facebook, Instagram, Music2, Smartphone } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

type CommunityLink = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
};

const FACEBOOK_URL = 'https://www.facebook.com/';
const INSTAGRAM_URL = 'https://www.instagram.com/';
const TIKTOK_URL = 'https://www.tiktok.com/';
const APP_STORE_URL = 'https://apps.apple.com/';
const PLAY_STORE_URL = 'https://play.google.com/store';

export function CommunityPanel() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const platform = mounted ? Capacitor.getPlatform() : 'web';
  const isIOS = platform === 'ios';
  const isAndroid = platform === 'android';
  const isMobileNative = isIOS || isAndroid;

  const links: CommunityLink[] = [
    {
      key: 'facebook',
      label: 'Join Facebook Group',
      href: FACEBOOK_URL,
      icon: <Facebook className="h-5 w-5 text-[#1877f2]" fill="currentColor" />,
    },
    {
      key: 'instagram',
      label: 'Follow on Instagram',
      href: INSTAGRAM_URL,
      icon: <Instagram className="h-5 w-5 text-[#e1306c]" />,
    },
    {
      key: 'tiktok',
      label: 'Follow on TikTok',
      href: TIKTOK_URL,
      icon: <Music2 className="h-5 w-5 text-foreground" />,
    },
  ];

  const storeLink: CommunityLink | null = isIOS
    ? {
        key: 'appstore',
        label: 'Rate FrogTask on App Store',
        href: APP_STORE_URL,
        icon: <Smartphone className="h-5 w-5 text-amber-500" />,
      }
    : isAndroid
      ? {
          key: 'playstore',
          label: 'Rate FrogTask on Play Store',
          href: PLAY_STORE_URL,
          icon: <Smartphone className="h-5 w-5 text-emerald-500" />,
        }
      : null;

  const openLink = (href: string) => {
    if (typeof window === 'undefined') return;
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  if (!mounted) return null;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden divide-y divide-border/50 rounded-2xl border border-border/50 bg-card">
        {links.map((link) => (
          <button
            key={link.key}
            type="button"
            onClick={() => openLink(link.href)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/50"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/40">
              {link.icon}
            </div>
            <span className="flex-1 truncate text-sm font-bold">{link.label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      {storeLink && (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
          <button
            type="button"
            onClick={() => openLink(storeLink.href)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/50"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/40">
              {storeLink.icon}
            </div>
            <span className="flex-1 truncate text-sm font-bold">{storeLink.label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      )}
    </div>
  );
}
