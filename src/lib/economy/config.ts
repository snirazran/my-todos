import connectMongo from '@/lib/mongoose';
import FlyEconomyConfigModel, {
  FLY_ECONOMY_CONFIG_ID,
} from '@/lib/models/FlyEconomyConfig';
import {
  FLY_ECONOMY_DEFAULTS,
  mergeFlyEconomyConfig,
  type FlyEconomyConfig,
} from './defaults';

export * from './defaults';

let cache: { at: number; value: FlyEconomyConfig } | null = null;
const CACHE_TTL_MS = 30_000;

export function invalidateFlyEconomyConfig() {
  cache = null;
}

export async function loadFlyEconomyConfig(): Promise<FlyEconomyConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    await connectMongo();
    const doc = await FlyEconomyConfigModel.findOne({
      configId: FLY_ECONOMY_CONFIG_ID,
    }).lean<{ settings?: unknown } | null>();
    const value = mergeFlyEconomyConfig(doc?.settings);
    cache = { at: Date.now(), value };
    return value;
  } catch (error) {
    console.error('Fly economy config load failed:', error);
    return FLY_ECONOMY_DEFAULTS;
  }
}

export function taskIncomeCap(config: FlyEconomyConfig, premium: boolean) {
  return premium
    ? config.taskIncome.dailyCapPlus
    : config.taskIncome.dailyCapFree;
}

export function friendsPondCap(config: FlyEconomyConfig, premium: boolean) {
  return premium
    ? config.friendsPond.dailyCapPlus
    : config.friendsPond.dailyCapFree;
}
