import { AdminCampaignsManager } from '@/components/ui/AdminCampaignsManager';
import { AdminGuard } from '@/components/auth/AdminGuard';

export default function AdminPopupsPage() {
  return (
    <AdminGuard>
      <AdminCampaignsManager />
    </AdminGuard>
  );
}
