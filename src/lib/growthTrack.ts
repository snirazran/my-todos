// Fires funnel/banner events into whatever analytics are present (Meta pixel
// via fbq, GA via gtag). Safe no-op until those scripts are installed.
export function trackGrowthEvent(
  name: string,
  params?: Record<string, unknown>,
) {
  if (typeof window === 'undefined') return;
  try {
    (window as any).fbq?.('trackCustom', name, params);
    (window as any).gtag?.('event', name, params);
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[growth]', name, params ?? {});
    }
  } catch {}
}
