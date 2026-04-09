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
    GoogleAuth: {
      scopes: ['profile', 'email'],
      iosClientId:
        '324868480648-qv2h2spg5jl3mmhek4u6vvefm7k7m0f4.apps.googleusercontent.com',
      serverClientId:
        '324868480648-mcnp29sgs2r9ip4nsbfs82phhiuv4tos.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
