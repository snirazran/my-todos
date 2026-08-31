import { AdminLeapLab } from '@/components/ui/AdminLeapLab';
import { AdminGuard } from '@/components/auth/AdminGuard';

export default function AdminLeapLabPage() {
  return (
    <AdminGuard>
      <AdminLeapLab />
    </AdminGuard>
  );
}
