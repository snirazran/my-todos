'use client';

import { Capacitor } from '@capacitor/core';
import {
  NativeSettings,
  AndroidSettings,
  IOSSettings,
} from 'capacitor-native-settings';

/**
 * Opens the OS notification settings screen for this app so the user can flip
 * the system-level notification toggle. Only meaningful on native platforms.
 */
export async function openAppNotificationSettings() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (Capacitor.getPlatform() === 'ios') {
      await NativeSettings.openIOS({ option: IOSSettings.AppNotification });
    } else {
      await NativeSettings.openAndroid({ option: AndroidSettings.AppNotification });
    }
  } catch (err) {
    console.error('Failed to open app notification settings:', err);
  }
}
