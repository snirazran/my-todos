'use client';

import { requestAppTracking } from '@/lib/adpixels/appTracking';
import { needsAdConsent, readAdConsent, setAdConsent } from '@/lib/adpixels/consent';
import { activateMetaApp, fetchMetaDeferredLink } from '@/lib/adpixels/metaApp';
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import { applyMetaLinkToFirstTouch } from './touch';

const LINK_WAIT_MS = 3000;

async function matchMetaAd() {
  const link = await fetchMetaDeferredLink();
  if (!link.supported) return 'unsupported';
  if (!link.url) return 'no_link';
  return applyMetaLinkToFirstTouch(link.url);
}

export async function askTrackingAndMatchAd() {
  const status = await requestAppTracking();
  if (status !== 'authorized') {
    trackAnalyticsEvent('tracking_permission_result', { status, outcome: 'skipped' });
    return;
  }
  if (needsAdConsent() && readAdConsent() === null) setAdConsent('granted');
  activateMetaApp();
  const matching = matchMetaAd().then((outcome) => {
    trackAnalyticsEvent('tracking_permission_result', { status, outcome });
  });
  await Promise.race([
    matching,
    new Promise<void>((resolve) => window.setTimeout(resolve, LINK_WAIT_MS)),
  ]);
}
