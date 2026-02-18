'use client';

import { useAuth } from '@/components/auth/AuthContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';

/**
 * Invisible component that initializes push notifications.
 * Must be rendered inside AuthContext and on native platforms.
 */
export function PushNotificationInit() {
  const { user } = useAuth();
  usePushNotifications(user?.uid);
  return null;
}
