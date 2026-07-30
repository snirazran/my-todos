'use client';

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { PomodoroPhase } from '@/lib/frogodoroStore';
import { iosAlarmFile } from '@/lib/timerSoundFiles';

/**
 * Frogodoro timer-completion notifications.
 *
 * These are scheduled locally at the phase's end time the moment a phase starts
 * running, so the OS delivers them on time regardless of whether the app is
 * open, backgrounded, or killed — unlike a push fired from JS on completion,
 * which only lands when the app is foregrounded again.
 */

// Fixed IDs so we can cancel/replace without tracking state.
const PHASE_END_ID = 880001;
const CHAINED_BREAK_END_ID = 880002;

function phaseEndContent(phase: PomodoroPhase, autoStartBreak: boolean) {
  if (phase === 'focus' && autoStartBreak) {
    return {
      type: 'break_started',
      title: 'Break started',
      body: 'Focus time finished. Your break has started.',
    };
  }
  if (phase === 'focus') {
    return {
      type: 'timer_complete',
      title: 'Focus timer finished',
      body: 'Time for a break. You earned it!',
    };
  }
  return {
    type: 'break_complete',
    title: 'Break finished',
    body: 'Ready to focus? Start again whenever you are.',
  };
}

export async function cancelTimerNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: PHASE_END_ID }, { id: CHAINED_BREAK_END_ID }],
    });
  } catch {
    /* best-effort */
  }
}

export async function scheduleTimerNotifications(opts: {
  phase: PomodoroPhase;
  endTime: number;
  autoStartBreak: boolean;
  breakDurationSec: number;
  timerSound?: string;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  // Android's ring is the native setAlarmClock alarm (exact, Doze-proof,
  // looping sound) — a second scheduled notification would double-fire.
  if (Capacitor.getPlatform() === 'android') return;
  const { phase, endTime, autoStartBreak, breakDurationSec, timerSound } = opts;

  try {
    const perms = await LocalNotifications.checkPermissions();
    if (perms.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    }

    // Always start from a clean slate so we never stack duplicates.
    await cancelTimerNotifications();
    if (endTime <= Date.now()) return;

    // iOS: the user's chosen alarm as a bundled .caf (Library/Sounds).
    // Android: the native setAlarmClock path owns the finish sound.
    const notifSound =
      Capacitor.getPlatform() === 'ios' ? iosAlarmFile(timerSound) : undefined;

    const first = phaseEndContent(phase, autoStartBreak);
    const notifications = [
      {
        id: PHASE_END_ID,
        title: first.title,
        body: first.body,
        schedule: { at: new Date(endTime), allowWhileIdle: true },
        sound: notifSound,
        smallIcon: 'ic_notification',
        iconColor: '#4CAF50',
        extra: { type: first.type, path: '/timer' },
      },
    ];

    // When a break auto-starts after focus, the break-start transition happens
    // in JS — which won't run if the app is closed. Pre-schedule the break-end
    // notification too so the chain still fires while the app is killed. If the
    // app is open at the transition, the running effect reschedules and this is
    // cancelled/replaced, so there's never a duplicate.
    if (phase === 'focus' && autoStartBreak && breakDurationSec > 0) {
      const breakEnd = endTime + breakDurationSec * 1000;
      notifications.push({
        id: CHAINED_BREAK_END_ID,
        title: 'Break finished',
        body: 'Ready to focus? Start again whenever you are.',
        schedule: { at: new Date(breakEnd), allowWhileIdle: true },
        sound: notifSound,
        smallIcon: 'ic_notification',
        iconColor: '#4CAF50',
        extra: { type: 'break_complete', path: '/timer' },
      });
    }

    await LocalNotifications.schedule({ notifications });
  } catch (err) {
    console.error('Failed to schedule timer notifications:', err);
  }
}
