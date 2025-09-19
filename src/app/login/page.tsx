'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/* tiny helper */
const mailRx = /^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/;

export default function LoginPage() {
  const router = useRouter();

  /* form state */
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /* validation & server errors */
  const [errs, setErrs] = useState<{
    email?: string;
    password?: string;
    server?: string;
  }>({});

  /* -------------- submit -------------- */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrs: typeof errs = {};

    /* 1️⃣ client-side validation (EN) */
    if (!email.trim()) nextErrs.email = 'Email is required';
    else if (!mailRx.test(email)) nextErrs.email = 'Invalid email address';

    if (!password) nextErrs.password = 'Password is required';
    else if (password.length < 8) nextErrs.password = 'At least 8 characters';

    setErrs(nextErrs);
    if (Object.keys(nextErrs).length) return;

    /* 2️⃣ sign-in */
    setSubmitting(true);
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    setSubmitting(false);

    if (res?.ok) return router.push('/');

    /* 3️⃣ server-side errors (EN) */
    if (res?.error === 'CredentialsSignin') {
      setErrs({ server: 'Incorrect email or password' });
    } else {
      setErrs({ server: 'An error occurred — please try again' });
    }
  };

  /* -------------- UI -------------- */
  return (
    <main className="flex items-center justify-center min-h-screen p-4 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-[32rem] p-10 bg-white shadow-2xl dark:bg-slate-800 rounded-3xl">
        <h1 className="mb-8 text-3xl font-extrabold tracking-tight text-center text-slate-900 dark:text-white">
          Sign in
        </h1>

        {errs.server && (
          <p className="mb-6 text-base font-medium text-center text-red-600">
            {errs.server}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* email */}
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 py-3 text-lg border rounded-xl focus:ring-2 focus:ring-purple-500 dark:bg-slate-700 dark:text-white"
            />
            {errs.email && <FieldError msg={errs.email} />}
          </div>

          {/* password */}
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-5 py-3 text-lg border rounded-xl focus:ring-2 focus:ring-purple-500 dark:bg-slate-700 dark:text-white"
            />
            {errs.password && <FieldError msg={errs.password} />}
          </div>

          {/* submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 text-lg font-semibold text-white transition bg-violet-600 rounded-xl hover:bg-purple-700 disabled:opacity-50"
          >
            {submitting ? 'Loading…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-8 text-base text-center text-slate-600 dark:text-slate-400">
          Don&apos;t have an account?{' '}
          <Link
            href="/register"
            className="font-semibold text-purple-600 hover:underline"
          >
            Sign up here
          </Link>
        </p>
      </div>
    </main>
  );
}

/* small helper component */
function FieldError({ msg }: { msg: string }) {
  return <p className="mt-1 text-sm font-medium text-red-600">{msg}</p>;
}
