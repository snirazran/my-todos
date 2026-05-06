'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthContext';
import { QuestsPopup } from '@/components/ui/QuestsPopup';

export default function QuestsPage() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <main className="h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)] overflow-hidden bg-background">
      <div className="flex flex-col w-full h-full max-w-3xl mx-auto">
        <QuestsPopup
          show={true}
          embedded
          isGuest={!user}
          onClose={() => router.push('/')}
        />
      </div>
    </main>
  );
}
