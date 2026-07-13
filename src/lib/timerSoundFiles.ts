import { normalizeTimerSound } from '@/lib/timerSounds';

// Native alarm asset names for each selectable timer sound. The iOS .caf
// files ship in public/alarms/ios (bundled into the app by Capacitor and
// copied to Library/Sounds on launch — see AppDelegate.installAlarmSounds);
// the Android res/raw names map to android/app/src/main/res/raw/*.mp3.

const IOS_FILES: Record<string, string> = {
  frog: 'frog.caf',
  classic: 'classic.caf',
  dreamscape: 'dreamscape.caf',
  lofi: 'lofi.caf',
  stardust: 'stardust.caf',
};

const ANDROID_RES: Record<string, string> = {
  frog: 'alarm_frog',
  classic: 'alarm_classic',
  dreamscape: 'alarm_dreamscape',
  lofi: 'alarm_lofi',
  stardust: 'alarm_stardust',
};

/** APNs/local-notification sound file for a timer sound; undefined = silent. */
export function iosAlarmFile(sound: string | undefined | null): string | undefined {
  const id = normalizeTimerSound(sound);
  if (id === 'none') return undefined;
  return IOS_FILES[id];
}

/** Android res/raw resource name for a timer sound; undefined = silent. */
export function androidAlarmRes(sound: string | undefined | null): string | undefined {
  const id = normalizeTimerSound(sound);
  if (id === 'none') return undefined;
  return ANDROID_RES[id];
}
