'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { META_PIXEL_ID, TIKTOK_PIXEL_ID } from '@/lib/adpixels/config';
import { adPixelsConsented, subscribeAdConsent } from '@/lib/adpixels/consent';

const META_SNIPPET = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');`;

const TIKTOK_SNIPPET = `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var s=d.createElement("script");s.type="text/javascript",s.async=!0,s.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(s,a)};ttq.load('${TIKTOK_PIXEL_ID}');}(window,document,'ttq');`;

export function AdPixels() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const sync = () => setActive(adPixelsConsented());
    sync();
    return subscribeAdConsent(sync);
  }, []);

  if (!active) return null;

  return (
    <>
      {META_PIXEL_ID ? (
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: META_SNIPPET }}
        />
      ) : null}
      {TIKTOK_PIXEL_ID ? (
        <Script
          id="tiktok-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: TIKTOK_SNIPPET }}
        />
      ) : null}
    </>
  );
}
