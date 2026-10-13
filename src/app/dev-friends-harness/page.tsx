import { notFound } from 'next/navigation';
import { FriendsPreview } from '@/components/dev/FriendsPreview';

export default function FriendsHarness() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <FriendsPreview />;
}
