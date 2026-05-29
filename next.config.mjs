// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // Serve modern formats automatically (next/image negotiates per-browser).
    formats: ['image/avif', 'image/webp'],
    // Trim the candidate set so the optimizer generates fewer, well-targeted sizes.
    deviceSizes: [360, 640, 768, 1024, 1280, 1920],
    imageSizes: [16, 20, 24, 32, 40, 48, 64, 96, 128],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },
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

export default nextConfig;
