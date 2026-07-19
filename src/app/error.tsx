'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-lg font-semibold">Something went wrong</p>
      <p className="text-sm text-muted-foreground">
        The error was reported automatically. Try again — if it keeps
        happening, restart the app.
      </p>
      <button
        onClick={() => reset()}
        className="rounded-full bg-emerald-600 px-6 py-2.5 font-semibold text-white active:scale-95"
      >
        Try again
      </button>
    </div>
  );
}
