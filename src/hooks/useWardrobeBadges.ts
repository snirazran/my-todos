'use client';

import { useAuth } from '@/components/auth/AuthContext';
import { useInventory } from '@/hooks/useInventory';

export function useWardrobeBadges() {
  const { user } = useAuth();
  const { unseenCount, unseenContainerCount } = useInventory(!!user, true);
  return { inventoryBadge: unseenCount + unseenContainerCount };
}
