'use client';

import React from 'react';
import useSWR from 'swr';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthContext';
import { bootstrapFetcher } from '@/lib/bootstrapFetcher';

export function PremiumBadge({ className }: { className?: string }) {
  const { user } = useAuth();
  const isAccount = !!user && !user.isAnonymous;
  const { data } = useSWR<{ isPremium?: boolean }>(
    isAccount ? '/api/user' : null,
    bootstrapFetcher,
    { revalidateOnFocus: false },
  );
  if (!data?.isPremium) return null;

  return (
    <div
      aria-label="Frogress Plus member"
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/50 bg-card/80 shadow-sm backdrop-blur-xl',
        className,
      )}
    >
      <Icon name="frogPlus" label="Frogress Plus" className="h-7 w-7" />
    </div>
  );
}
