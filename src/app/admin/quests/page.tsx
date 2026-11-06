import { Suspense } from 'react';
import { AdminQuestManagerPage } from '@/components/ui/AdminQuestManagerPage';

export default function AdminQuestsPage() {
  return (
    <Suspense fallback={null}>
      <AdminQuestManagerPage />
    </Suspense>
  );
}
