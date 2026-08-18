export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskModel from '@/lib/models/Task';
import TaskBondModel from '@/lib/models/TaskBond';
import UserModel from '@/lib/models/User';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import { equippedToIndices, type FrogIndices } from '@/lib/friends/indices';
import { isOneTimeParams } from '@/lib/buddy/bond';
import { loadFlyEconomyConfig } from '@/lib/economy/config';

export type BuddyTaskState = {
  bondId: string;
  /** 'pending' = invite sent, waiting on the partner; 'active' = shared. */
  status: 'pending' | 'active';
  /** True when this user sent the invite (so they can cancel it). */
  invitedByMe: boolean;
  /** When a pending invite expires (ISO), if it has a deadline. */
  expiresAt: string | null;
  partnerName: string;
  partnerInitial: string;
  partnerIndices: FrogIndices;
  /** One-time bonds book their single occurrence under a key, not a date. */
  oneTime: boolean;
  partnerCompletedDates: string[];
  streak: number;
  pendingRepeatChange: { requestedByMe: boolean } | null;
};

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();
    const bondedTasks = await TaskModel.find({
      userId,
      bondId: { $exists: true, $ne: null },
    })
      .select('id bondId buddyUserId')
      .lean<{ id: string; bondId: string; buddyUserId?: string }[]>();

    const config = await loadFlyEconomyConfig();
    const bonusFlies = config.buddy.bonusFlies;

    if (bondedTasks.length === 0)
      return NextResponse.json({ byTaskId: {}, bonusFlies });

    const bondIds = Array.from(new Set(bondedTasks.map((t) => t.bondId)));
    const partnerIds = Array.from(
      new Set(bondedTasks.map((t) => t.buddyUserId).filter(Boolean) as string[]),
    );

    const [bonds, partners, catalog] = await Promise.all([
      TaskBondModel.find({
        bondId: { $in: bondIds },
        status: { $in: ['active', 'pending'] },
      }).lean(),
      UserModel.find({ _id: { $in: partnerIds } })
        .select('name frogName wardrobe.equipped')
        .lean<
          {
            _id: string;
            name?: string;
            frogName?: string;
            wardrobe?: { equipped?: Partial<Record<string, string | null>> };
          }[]
        >(),
      getCachedCatalog(),
    ]);

    const byId = buildById(catalog);
    const bondById = new Map(bonds.map((b) => [b.bondId, b]));
    const partnerById = new Map(partners.map((p) => [p._id, p]));

    const byTaskId: Record<string, BuddyTaskState> = {};
    for (const t of bondedTasks) {
      const bond = bondById.get(t.bondId);
      if (!bond) continue;
      const partner = t.buddyUserId ? partnerById.get(t.buddyUserId) : undefined;
      const name = partner?.name || partner?.frogName || 'Friend';
      const iAmFrom = bond.fromUserId === userId;
      const pending = bond.status === 'pending';
      if (pending && bond.expiresAt && new Date(bond.expiresAt) <= new Date())
        continue;
      byTaskId[t.id] = {
        bondId: bond.bondId,
        status: pending ? 'pending' : 'active',
        invitedByMe: bond.invitedBy === userId,
        expiresAt: bond.expiresAt ? new Date(bond.expiresAt).toISOString() : null,
        partnerName: name,
        partnerInitial: name.charAt(0).toUpperCase() || '?',
        partnerIndices: equippedToIndices(partner?.wardrobe?.equipped, byId),
        oneTime: isOneTimeParams(bond.createParams),
        partnerCompletedDates: iAmFrom ? bond.completedTo : bond.completedFrom,
        streak: bond.streak?.count ?? 0,
        pendingRepeatChange: bond.pendingRepeatChange
          ? { requestedByMe: bond.pendingRepeatChange.requestedBy === userId }
          : null,
      };
    }

    return NextResponse.json({ byTaskId, bonusFlies });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load buddy state' },
      { status: 500 },
    );
  }
}
