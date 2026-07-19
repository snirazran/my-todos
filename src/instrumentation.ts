import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
    return;
  }
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  await import('./sentry.server.config');
  const { startFrogodoroTicker } = await import('@/lib/frogodoroTicker');
  startFrogodoroTicker();
  const { startLoginStreakTicker } = await import('@/lib/streakTicker');
  startLoginStreakTicker();
  const { startCalendarSyncTicker } = await import('@/lib/calendarSyncTicker');
  startCalendarSyncTicker();
}

export const onRequestError = Sentry.captureRequestError;
