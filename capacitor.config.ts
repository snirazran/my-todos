import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.frog.tasks',
  appName: 'daily-todo-tracker',
  webDir: 'out',
  server: {
    url: 'http://localhost:3000', // Use localhost for iOS Simulator. Use 10.0.2.2 for Android Emulator. Use LAN IP for real devices.
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
      logLevel: 1,
    },
  },
};

export default config;
