import { notFound } from 'next/navigation';
import { PledgeDesignPreview } from '@/components/ui/streak/StreakSheet';

export default function PledgePreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <PledgeDesignPreview />;
}
