// Fires funnel/banner events into whatever analytics are present (Meta pixel
// via fbq, GA via gtag). Safe no-op until those scripts are installed.
import { trackAnalyticsEvent } from '@/lib/analytics/client';
import type { AnalyticsEventName } from '@/lib/analytics/events';

const FIRST_PARTY_GROWTH_EVENTS: Record<string, AnalyticsEventName> = {
  funnel_view: 'try_funnel_viewed',
  funnel_task_completed: 'try_task_completed',
  funnel_box_opened: 'try_gift_opened',
  funnel_signin_started: 'try_signin_started',
  funnel_signup: 'try_signup_completed',
  funnel_gift_claimed: 'try_gift_claimed',
  funnel_try_on: 'try_cosmetic_previewed',
  funnel_continue_web: 'try_continued',
  funnel_store_click: 'try_store_clicked',
};

export function trackGrowthEvent(
  name: string,
  params?: Record<string, unknown>,
) {
  if (typeof window === 'undefined') return;
  try {
    const firstPartyName = FIRST_PARTY_GROWTH_EVENTS[name];
    if (firstPartyName) {
      trackAnalyticsEvent(firstPartyName, {
        ...params,
        is_new_user: params?.isNewUser,
      });
    }
    (window as any).fbq?.('trackCustom', name, params);
    (window as any).gtag?.('event', name, params);
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[growth]', name, params ?? {});
    }
  } catch {}
}
