import type { CapacitorConfig } from '@capacitor/cli';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Dev-server mode
// ---------------------------------------------------------------------------
// The native shell loads one URL, baked in at `npx cap sync` time. By default
// that's production (frogress.com). Flip on dev mode and the app instead loads
// your local Next.js dev server, so JS changes hot-reload on the device/sim
// with no native rebuild.
//
// To use it, put this in `.env.local` (already git-ignored):
//
//   CAP_DEV=true
//
// then run `npx cap sync ios` once. Set it back to false / remove it and
// re-sync to point at production again.
//
// Optional overrides:
//   CAP_DEV_HOST=192.168.1.50   # force a host (default: auto-detected LAN IP)
//   CAP_DEV_PORT=3000           # dev server port (default: 3000)
//   CAP_SERVER_URL=http://...   # bypass everything and use this URL verbatim
//
// The CLI environment wins over `.env.local`, so a one-off
// `CAP_SERVER_URL=... npx cap sync` still works.

// Capacitor's CLI doesn't load .env files (only Next.js does), so pull in the
// few keys we need ourselves — no dotenv dependency required. Existing env
// vars (e.g. set on the command line) are never overwritten.
function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) {
    const path = join(__dirname, file);
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (key in process.env) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

// First non-internal IPv4 address — reachable from a real device on the same
// Wi-Fi, and equally fine for the simulator.
function lanIp(): string {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return 'localhost';
}

const truthy = (v?: string) => v === 'true' || v === '1' || v === 'yes';

loadEnvFiles();

function resolveServerUrl(): string {
  // Explicit URL always wins (back-compat with the old workflow).
  if (process.env.CAP_SERVER_URL) return process.env.CAP_SERVER_URL;

  if (truthy(process.env.CAP_DEV)) {
    const host = process.env.CAP_DEV_HOST || lanIp();
    const port = process.env.CAP_DEV_PORT || '3000';
    return `http://${host}:${port}`;
  }

  return 'https://frogress.com';
}

const serverUrl = resolveServerUrl();

if (serverUrl.startsWith('http://')) {
  // Surface the dev target so it's obvious which build you're syncing.
  console.log(`\n📡 Capacitor dev mode → loading ${serverUrl}\n`);
}

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
    // No banner/sound/badge for pushes that arrive while the app is open —
    // the in-app UI already reflects those events.
    FirebaseMessaging: {
      presentationOptions: [],
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
