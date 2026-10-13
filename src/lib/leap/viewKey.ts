export function leapViewKey(timezone?: string) {
  const tz =
    timezone ??
    (typeof window === 'undefined'
      ? 'UTC'
      : Intl.DateTimeFormat().resolvedOptions().timeZone);
  return `/api/leap?timezone=${encodeURIComponent(tz)}`;
}
