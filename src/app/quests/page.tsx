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
    const frame = window.requestAnimationFrame(() => {
      mainScroll.scrollTop = 0;
    });

    const release = () => {
      mainScroll.classList.remove('no-scrollbar');
      mainScroll.style.overflowY = previousOverflowY;
      mainScroll.style.scrollbarGutter = previousScrollbarGutter;
    };

    const desktop = window.matchMedia('(min-width: 768px)');
    const sync = () => {
      if (desktop.matches) {
        release();
        return;
      }
      mainScroll.classList.add('no-scrollbar');
      mainScroll.style.overflowY = 'hidden';
      mainScroll.style.scrollbarGutter = 'auto';
    };
    sync();
    desktop.addEventListener('change', sync);

    return () => {
      window.cancelAnimationFrame(frame);
      desktop.removeEventListener('change', sync);
      release();
    };
  }, []);

  return (
    <main className="h-[100dvh] overflow-hidden bg-background md:h-auto md:min-h-[100dvh] md:overflow-visible">
      <div className="flex h-full w-full flex-col md:h-auto">
        {loading ? (
          <QuestsPageSkeleton />
        ) : (
          <QuestsPanel isGuest={!user} />
        )}
      </div>
    </main>
  );
}
