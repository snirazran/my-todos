import { AdminQuestManagerPage } from '@/components/ui/AdminQuestManagerPage';
import { AdminGuard } from '@/components/auth/AdminGuard';

export default function AdminQuestsPage() {
  return (
    <AdminGuard>
      <AdminQuestManagerPage />
    </AdminGuard>
  );
}
