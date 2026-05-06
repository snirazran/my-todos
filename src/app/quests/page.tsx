'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthContext';
import { QuestsPanel } from '@/components/ui/QuestsPanel';

export default function QuestsPage() {
  const { user } = useAuth();

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
    <main className="h-[100dvh] md:h-[calc(100vh-4rem)] overflow-hidden bg-background">
      <div className="flex flex-col w-full h-full max-w-3xl mx-auto">
        <QuestsPanel isGuest={!user} />
      </div>
    </main>
  );
}
