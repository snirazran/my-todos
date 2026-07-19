'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { installClientErrorReporter } from '@/lib/clientErrorReporter';
import { useAuth } from '@/components/auth/AuthContext';

export function ErrorReporter() {
  const { user } = useAuth();

  useEffect(() => {
    installClientErrorReporter();
  }, []);

  useEffect(() => {
    if (user) {
      Sentry.setUser({ id: user.uid, email: user.email ?? undefined });
    } else {
      Sentry.setUser(null);
    }
  }, [user]);

  return null;
}
