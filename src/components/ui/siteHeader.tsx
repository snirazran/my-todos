// components/SiteHeader.tsx
'use client';

import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Sparkles, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SiteHeader() {
  const { data: session, status } = useSession();

  // Fixed height so pages can reserve space (mobile/desktop)
  // mobile: h-14 (=3.5rem), md: h-16 (=4rem)
  return (
    <header className="sticky top-0 z-50 w-full h-14 md:h-16 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-800/50 bg-white/70 dark:bg-slate-950/70">
      <div className="flex items-center justify-between h-full gap-4 px-6 py-3 mx-auto max-w-7xl md:px-10">
        {/* ───────── Logo ───────── */}
        <Link
          href="/"
          className="relative inline-flex items-center gap-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-lg"
        >
          <span className="text-2xl font-black tracking-tighter text-transparent bg-gradient-to-r from-violet-600 via-fuchsia-600 to-purple-600 bg-clip-text transition-all group-hover:opacity-80">
            FrogTask
          </span>
          <Sparkles
            className="h-5 w-5 text-fuchsia-500 animate-[float_3s_ease-in-out_infinite]"
            aria-hidden
          />
        </Link>

        {/* ───────── Auth button ───────── */}
        <div className="flex items-center gap-2">
          {status === 'loading' ? (
             <Button variant="ghost" disabled size="sm">
               ...
             </Button>
          ) : session ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => signOut()}
              className="gap-2 font-medium"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          ) : (
            <Button
              onClick={() => signIn()}
              className="gap-2 font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/20"
              size="sm"
            >
              <LogIn className="w-4 h-4" />
              Sign in
            </Button>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-4px);
          }
        }
      `}</style>
    </header>
  );
}