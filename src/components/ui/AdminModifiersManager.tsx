'use client';

import { useSearchParams } from 'next/navigation';
import { ShopPage } from '@/components/admin/economy/ShopPage';
import { TradePage } from '@/components/admin/economy/TradePage';
import { TaskStreakPage } from '@/components/admin/economy/TaskStreakPage';
import { ChecklistPage } from '@/components/admin/economy/ChecklistPage';
import { FriendsPage } from '@/components/admin/economy/FriendsPage';

export function AdminModifiersManager() {
  const view = useSearchParams()?.get('view');
  if (view === 'shop') return <ShopPage key="shop" />;
  if (view === 'streak') return <TaskStreakPage key="streak" />;
  if (view === 'checklist') return <ChecklistPage key="checklist" />;
  if (view === 'social') return <FriendsPage key="social" />;
  return <TradePage key="trade" />;
}
