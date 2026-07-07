'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { trackGrowthEvent } from '@/lib/growthTrack';

const EXEMPT_PREFIXES = [
  '/onboarding',
  '/welcome',
  '/login',
  '/register',
  '/auth',
  '/try',
  '/get-app',
  '/pricing',
  '/privacy',
  '/terms',
  '/refund-policy',
  '/admin',
];

export function OnboardingGate() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const exempt =
    !pathname || EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  const { data } = useSWR<{ onboardingCompleted?: boolean | null }>(
    !loading && user && !exempt ? '/api/user' : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );

  const needsOnboarding = !exempt && data?.onboardingCompleted === false;

  useEffect(() => {
    if (!needsOnboarding) return;
    trackGrowthEvent('onboarding_gate_redirect', { from: pathname });
    router.replace('/onboarding');
  }, [needsOnboarding, pathname, router]);

  return null;
}
