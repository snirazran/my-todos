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
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId:
        '324868480648-mcnp29sgs2r9ip4nsbfs82phhiuv4tos.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
