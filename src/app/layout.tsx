// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import Providers from '@/app/providers';
import SiteHeader from '@/components/ui/siteHeader';
import MobileNav from '@/components/ui/MobileNav';
import { AuthContext } from '@/components/auth/AuthContext';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans', // optional: lets Tailwind use it via font-sans
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
  title: 'FrogTask',
  description: 'FrogTask Todo List App',
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
    <html lang="en" dir="ltr" className={`h-full ${poppins.variable}`}>
      <body
        className={[
          // use Poppins globally (directly + via Tailwind var)
          poppins.className,
          'antialiased h-full min-h-[100svh]',
          // respect device notches / home indicators
          '[padding-top:env(safe-area-inset-top)]',
          '[padding-bottom:env(safe-area-inset-bottom)]',
        ].join(' ')}
      >
        {/* Global, fixed background that paints under mobile URL/search bars */}
        <div className="fixed inset-0 -z-10 bg-background [background-attachment:fixed]" />

        <AuthContext>
          <Providers>
            <SiteHeader />
            {children}
            <MobileNav />
          </Providers>
        </AuthContext>
      </body>
    </html>
  );
}
