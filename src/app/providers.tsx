'use client';

import { SWRConfig } from 'swr';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { NotificationProvider } from '@/components/providers/NotificationProvider';
import { PushNotificationInit } from '@/components/providers/PushNotificationInit';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SWRConfig
        value={{
          revalidateOnFocus: false,
          revalidateOnReconnect: false,
        }}
      >
        <NotificationProvider>
          <PushNotificationInit />
          {children}
        </NotificationProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
