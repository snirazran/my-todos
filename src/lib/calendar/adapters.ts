import type { ProviderAdapter } from './engine';

export async function getAdapters(): Promise<Record<string, ProviderAdapter>> {
  const { googleAdapter } = await import('./google/adapter');
  const { appleAdapter } = await import('./apple/adapter');
  return { google: googleAdapter, apple: appleAdapter };
}
