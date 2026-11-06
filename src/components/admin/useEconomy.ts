'use client';

import { useCallback } from 'react';
import type { FlyEconomyConfig } from '@/lib/economy/defaults';
import { useAdminConfig } from '@/components/admin/useAdminConfig';

export type LedgerSummary = {
  from: string;
  to: string;
  sources: { source: string; granted: number; spent: number; users: number }[];
};

export function useEconomy({ ledger = false }: { ledger?: boolean } = {}) {
  const handle = useAdminConfig<FlyEconomyConfig>({
    url: ledger ? '/api/admin/economy' : '/api/admin/economy?ledger=0',
    read: (payload) => payload?.economy,
    write: (economy) => ({ economy }),
  });

  const patchGroup = useCallback(
    <K extends keyof FlyEconomyConfig>(group: K, next: Partial<FlyEconomyConfig[K]>) =>
      handle.set((prev) => ({ ...prev, [group]: { ...prev[group], ...next } })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handle.set],
  );

  return {
    ...handle,
    ledger: (handle.payload?.ledger ?? null) as LedgerSummary | null,
    patchGroup,
  };
}
