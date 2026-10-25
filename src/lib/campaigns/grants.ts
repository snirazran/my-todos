import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { logFlyGrant, type FlySource } from '@/lib/economy/ledger';
import { grantPlusDays } from '@/lib/revenuecat';
import type { CampaignRewardGrant } from './types';

export type GrantSummary = { kind: string; id?: string; amount: number };

const CATALOG_ID = /^[\w-]+$/;

function planGrants(grants: CampaignRewardGrant[]) {
  const inc: Record<string, number> = {};
  const itemIds: string[] = [];
  const summary: GrantSummary[] = [];
  let flies = 0;
  let plusDays = 0;

  for (const grant of grants) {
    const amount = Math.floor(grant.amount);
    if (!(amount > 0)) continue;

    if (grant.kind === 'flies') {
      flies += amount;
      summary.push({ kind: 'flies', amount });
      continue;
    }
    if (grant.kind === 'plus_days') {
      plusDays += amount;
      summary.push({ kind: 'plus_days', amount });
      continue;
    }

    const id = (grant.id ?? '').trim();
    if (!id || !CATALOG_ID.test(id)) continue;

    if (grant.kind === 'background') {
      const key = `wardrobe.backgrounds.inventory.${id}`;
      inc[key] = (inc[key] ?? 0) + amount;
      summary.push({ kind: 'background', id, amount });
      continue;
    }

    const key = `wardrobe.inventory.${id}`;
    inc[key] = (inc[key] ?? 0) + amount;
    if (!itemIds.includes(id)) itemIds.push(id);
    summary.push({ kind: 'item', id, amount });
  }

  if (flies) inc['wardrobe.flies'] = flies;
  return { inc, itemIds, summary, flies, plusDays };
}

export async function applyGrants(
  userId: string,
  grants: CampaignRewardGrant[],
  ledger: {
    source: FlySource;
    occurrenceKey: string;
    dayKey: string;
    meta?: Record<string, unknown>;
  },
): Promise<{ summary: GrantSummary[]; flies: number }> {
  const plan = planGrants(grants);
  if (!plan.summary.length) return { summary: [], flies: 0 };

  await connectMongo();

  if (Object.keys(plan.inc).length) {
    const set: Record<string, unknown> = {};
    if (plan.itemIds.length) {
      const user = await UserModel.findById(userId)
        .select('wardrobe.inventoryHistory')
        .lean<{ wardrobe?: { inventoryHistory?: Record<string, unknown> } } | null>();
      const history = user?.wardrobe?.inventoryHistory ?? {};
      const stamp = new Date().toISOString();
      for (const id of plan.itemIds) {
        if (!history[id]) set[`wardrobe.inventoryHistory.${id}`] = stamp;
      }
    }

    const result = await UserModel.updateOne(
      { _id: userId },
      {
        $inc: plan.inc,
        ...(Object.keys(set).length ? { $set: set } : {}),
        ...(plan.itemIds.length
          ? { $addToSet: { 'wardrobe.unseenItems': { $each: plan.itemIds } } }
          : {}),
      },
    );
    if (result.matchedCount !== 1) throw new Error('User not found');
  }

  if (plan.flies > 0) {
    void logFlyGrant({
      userId,
      source: ledger.source,
      occurrenceKey: ledger.occurrenceKey,
      dayKey: ledger.dayKey,
      amount: plan.flies,
      meta: ledger.meta,
    });
  }

  if (plan.plusDays > 0) {
    try {
      await grantPlusDays(userId, plan.plusDays);
    } catch (error) {
      console.error('Plus days grant failed:', error);
    }
  }

  return { summary: plan.summary, flies: plan.flies };
}
