// components/SiteHeader.tsx
'use client';

import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Sparkles } from 'lucide-react';

export default function SiteHeader() {
  const { data: session, status } = useSession();

  // IMPORTANT: fixed height so pages can reserve space (mobile/desktop)
  // mobile: h-14 (=3.5rem), md: h-16 (=4rem)
  return (
    <header className="sticky top-0 z-50 w-full h-14 md:h-16 backdrop-blur-md">
      <div className="flex items-center justify-between h-full gap-4 px-6 py-3 mx-auto max-w-7xl md:px-10">
        {/* ───────── Logo ───────── */}
        <Link
          href="/"
          className="relative inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <span className="text-2xl font-extrabold tracking-tight text-transparent bg-gradient-to-r from-violet-400 via-fuchsia-500 to-purple-600 bg-clip-text">
            מה&nbsp;אומר?
          </span>
          <Sparkles
            className="h-5 w-5 text-fuchsia-500 animate-[float_3s_ease-in-out_infinite]"
            aria-hidden
          />
        </Link>

        {/* ───────── Auth button ───────── */}
        {status === 'loading' ? null : session ? (
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium transition rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            התנתק
          </button>
        ) : (
          <button
            onClick={() => signIn()}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white transition rounded-lg bg-violet-600 hover:bg-purple-700"
          >
            🔑 התחברות
          </button>
        )}
      </div>

      <div className="w-full h-px bg-gradient-to-r from-transparent via-fuchsia-500/40 to-transparent" />

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
