// app/layout.tsx
import type { Metadata } from 'next';
import { Rubik } from 'next/font/google';
import './globals.css';

const rubik = Rubik({
  subsets: ['hebrew', 'latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'המשימות היומיות שלי',
  description: 'עקוב אחר המשימות היומיות שלך',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${rubik.className} antialiased`}>{children}</body>
    </html>
  );
}
