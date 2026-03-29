'use client';

import { useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { format, parseISO, subMinutes, subHours, isValid } from 'date-fns';
import { Task } from '@/hooks/useTaskData';

/**
 * Hook to manage local notification scheduling for task reminders.
 */
export function useReminderScheduler() {
  const scheduleNotification = useCallback(async (task: Task) => {
    if (!Capacitor.isNativePlatform()) return;
    if (!task.startTime || !task.reminder) {
      // If reminder removed, we should cancel existing ones for this task
      await cancelNotification(task.id);
      return;
    }

    try {
      // 1. Request permissions if needed
      const perms = await LocalNotifications.checkPermissions();
      if (perms.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }

      // 2. Cancel existing notification for this task ID (using hash of string ID to int)
      await cancelNotification(task.id);

      // 3. Calculate trigger time
      // Task date is either t.date or today's date (for habits/recurring)
      const dateStr = task.date || format(new Date(), 'yyyy-MM-dd');
      const [hours, minutes] = task.startTime.split(':').map(Number);

      let triggerDate = new Date(`${dateStr}T${task.startTime}:00`);

      // If the resulting date is invalid (e.g. bad date string), fallback to current year/month/day
      if (!isValid(triggerDate)) {
        triggerDate = new Date();
        triggerDate.setHours(hours, minutes, 0, 0);
      }

      // Apply reminder offset
      switch (task.reminder) {
        case '5m':
          triggerDate = subMinutes(triggerDate, 5);
          break;
        case '10m':
          triggerDate = subMinutes(triggerDate, 10);
          break;
        case '15m':
          triggerDate = subMinutes(triggerDate, 15);
          break;
        case '30m':
          triggerDate = subMinutes(triggerDate, 30);
          break;
        case '1h':
          triggerDate = subHours(triggerDate, 1);
          break;
        case 'at_time':
        default:
          break;
      }

      // Don't schedule if in the past
      if (triggerDate.getTime() <= Date.now()) {
        console.log('Reminder time is in the past, skipping scheduling.');
        return;
      }

      // 4. Schedule
      // LocalNotifications needs a numeric ID. We hash the string UUID.
      const numericId = hashStringToInt(task.id);

      await LocalNotifications.schedule({
        notifications: [
          {
            title: 'Task Reminder 🐸',
            body: `Don't forget: ${task.text}`,
            id: numericId,
            schedule: { at: triggerDate },
            sound: 'default',
            attachments: [],
            extra: { taskId: task.id },
            smallIcon: 'ic_notification', // Ensure this exists in Android res
            iconColor: '#4CAF50',
          },
        ],
      });

      console.log(
        `Scheduled notification for task "${task.text}" at ${triggerDate}`,
      );
    } catch (err) {
      console.error('Failed to schedule local notification:', err);
    }
  }, []);

  const cancelNotification = useCallback(async (taskId: string) => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const numericId = hashStringToInt(taskId);
      await LocalNotifications.cancel({
        notifications: [{ id: numericId }],
      });
    } catch (err) {
      console.error('Failed to cancel local notification:', err);
    }
  }, []);

  return { scheduleNotification, cancelNotification };
}

/**
 * Helper to convert a string (UUID) to a 32-bit integer for Capacitor IDs.
 */
function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
