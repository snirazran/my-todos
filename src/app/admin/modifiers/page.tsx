import { Suspense } from 'react';
import { AdminModifiersManager } from '@/components/ui/AdminModifiersManager';

export default function AdminModifiersPage() {
  return (
    <Suspense fallback={null}>
      <AdminModifiersManager />
    </Suspense>
  );
}
