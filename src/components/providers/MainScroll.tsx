'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function MainScroll({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullBleed = pathname === '/fly-catch';

  return (
    <main
      id="main-scroll"
      className={cn(
        'relative flex-1 overflow-y-auto no-scrollbar',
        fullBleed ? 'pb-0' : 'pb-16 md:pb-0',
      )}
    >
      {children}
    </main>
  );
}

