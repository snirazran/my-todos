'use client';

import { useEffect } from 'react';
import { installClientErrorReporter } from '@/lib/clientErrorReporter';

export function ErrorReporter() {
  useEffect(() => {
    installClientErrorReporter();
  }, []);
  return null;
}
