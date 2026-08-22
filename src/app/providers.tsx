'use client';

import { SWRConfig } from 'swr';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { NotificationProvider } from '@/components/providers/NotificationProvider';
import { PushNotificationInit } from '@/components/providers/PushNotificationInit';
import { GlobalTimer } from '@/components/providers/GlobalTimer';
import { WeekStartSync } from '@/components/providers/WeekStartSync';
import GlobalFrogodoroMini from '@/components/providers/GlobalFrogodoroMini';
import { LiveTimerController } from '@/components/providers/LiveTimerController';
import { GlobalSkinRotation } from '@/components/ui/SkinRotation';
import { ReferralClaimer } from '@/components/providers/ReferralClaimer';
import { FriendLinkClaimer } from '@/components/providers/FriendLinkClaimer';
import { BuddyApprovalBanner } from '@/components/ui/BuddyApprovalBanner';
import { DeepLinkHandler } from '@/components/providers/DeepLinkHandler';
import { TaskSyncProvider } from '@/components/providers/TaskSyncProvider';
import { StreakCheckInProvider } from '@/components/providers/StreakCheckInProvider';
import { CrossGiftProvider } from '@/components/providers/CrossGiftProvider';
import { OnboardingGate } from '@/components/providers/OnboardingGate';
import { AnalyticsProvider } from '@/components/providers/AnalyticsProvider';
import { HintCoach } from '@/components/ui/HintCoach';
import { QuestRewardRevealHost } from '@/components/ui/questRewardReveal';
import { ButtonHaptics } from '@/components/providers/ButtonHaptics';
import { FlyGameClaimer } from '@/components/providers/FlyGameClaimer';
import { FocusTimerLauncher } from '@/components/providers/FocusTimerLauncher';
import { ErrorReporter } from '@/components/providers/ErrorReporter';
import { WidgetSyncProvider } from '@/components/providers/WidgetSyncProvider';
import { BackgroundAccent } from '@/components/providers/BackgroundAccent';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      enableColorScheme
      disableTransitionOnChange
    >
      <SWRConfig
        value={{
          revalidateOnFocus: false,
          revalidateOnReconnect: false,
        }}
      >
        <TaskSyncProvider>
          <NotificationProvider>
            <ErrorReporter />
            <ButtonHaptics />
            <AnalyticsProvider />
            <GlobalTimer />
            <WeekStartSync />
            <GlobalFrogodoroMini />
            <FocusTimerLauncher />
            <LiveTimerController />
            <GlobalSkinRotation />
            <PushNotificationInit />
            <ReferralClaimer />
            <FriendLinkClaimer />
            <FlyGameClaimer />
            <BuddyApprovalBanner />
            <DeepLinkHandler />
            <StreakCheckInProvider />
            <CrossGiftProvider />
            <OnboardingGate />
            <HintCoach />
            <QuestRewardRevealHost />
            <WidgetSyncProvider />
            <BackgroundAccent />
            {children}
          </NotificationProvider>
        </TaskSyncProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
