import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { economyWeekKey } from './guards';
import { loadFlyEconomyConfig, type FlyEconomyConfig } from './config';

export type OverflowJar = {
  pebbles: number;
  weekKey: string;
  giftsThisWeek: number;
  lifetimePebbles: number;
  lifetimeGifts: number;
};

export type JarAccrual = {
  jar: OverflowJar;
  pebblesAdded: number;
  giftsEarned: number;
  giftItemId: string;
  /** Pebbles still needed for the next gift, once the weekly allowance allows one. */
  pebblesToNextGift: number;
  weeklyGiftLocked: boolean;
};

export function emptyJar(weekKey: string): OverflowJar {
  return {
    pebbles: 0,
    weekKey,
    giftsThisWeek: 0,
    lifetimePebbles: 0,
    lifetimeGifts: 0,
  };
}

export function normalizeJar(
  jar: Partial<OverflowJar> | undefined,
  weekKey: string,
): OverflowJar {
  if (!jar) return emptyJar(weekKey);
  const sameWeek = jar.weekKey === weekKey;
  return {
    // Pebbles carry across weeks; only the gift allowance resets.
    pebbles: Math.max(0, Math.floor(Number(jar.pebbles) || 0)),
    weekKey,
    giftsThisWeek: sameWeek
      ? Math.max(0, Math.floor(Number(jar.giftsThisWeek) || 0))
      : 0,
    lifetimePebbles: Math.max(0, Math.floor(Number(jar.lifetimePebbles) || 0)),
    lifetimeGifts: Math.max(0, Math.floor(Number(jar.lifetimeGifts) || 0)),
  };
}

/**
 * Drop pebbles in the jar and cash out whatever full gifts the week still
 * allows. Pebbles above the weekly allowance are kept, not burned — the jar's
 * job is to make an over-productive day feel earned later, not to void it.
 */
export function jarAfterPebbles(
  jar: OverflowJar,
  pebbles: number,
  config: FlyEconomyConfig,
): { jar: OverflowJar; giftsEarned: number } {
  const added = Math.floor(pebbles);
  const next: OverflowJar = {
    ...jar,
    pebbles: Math.max(0, jar.pebbles + added),
    lifetimePebbles: jar.lifetimePebbles + Math.max(0, added),
  };

  const perGift = Math.max(1, config.overflowJar.pebblesPerGift);
  const weeklyRemaining = Math.max(
    0,
    config.overflowJar.giftsPerWeek - next.giftsThisWeek,
  );
  // A withdrawal only ever takes pebbles back out; it never mints a gift.
  const giftsEarned =
    added <= 0
      ? 0
      : Math.min(weeklyRemaining, Math.floor(next.pebbles / perGift));

  if (giftsEarned > 0) {
    next.pebbles -= giftsEarned * perGift;
    next.giftsThisWeek += giftsEarned;
    next.lifetimeGifts += giftsEarned;
  }

  return { jar: next, giftsEarned };
}

export function jarView(
  jar: OverflowJar,
  config: FlyEconomyConfig,
): Pick<JarAccrual, 'pebblesToNextGift' | 'weeklyGiftLocked'> {
  const perGift = Math.max(1, config.overflowJar.pebblesPerGift);
  return {
    pebblesToNextGift: Math.max(0, perGift - (jar.pebbles % perGift)),
    weeklyGiftLocked: jar.giftsThisWeek >= config.overflowJar.giftsPerWeek,
  };
}

/**
 * Persist an accrual. The jar's pebble count is used as the compare-and-set
 * token so two completions landing at once can't mint the same gift twice.
 */
export async function accrueOverflowPebbles(args: {
  userId: string;
  dayKey: string;
  pebbles: number;
  meta?: Record<string, unknown>;
}): Promise<JarAccrual | null> {
  const config = await loadFlyEconomyConfig();
  if (!config.overflowJar.enabled) return null;

  const pebbles = Math.floor(args.pebbles);
  if (!pebbles) return null;
  const weekKey = economyWeekKey(args.dayKey);

  await connectMongo();
  const user = await UserModel.findById(args.userId)
    .select('wardrobe.overflowJar')
    .lean<{ wardrobe?: { overflowJar?: Partial<OverflowJar> } } | null>();
  if (!user) return null;

  const current = normalizeJar(user.wardrobe?.overflowJar, weekKey);
  const { jar, giftsEarned } = jarAfterPebbles(current, pebbles, config);

  const set: Record<string, unknown> = { 'wardrobe.overflowJar': jar };
  const inc: Record<string, number> = {};
  const push: Record<string, unknown> = {};
  const giftItemId = config.overflowJar.giftItemId;

  if (giftsEarned > 0) {
    inc[`wardrobe.inventory.${giftItemId}`] = giftsEarned;
    push['wardrobe.unseenItems'] = giftItemId;
  }

  const applied = await UserModel.updateOne(
    {
      _id: args.userId,
      $or: [
        { 'wardrobe.overflowJar.pebbles': current.pebbles },
        { 'wardrobe.overflowJar': { $exists: false } },
      ],
    },
    {
      $set: set,
      ...(Object.keys(inc).length ? { $inc: inc } : {}),
      ...(Object.keys(push).length ? { $addToSet: push } : {}),
    },
  );

  if (applied.modifiedCount === 0) return null;

  if (giftsEarned > 0) {
    void recordAnalyticsEvent({
      userId: args.userId,
      name: 'overflow_jar_gift',
      properties: {
        gifts: giftsEarned,
        gift_item_id: giftItemId,
        day_key: args.dayKey,
        ...(args.meta ?? {}),
      },
    }).catch(() => {});
  }

  return {
    jar,
    pebblesAdded: pebbles,
    giftsEarned,
    giftItemId,
    ...jarView(jar, config),
  };
}

export async function readOverflowJar(userId: string, dayKey: string) {
  const config = await loadFlyEconomyConfig();
  await connectMongo();
  const user = await UserModel.findById(userId)
    .select('wardrobe.overflowJar')
    .lean<{ wardrobe?: { overflowJar?: Partial<OverflowJar> } } | null>();
  const jar = normalizeJar(user?.wardrobe?.overflowJar, economyWeekKey(dayKey));
  return {
    ...jar,
    ...jarView(jar, config),
    pebblesPerGift: config.overflowJar.pebblesPerGift,
    giftsPerWeek: config.overflowJar.giftsPerWeek,
    giftItemId: config.overflowJar.giftItemId,
    enabled: config.overflowJar.enabled,
  };
}
