import connectMongo from '@/lib/mongoose';

type GlobalWithFrogodoroJobs = typeof globalThis & {
  frogodoroDelayedJobs?: Map<string, ReturnType<typeof setTimeout>>;
};

function getJobs() {
  const g = globalThis as GlobalWithFrogodoroJobs;
  if (!g.frogodoroDelayedJobs) g.frogodoroDelayedJobs = new Map();
  return g.frogodoroDelayedJobs;
}

function clearUserJobs(userId: string) {
  const jobs = getJobs();
  Array.from(jobs.entries()).forEach(([key, timeout]) => {
    if (key.startsWith(`${userId}:`)) {
      clearTimeout(timeout);
      jobs.delete(key);
    }
  });
}

export function cancelFrogodoroTimerProcessing(userId: string) {
  clearUserJobs(userId);
}

export function scheduleFrogodoroTimerProcessing(opts: {
  userId: string;
  endsAt: string | null | undefined;
}) {
  clearUserJobs(opts.userId);

  if (!opts.endsAt) return;

  const endMs = new Date(opts.endsAt).getTime();
  if (!Number.isFinite(endMs)) return;

  const delayMs = endMs - Date.now();
  if (delayMs <= 0) return;

  const key = `${opts.userId}:${opts.endsAt}`;
  const timeout = setTimeout(() => {
    getJobs().delete(key);
    void connectMongo()
      .then(() => import('@/lib/frogodoroTimerProcessor'))
      .then(({ processDueFrogodoroTimers }) => processDueFrogodoroTimers())
      .catch((err) => {
        console.error('Timer processor failed:', err);
      });
  }, delayMs);

  getJobs().set(key, timeout);
}
