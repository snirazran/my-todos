export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startFrogodoroTicker } = await import('@/lib/frogodoroTicker');
  startFrogodoroTicker();
}
