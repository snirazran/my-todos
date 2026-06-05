// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Poppins, Luckiest_Guy } from 'next/font/google';
import './globals.css';
import Providers from '@/app/providers';
import SiteHeader from '@/components/ui/siteHeader';
import MobileNav from '@/components/ui/MobileNav';
import { RiveCounter } from '@/components/ui/RiveCounter';
import { AuthContext } from '@/components/auth/AuthContext';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans', // optional: lets Tailwind use it via font-sans
});

const luckiestGuy = Luckiest_Guy({
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
  variable: '--font-display',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1410' },
  ],
};

export const metadata: Metadata = {
  title: 'Frogress',
  description: 'Frogress Todo List App',
  icons: {
    icon: '/48x48.png',
    shortcut: '/48x48.png',
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
      className={`h-full ${poppins.variable} ${luckiestGuy.variable}`}
    >
      <head>
        {/* Preload the default page background so it paints without a flash.
            Responsive: only the matching breakpoint is fetched. */}
        <link
          rel="preload"
          as="image"
          href="/bg-mobile.webp"
          media="(max-width: 767px)"
        />
        <link
          rel="preload"
          as="image"
          href="/bg-web.webp"
          media="(min-width: 1280px)"
        />
      </head>
      <body
        className={[
          poppins.className,
          'antialiased h-full bg-background flex flex-col',
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
              <main id="main-scroll" className="flex-1 overflow-y-auto relative pb-16 md:pb-0">
                <GlobalPageBackground />
                {children}
              </main>
              <MobileNav />
              <RiveCounter />
            </div>
          </Providers>
        </AuthContext>
      </body>
    </html>
  );
}
