'use client';

import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';
import { adOfferSurface, type AdOffers } from '@/lib/adOffers';

export function usePlusInsteadOfAd(placement: string): boolean {
  const { user } = useAuth();
  const surface = adOfferSurface(placement);
  const { data } = useSWR<{ adOffers?: Partial<AdOffers> }>(
    user && surface ? '/api/user' : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  return !!surface && data?.adOffers?.[surface] === 'plus';
}
