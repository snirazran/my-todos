import { InsightsView } from '@/components/insights/InsightsView';

export const metadata = {
  title: 'Your Patterns · Frogress',
  description: 'Understand your habits, focus, and follow-through.',
};

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = params.days === '30' ? 30 : params.days === '90' ? 90 : 7;
  return <InsightsView days={days} />;
}
