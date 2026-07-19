// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Poppins, Luckiest_Guy, Heebo } from 'next/font/google';
import './globals.css';
import Providers from '@/app/providers';
import SiteHeader from '@/components/ui/siteHeader';
import MobileNav from '@/components/ui/MobileNav';
import { RiveCounter } from '@/components/ui/RiveCounter';
import { RiveScrollPause } from '@/components/ui/RiveScrollPause';
import { SheetRivePause } from '@/components/ui/SheetRivePause';
import { RiveIdlePause } from '@/components/ui/RiveIdlePause';
import { AuthContext } from '@/components/auth/AuthContext';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import { RiveWarmup } from '@/components/providers/RiveWarmup';
import { RIVE_WASM_VERSION } from '@/lib/riveWasmVersion';
import { MainScroll } from '@/components/providers/MainScroll';
import { FlyCatchOverlay } from '@/components/fly-game/FlyCatchOverlay';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans', // optional: lets Tailwind use it via font-sans
  // Drop the metric-adjusted Arial fallback next/font normally appends — Arial
  // has Hebrew glyphs and would catch Hebrew text before it reaches Heebo.
  adjustFontFallback: false,
});

const luckiestGuy = Luckiest_Guy({
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
  variable: '--font-display',
});

// Hebrew default — Poppins has no Hebrew glyphs, so Heebo sits next in the font
// stack and the browser falls back to it for Hebrew text while Latin stays Poppins.
const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-hebrew',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1612' },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://frogress.com'),
  title: 'Frogress',
  description: 'Frogress Todo List App',
  icons: {
    icon: '/frogress-icon.png',
    shortcut: '/frogress-icon.png',
    apple: '/180x180.png',
    other: {
      rel: 'apple-touch-icon-precomposed',
      url: '/180x180.png',
    },
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      dir="ltr"
      // next-themes sets `class` + `color-scheme` on <html> via a pre-hydration
      // script, so the server/client attributes never match. This suppresses the
      // (shallow, one-level) hydration warning for exactly that case.
      suppressHydrationWarning
      className={`h-full ${poppins.variable} ${luckiestGuy.variable} ${heebo.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var errs=[];window.__bootErrs=errs;addEventListener('error',function(e){var t=e.target;if(t&&t!==window&&(t.src||t.href)){errs.push(String(t.src||t.href).slice(0,200))}else if(e.message){errs.push(String(e.message).slice(0,200))}},true);window.__bootPing=setTimeout(function(){try{navigator.sendBeacon('/api/client-log',JSON.stringify({type:'boot_stalled',readyState:document.readyState,errs:errs.slice(0,10),url:location.href,ua:navigator.userAgent,t:Date.now()}))}catch(e){}},10000)})();`,
          }}
        />
        {/* Preload the default page background so it paints without a flash.
            Responsive: only the matching breakpoint is fetched. */}
        <link
          rel="preload"
          as="image"
          href="/bg-mobile.webp"
          media="(max-width: 767.98px)"
        />
        <link
          rel="preload"
          as="image"
          href="/bg-tablet.webp"
          media="(min-width: 768px) and (max-width: 1279.98px)"
        />
        <link
          rel="preload"
          as="image"
          href="/bg-web.webp"
          media="(min-width: 1280px) and (max-width: 1919.98px)"
        />
        <link
          rel="preload"
          as="image"
          href="/bg-web-large.webp"
          media="(min-width: 1920px)"
        />
        {/* The fly the frog's tongue grabs on task completion — preload so the
            very first completion never renders a blank (uncached) fly. */}
        <link rel="preload" as="image" href="/fly.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" />
        <link rel="preconnect" href="https://fcmregistrations.googleapis.com" />
        {/* Rive runtime WASM (self-hosted) + the frog animation — start both
            downloads from the HTML head so they don't wait for hydration. */}
        <link
          rel="preload"
          href={`/rive.wasm?v=${RIVE_WASM_VERSION}`}
          as="fetch"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/frog_idle.riv"
          as="fetch"
          crossOrigin="anonymous"
        />
      </head>
      <body
        className={[
          'font-sans antialiased h-full bg-background flex flex-col',
          // NOTE: no top safe-area padding here — pages draw their backgrounds
          // edge-to-edge under the status bar and add the inset back to their
          // own foreground content (see home/wardrobe/quests/planner tops).
          'pb-[env(safe-area-inset-bottom)]',
        ].join(' ')}
      >
        {/* Global, fixed background that paints under mobile URL/search bars */}
        <div className="fixed inset-0 -z-10 bg-background [background-attachment:fixed]" />

        <AuthContext>
          <Providers>
            <div className="flex flex-col h-full">
              <SiteHeader />
              <MainScroll>
                <GlobalPageBackground />
                {children}
              </MainScroll>
              <MobileNav />
              <FlyCatchOverlay />
              <RiveCounter />
              <RiveScrollPause />
              <SheetRivePause />
              <RiveIdlePause />
              <RiveWarmup />
            </div>
          </Providers>
        </AuthContext>
      </body>
    </html>
  );
}
