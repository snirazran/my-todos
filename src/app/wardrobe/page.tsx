import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { WardrobeStagePage } from '@/components/ui/skins/WardrobeStagePage';
import { WardrobePageSkeleton } from '@/components/ui/Skeleton';

export default async function WardrobePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (params.tab === 'shop') {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === 'tab' || value === undefined) continue;
      for (const entry of Array.isArray(value) ? value : [value]) query.append(key, entry);
    }
    const rest = query.toString();
    redirect(rest ? `/shop?${rest}` : '/shop');
  }

  // useSearchParams() requires a Suspense boundary during prerender (Next 16).
  return (
    <Suspense fallback={<WardrobePageSkeleton />}>
      <WardrobeStagePage section="wardrobe" />
    </Suspense>
  );
}
