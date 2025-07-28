'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react'; // ← NEW
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();

  /* ───────── state ───────── */
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);

  /* ───────── helpers ───────── */
  const toggle1 = () => setShowPw(!showPw);
  const toggle2 = () => setShowPw2(!showPw2);

  /* ───────── submit ───────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerErr(null);

    /* local checks */
    if (pw !== pw2) {
      setServerErr('הסיסמאות אינן תואמות');
      return;
    }

    setSubmitting(true);

    try {
      /* 1️⃣  create the user */
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password: pw }),
      });

      if (!res.ok) {
        const { error, details } = await res.json().catch(() => ({}));
        setServerErr(
          error === 'Validation failed'
            ? Object.values(details ?? {})
                .flat()
                .join(' · ')
            : error || 'קרתה שגיאה – נסה שוב'
        );
        return;
      }

      /* 2️⃣  log‑in immediately */
      await signIn('credentials', {
        email,
        password: pw,
        redirect: true,
        callbackUrl: '/', // landing page after auto‑login
      });
      /* signIn handles the redirect – no router.push() needed */
    } catch {
      setServerErr('קרתה שגיאה – נסה שוב');
    } finally {
      setSubmitting(false);
    }
  };

  /* ───────── UI ───────── */
  return (
    <main className="flex items-center justify-center min-h-screen p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-[32rem] p-10 bg-white shadow-2xl dark:bg-slate-800 rounded-3xl">
        <h1 className="mb-8 text-3xl font-extrabold tracking-tight text-center text-slate-900 dark:text-white">
          הרשמה
        </h1>

        {serverErr && (
          <p className="mb-6 text-base font-medium text-center text-red-600">
            {serverErr}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <input
            placeholder="שם מלא"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-5 py-3 text-lg border rounded-xl focus:ring-2 focus:ring-purple-500 dark:bg-slate-700 dark:text-white"
          />

          <input
            type="email"
            placeholder="אימייל"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-5 py-3 text-lg border rounded-xl focus:ring-2 focus:ring-purple-500 dark:bg-slate-700 dark:text-white"
          />

          {/* password */}
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="סיסמה"
              required
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="w-full px-5 py-3 pr-12 text-lg border rounded-xl focus:ring-2 focus:ring-purple-500 dark:bg-slate-700 dark:text-white"
            />
            <button
              type="button"
              onClick={toggle1}
              className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-slate-500"
              tabIndex={-1}
            >
              {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {/* password confirmation */}
          <div className="relative">
            <input
              type={showPw2 ? 'text' : 'password'}
              placeholder="אישור סיסמה"
              required
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              className="w-full px-5 py-3 pr-12 text-lg border rounded-xl focus:ring-2 focus:ring-purple-500 dark:bg-slate-700 dark:text-white"
            />
            <button
              type="button"
              onClick={toggle2}
              className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-slate-500"
              tabIndex={-1}
            >
              {showPw2 ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 text-lg font-semibold text-white transition bg-violet-600 rounded-xl hover:bg-purple-700 disabled:opacity-50"
          >
            {submitting ? 'טוען…' : 'צור משתמש'}
          </button>
        </form>

        <p className="mt-8 text-base text-center text-slate-600 dark:text-slate-400">
          יש לך משתמש קיים?{' '}
          <Link
            href="/login"
            className="font-semibold text-purple-600 hover:underline"
          >
            התחבר כאן
          </Link>
        </p>
      </div>
    </main>
  );
}
