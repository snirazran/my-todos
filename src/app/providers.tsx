'use client';

import { SWRConfig } from 'swr';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { NotificationProvider } from '@/components/providers/NotificationProvider';
import { PushNotificationInit } from '@/components/providers/PushNotificationInit';
import { GlobalTimer } from '@/components/providers/GlobalTimer';
import { GlobalCalendarSync } from '@/components/ui/GoogleCalendarSync';
import { GlobalSkinRotation } from '@/components/ui/SkinRotation';
import { ReferralClaimer } from '@/components/providers/ReferralClaimer';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <SWRConfig
        value={{
          revalidateOnFocus: false,
          revalidateOnReconnect: false,
        }}
      >
        <NotificationProvider>
          <GlobalTimer />
          <GlobalCalendarSync />
          <GlobalSkinRotation />
          <PushNotificationInit />
          <ReferralClaimer />
          {children}
        </NotificationProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
