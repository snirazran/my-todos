'use client';

import useSWR from 'swr';

export type IntroKey = 'bellyFull' | 'frogodoro' | 'savedTask';

type IntrosResponse = { seenIntros?: Partial<Record<IntroKey, boolean>> };

const INTROS_KEY = '/api/user/intros';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Request failed');
  return res.json() as Promise<IntrosResponse>;
};

// One-time explainer flags, persisted server-side so they never repeat across
// devices. `seenIntros` is undefined until loaded — callers must treat that
// as "don't show yet", not "not seen".
export function useIntros(enabled: boolean) {
  const { data, mutate } = useSWR<IntrosResponse>(
    enabled ? INTROS_KEY : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const markIntroSeen = (intro: IntroKey) => {
    void mutate(
      (current) => ({
        seenIntros: { ...(current?.seenIntros ?? {}), [intro]: true },
      }),
      { revalidate: false },
    );
    void fetch(INTROS_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intro }),
    }).catch(() => {});
  };

  return { seenIntros: data?.seenIntros, markIntroSeen };
}
