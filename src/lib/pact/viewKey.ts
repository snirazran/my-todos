export function pactViewKey(timezone?: string) {
  const tz =
    timezone ??
    (typeof window === 'undefined'
      ? 'UTC'
      : Intl.DateTimeFormat().resolvedOptions().timeZone);
  return `/api/pact?timezone=${encodeURIComponent(tz)}`;
}
