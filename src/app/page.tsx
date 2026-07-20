import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import HomeDashboard from '@/components/home/HomeDashboard';
import { PublicHomepage } from '@/components/marketing/PublicHomepage';

export const metadata: Metadata = {
  title: 'Frogress — A to-do list with a frog to feed',
  description:
    'Plan your week, focus on one task, and feed your frog every time you get something done. Available on web, iOS, and Android.',
  alternates: { canonical: '/' },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [cookieStore, params] = await Promise.all([cookies(), searchParams]);
  const hasSession = cookieStore.has('token');
  const isGuestPreview = Object.prototype.hasOwnProperty.call(params, 'guest');

  return hasSession || isGuestPreview ? <HomeDashboard /> : <PublicHomepage />;
}
