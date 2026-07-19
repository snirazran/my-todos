'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 32,
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#0e1612',
          color: '#fff',
        }}
      >
        <p style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            border: 'none',
            borderRadius: 9999,
            background: '#059669',
            color: '#fff',
            padding: '10px 24px',
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
