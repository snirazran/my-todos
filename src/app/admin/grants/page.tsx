import { AdminGrantsManager } from '@/components/ui/AdminGrantsManager';
import { AdminGuard } from '@/components/auth/AdminGuard';

export default function AdminGrantsPage() {
  return (
    <AdminGuard>
      <AdminGrantsManager />
    </AdminGuard>
  );
}
