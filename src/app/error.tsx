'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { ErrorScene } from '@/components/ui/ErrorScene';

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
    <ErrorScene
      code="OOPS"
      title="The pond glitched."
      message="This page tripped on its way in. Nothing you saved was lost, and the crash was reported automatically — one more try usually clears it."
      primaryLabel="Try again"
      onPrimary={() => reset()}
      secondaryLabel="Take me home"
      secondaryHref="/"
      detail={error.digest}
    />
  );
}
