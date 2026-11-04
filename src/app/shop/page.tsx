'use client';

import { Suspense } from 'react';
import { WardrobeStagePage } from '@/components/ui/skins/WardrobeStagePage';
import { WardrobePageSkeleton } from '@/components/ui/Skeleton';

export default function ShopPage() {
  return (
    <Suspense fallback={<WardrobePageSkeleton tabs={0} />}>
      <WardrobeStagePage section="shop" />
    </Suspense>
  );
}
