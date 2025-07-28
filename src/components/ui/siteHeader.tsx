// components/SiteHeader.tsx
'use client';

import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';
import { Sparkles } from 'lucide-react';

export default function SiteHeader() {
  const { data: session, status } = useSession();

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-6 py-3 mx-auto max-w-7xl md:px-10">
        {/* ───────── Logo ───────── */}
        <Link
          href="/"
          className="relative inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          {/* richer purple gradient */}
          <span className="text-2xl font-extrabold tracking-tight text-transparent bg-gradient-to-r from-violet-400 via-fuchsia-500 to-purple-600 bg-clip-text">
            מה&nbsp;אומר?
          </span>

          {/* sparkle hue adjusted */}
          <Sparkles
            className="h-5 w-5 text-fuchsia-500 animate-[float_3s_ease-in-out_infinite]"
            aria-hidden
          />

          {/* animated underline in matching hues */}
        </Link>

        {/* ───────── Auth button (unchanged) ───────── */}
        {status === 'loading' ? null : session ? (
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium transition rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            🚪 התנתקות
          </button>
        ) : (
          <button
            onClick={() => signIn()}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white transition bg-violet-600 rounded-lg hover:bg-purple-700"
          >
            🔑 התחברות
          </button>
        )}
      </div>

      {/* subtle gradient border under header */}
      <div className="w-full h-px bg-gradient-to-r from-transparent via-fuchsia-500/40 to-transparent" />

      {/* keyframes */}
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
        @keyframes logo-line {
          0% {
            transform: translateX(-100%);
          }
          60% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </header>
  );
}
