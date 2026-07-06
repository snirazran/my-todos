'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { QuestsPanel } from '@/components/ui/QuestsPanel';
import { QuestsPageSkeleton } from '@/components/ui/Skeleton';

export default function QuestsPage() {
  const { user, loading } = useAuth();

  useEffect(() => {
    const mainScroll = document.getElementById('main-scroll');
    if (!mainScroll) return;

    const previousOverflowY = mainScroll.style.overflowY;
    const previousScrollbarGutter = mainScroll.style.scrollbarGutter;

    mainScroll.scrollTop = 0;
    mainScroll.classList.add('no-scrollbar');
    mainScroll.style.overflowY = 'hidden';
    mainScroll.style.scrollbarGutter = 'auto';
    const frame = window.requestAnimationFrame(() => {
      mainScroll.scrollTop = 0;
    });

    return () => {
      window.cancelAnimationFrame(frame);
      mainScroll.classList.remove('no-scrollbar');
      mainScroll.style.overflowY = previousOverflowY;
      mainScroll.style.scrollbarGutter = previousScrollbarGutter;
    };
  }, []);

  return (
    <main className="h-[100dvh] overflow-hidden bg-background md:h-[calc(100vh-4rem)]">
      <div className="flex h-full w-full flex-col">
        {loading ? (
          <QuestsPageSkeleton />
        ) : (
          <QuestsPanel isGuest={!user} />
        )}
      </div>
    </main>
  );
}
