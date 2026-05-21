import { AdminBackgroundsManager } from '@/components/ui/AdminBackgroundsManager';
import { AdminGuard } from '@/components/auth/AdminGuard';

export default function AdminBackgroundsPage() {
  return (
    <AdminGuard>
      <AdminBackgroundsManager />
    </AdminGuard>
  );
}
