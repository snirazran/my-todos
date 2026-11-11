const RETRY_MS = 30_000;

type GlobalWithEconomyScale = typeof globalThis & {
  economyScaleStart?: Promise<void>;
};

export function startEconomyScale(): Promise<void> {
  const g = globalThis as GlobalWithEconomyScale;
  if (g.economyScaleStart) return g.economyScaleStart;

  const attempt = async (): Promise<void> => {
    try {
      const { ensureEconomyScale } = await import('@/lib/economy/rescale');
      await ensureEconomyScale();
    } catch (err) {
      console.error('Economy rescale failed, retrying:', err);
      const timer = setTimeout(() => void attempt(), RETRY_MS);
      if (typeof timer.unref === 'function') timer.unref();
    }
  };

  g.economyScaleStart = attempt();
  return g.economyScaleStart;
}
