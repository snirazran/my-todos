import type { CapacitorConfig } from '@capacitor/cli';

// The native shell loads this URL. Defaults to production (frogress.com).
// For local device/simulator testing, override it when syncing, e.g.:
//   iOS simulator:    CAP_SERVER_URL=http://localhost:3000 npx cap sync ios
//   Android emulator: CAP_SERVER_URL=http://10.0.2.2:3000 npx cap sync android
//   Real device:      CAP_SERVER_URL=http://<your-LAN-IP>:3000 npx cap sync
const serverUrl = process.env.CAP_SERVER_URL ?? 'https://frogress.com';

const config: CapacitorConfig = {
  appId: 'io.frog.tasks',
  appName: 'Frogress',
  webDir: 'out',
  server: {
    url: serverUrl,
    // Only allow plain HTTP when explicitly pointing at a local dev server.
    cleartext: serverUrl.startsWith('http://'),
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
