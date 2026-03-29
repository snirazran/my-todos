'use client';

import { SWRConfig } from 'swr';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { NotificationProvider } from '@/components/providers/NotificationProvider';
import { PushNotificationInit } from '@/components/providers/PushNotificationInit';
import { GlobalTimer } from '@/components/providers/GlobalTimer';
import { GlobalCalendarSync } from '@/components/ui/GoogleCalendarSync';

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
          <GlobalTimer />
          <GlobalCalendarSync />
          <PushNotificationInit />
          {children}
        </NotificationProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
