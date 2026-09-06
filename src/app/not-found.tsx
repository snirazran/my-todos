import type { Metadata } from 'next';
import { ErrorScene } from '@/components/ui/ErrorScene';

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'That page hopped away. Head back to your quests — or catch a few flies first.',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <ErrorScene
      code="404"
      title="This lily pad sank."
      message="Nothing lives at this address. Your quests, streak and flies are all safe — this page just never existed."
      primaryLabel="Take me home"
      primaryHref="/"
    />
  );
}
