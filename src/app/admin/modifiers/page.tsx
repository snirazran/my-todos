import { AdminModifiersManager } from '@/components/ui/AdminModifiersManager';
import { AdminGuard } from '@/components/auth/AdminGuard';

export default function AdminModifiersPage() {
  return (
    <AdminGuard>
      <AdminModifiersManager />
    </AdminGuard>
  );
}
