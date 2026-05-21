import { AdminInviteManager } from '@/components/ui/AdminInviteManager';
import { AdminGuard } from '@/components/auth/AdminGuard';

export default function AdminInvitesPage() {
  return (
    <AdminGuard>
      <AdminInviteManager />
    </AdminGuard>
  );
}
