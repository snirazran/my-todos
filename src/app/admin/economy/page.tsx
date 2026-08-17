import { AdminEconomyManager } from '@/components/ui/AdminEconomyManager';
import { AdminGuard } from '@/components/auth/AdminGuard';

export default function AdminEconomyPage() {
  return (
    <AdminGuard>
      <AdminEconomyManager />
    </AdminGuard>
  );
}
