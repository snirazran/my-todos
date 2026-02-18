import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.frog.tasks',
  appName: 'daily-todo-tracker',
  webDir: 'out',
  server: {
    url: 'http://10.0.2.2:3000', // Use 10.0.2.2 for Android Emulator. Replace with LAN IP for real device.
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
