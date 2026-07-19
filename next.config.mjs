// next.config.mjs
import { networkInterfaces } from 'node:os';
import { withSentryConfig } from '@sentry/nextjs';

// When the Capacitor app loads from this dev server over the LAN (CAP_DEV mode),
// requests for HMR/_next resources arrive with the machine's LAN IP as origin.
// Next 16 blocks those by default, which breaks hot reload and asset loading.
// Allow every non-internal IPv4 we have, plus the common private ranges so this
// keeps working when the IP changes. Dev-only — never applied to production.
const lanOrigins = Object.values(networkInterfaces())
  .flat()
  .filter((addr) => addr && addr.family === 'IPv4' && !addr.internal)
  .map((addr) => addr.address);

const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const firebaseAuthHelperHost =
  process.env.FIREBASE_AUTH_HELPER_HOST ||
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_HELPER_HOST ||
  (firebaseProjectId ? `${firebaseProjectId}.firebaseapp.com` : undefined) ||
  'frogtask-fa522.firebaseapp.com';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  allowedDevOrigins: [...lanOrigins, '192.168.*.*', '10.*.*.*', '172.16.*.*'],
  // Reuse the client router cache when hopping between tabs so revisits render
  // instantly instead of waiting on a fresh RSC round-trip. Page data stays
  // fresh independently via SWR.
  experimental: {
    staleTimes: {
      dynamic: 180,
      static: 300,
    },
  },
  async headers() {
    return [
      {
        source: '/:file(rive|rive_fallback).wasm',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          { key: 'Content-Type', value: 'application/wasm' },
        ],
      },
      {
        source: '/:file*.riv',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=300, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },
  async rewrites() {
    const rewrites = [
      {
        source: '/.well-known/apple-app-site-association',
        destination: '/api/well-known/apple-app-site-association',
      },
      {
        source: '/.well-known/assetlinks.json',
        destination: '/api/well-known/assetlinks',
      },
    ];

    if (firebaseAuthHelperHost) {
      rewrites.push({
        source: '/__/auth/:path*',
        destination: `https://${firebaseAuthHelperHost}/__/auth/:path*`,
      });
      rewrites.push({
        source: '/__/firebase/:path*',
        destination: `https://${firebaseAuthHelperHost}/__/firebase/:path*`,
      });
    }

    return rewrites;
  },
  images: {
    // Serve modern formats automatically (next/image negotiates per-browser).
    formats: ['image/avif', 'image/webp'],
    // Trim the candidate set so the optimizer generates fewer, well-targeted sizes.
    deviceSizes: [360, 640, 768, 1024, 1280, 1920],
    imageSizes: [16, 20, 24, 32, 40, 48, 64, 96, 128],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
  // Turbopack is the default bundler in Next 16. Mirror the SVGR setup here so
  // `import Icon from './x.svg'` yields an inline React component (see Icon.tsx).
  turbopack: {
    rules: {
      '*.svg': {
        loaders: [
          {
            loader: '@svgr/webpack',
            options: {
              svgo: true,
              svgoConfig: {
                plugins: [
                  {
                    name: 'preset-default',
                    params: { overrides: { removeViewBox: false } },
                  },
                ],
              },
              titleProp: true,
            },
          },
        ],
        as: '*.js',
      },
    },
  },
  // Kept for `next build --webpack` (the non-default bundler path).
  webpack(config) {
    // Let *.svg be imported as inline React components via SVGR.
    // Original colors are preserved (these icons are multicolor), so they
    // ship in the JS bundle with zero extra network requests and no flash.
    const fileLoaderRule = config.module.rules.find(
      (rule) => rule.test instanceof RegExp && rule.test.test('.svg')
    );

    if (fileLoaderRule) {
      fileLoaderRule.exclude = /\.svg$/i;
    }

    config.module.rules.push(
      // import iconUrl from './x.svg?url'  -> stays a URL string (escape hatch)
      {
        test: /\.svg$/i,
        type: 'asset/resource',
        resourceQuery: /url/,
      },
      // import Icon from './x.svg'  -> React component
      {
        test: /\.svg$/i,
        issuer: /\.[jt]sx?$/,
        resourceQuery: { not: [/url/] },
        use: [
          {
            loader: '@svgr/webpack',
            options: {
              // Keep viewBox so the icons scale with width/height/className.
              svgo: true,
              svgoConfig: {
                plugins: [
                  {
                    name: 'preset-default',
                    params: { overrides: { removeViewBox: false } },
                  },
                ],
              },
              titleProp: true,
            },
          },
        ],
      }
    );

    return config;
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  webpack: { treeshake: { removeDebugLogging: true } },
  telemetry: false,
});
