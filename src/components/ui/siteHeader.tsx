// components/SiteHeader.tsx
'use client';

import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';

export default function SiteHeader() {
  const { data: session, status } = useSession(); // status === "loading" while we hydrate

  return (
    <header className="flex items-center justify-between w-full px-10 py-3 bg-white shadow-sm dark:bg-slate-800">
      {/* ───── Logo (always links home) ───── */}
      <Link
        href="/"
        className="text-2xl font-extrabold tracking-tight text-purple-600 transition hover:text-purple-700"
      >
        מה&nbsp;אומר?
      </Link>

      {/* ───── Right‑hand auth button ───── */}
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
          className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white transition bg-purple-600 rounded-lg hover:bg-purple-700"
        >
          🔑 התחברות
        </button>
      )}
    </header>
  );
}
