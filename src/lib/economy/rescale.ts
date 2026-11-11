import mongoose from 'mongoose';
import connectMongo from '@/lib/mongoose';
import { invalidateFlyEconomyConfig } from '@/lib/economy/config';
import { clearLeapConfigCache } from '@/lib/leap/config';
import { invalidateCatalogCache } from '@/lib/skins/getCatalog';
import { runEconomyRescale, type RescaleReport } from './rescaleCore';
import { buildRescaleTargets } from './rescaleTargets';

async function run(dryRun: boolean): Promise<RescaleReport> {
  await connectMongo();
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database is not connected');
  const report = await runEconomyRescale(db, buildRescaleTargets(), { dryRun });
  if (!dryRun && !report.alreadyDone) {
    invalidateFlyEconomyConfig();
    clearLeapConfigCache();
    invalidateCatalogCache();
    console.log('[economy-rescale] applied', JSON.stringify(report.steps));
  }
  return report;
}

let pending: Promise<RescaleReport> | null = null;

export function ensureEconomyScale(): Promise<RescaleReport> {
  if (!pending) {
    pending = run(false).catch((error) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}

export function previewEconomyScale(): Promise<RescaleReport> {
  return run(true);
}
