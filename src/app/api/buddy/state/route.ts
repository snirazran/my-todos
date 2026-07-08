export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskModel from '@/lib/models/Task';
import TaskBondModel from '@/lib/models/TaskBond';
import UserModel from '@/lib/models/User';
import { getCachedCatalog, buildById } from '@/lib/skins/getCatalog';
import { equippedToIndices, type FrogIndices } from '@/lib/friends/indices';

export type BuddyTaskState = {
  bondId: string;
  partnerName: string;
  partnerInitial: string;
  partnerIndices: FrogIndices;
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

    if (bondedTasks.length === 0) return NextResponse.json({ byTaskId: {} });

    const bondIds = Array.from(new Set(bondedTasks.map((t) => t.bondId)));
    const partnerIds = Array.from(
      new Set(bondedTasks.map((t) => t.buddyUserId).filter(Boolean) as string[]),
    );

    const [bonds, partners, catalog] = await Promise.all([
      TaskBondModel.find({ bondId: { $in: bondIds }, status: 'active' }).lean(),
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
      byTaskId[t.id] = {
        bondId: bond.bondId,
        partnerName: name,
        partnerInitial: name.charAt(0).toUpperCase() || '?',
        partnerIndices: equippedToIndices(partner?.wardrobe?.equipped, byId),
        partnerCompletedDates: iAmFrom ? bond.completedTo : bond.completedFrom,
        streak: bond.streak?.count ?? 0,
        pendingRepeatChange: bond.pendingRepeatChange
          ? { requestedByMe: bond.pendingRepeatChange.requestedBy === userId }
          : null,
      };
    }

    return NextResponse.json({ byTaskId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load buddy state' },
      { status: 500 },
    );
  }
}
