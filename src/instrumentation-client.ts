import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration(),
    Sentry.feedbackIntegration({
      autoInject: false,
      showBranding: false,
      colorScheme: 'system',
    }),
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
