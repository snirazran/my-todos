// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import Providers from './providers';
import SiteHeader from '@/components/ui/siteHeader';

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
};

export const metadata: Metadata = {
  title: 'My Daily Tasks',
  description: 'Track your daily tasks',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' }, // slate-50
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' }, // slate-900
  ],
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
        <div className="fixed inset-0 -z-10 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 [background-attachment:fixed]" />

        <Providers>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
