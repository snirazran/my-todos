import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import ReferralModel from '@/lib/models/Referral';
import UserModel from '@/lib/models/User';
import InviteConfigModel from '@/lib/models/InviteConfig';
import TaskBondModel from '@/lib/models/TaskBond';
import { ensureInviteConfig } from '@/lib/inviteConfig/defaults';
import { getFullCatalog, buildById } from '@/lib/skins/getCatalog';
import { createFriendship } from '@/lib/friends/code';
import { notifyFriendsChanged, notifyFriendUpdate } from '@/lib/taskSync';
import { createTasksForUser } from '@/app/api/tasks/route';
import { buildAcceptBody, repeatLabelFor } from '@/lib/buddy/bond';
import { getZonedToday } from '@/lib/utils';
import { sendBuddyPush, buddyDisplayName } from '@/lib/buddy/push';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUserId();

    let body: { code?: string; tz?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const code = (body.code || '').trim();
    const tz = body.tz || 'UTC';
    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

    await connectMongo();
    const referral = await ReferralModel.findOne({ code });
    if (!referral) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    if (referral.inviterId === userId) {
      return NextResponse.json(
        { error: "You can't claim your own invite" },
        { status: 400 },
      );
    }

    if (referral.claimedByUserId) {
      const alreadyMine = referral.claimedByUserId === userId;
      return NextResponse.json(
        alreadyMine
          ? { ok: true, alreadyClaimed: true }
          : { error: 'Invite already claimed' },
        { status: alreadyMine ? 200 : 409 },
      );
    }

    const catalog = await getFullCatalog();
    const byId = buildById(catalog);
    const gift = byId[referral.giftItemId];
    if (!gift) {
      return NextResponse.json({ error: 'Gift item missing from catalog' }, { status: 500 });
    }

    // Mark the referral claimed
    referral.claimedByUserId = userId;
    referral.claimedAt = new Date();
    await referral.save();

    // Claiming a gift invite makes the inviter and the new user mutual friends.
    await createFriendship(referral.inviterId, userId, 'invite');

    const inviter = await UserModel.findById(referral.inviterId)
      .select('name frogName')
      .lean<{ name?: string; frogName?: string }>();
    const inviterName = inviter?.frogName || inviter?.name || 'A friend';

    // Grant the gift to the new user
    const giftHistorySet =
      `wardrobe.inventoryHistory.${referral.giftItemId}` as const;
    await UserModel.updateOne(
      { _id: userId },
      {
        $inc: { [`wardrobe.inventory.${referral.giftItemId}`]: 1 },
        $addToSet: { 'wardrobe.unseenItems': referral.giftItemId },
        $setOnInsert: { [giftHistorySet]: new Date().toISOString() },
      },
      { upsert: false },
    );

    // Reward the inviter for this milestone (if any matches their new total)
    const claimedCount = await ReferralModel.countDocuments({
      inviterId: referral.inviterId,
      claimedByUserId: { $ne: null },
    });

    await ensureInviteConfig();
    const config = await InviteConfigModel.findOne({ key: 'singleton' }).lean();
    const tier = config?.rewards.find((r) => r.tier === claimedCount);

    if (tier) {
      const inc: Record<string, number> = {};
      const addToSet: Record<string, string> = {};
      const rewards = tier.rewards?.length
        ? tier.rewards
        : [
            ...(tier.flies && tier.flies > 0
              ? [{ type: 'FLIES' as const, amountMode: 'fixed' as const, amount: tier.flies }]
              : []),
            ...(tier.itemId ? [{ type: 'ITEM' as const, itemId: tier.itemId }] : []),
          ];

      for (const reward of rewards) {
        if (reward.type === 'FLIES') {
          const amount =
            reward.amountMode === 'random'
              ? Math.floor(
                  Math.random() *
                    (Math.max(reward.minAmount ?? 1, reward.maxAmount ?? 1) -
                      Math.max(1, reward.minAmount ?? 1) +
                      1),
                ) + Math.max(1, reward.minAmount ?? 1)
              : reward.amount ?? 0;
          if (amount > 0) inc['wardrobe.flies'] = (inc['wardrobe.flies'] ?? 0) + amount;
        }
        if ((reward.type === 'ITEM' || reward.type === 'BOX') && reward.itemId && byId[reward.itemId]) {
          const amount = reward.type === 'BOX' ? Math.max(1, reward.amount ?? 1) : 1;
          inc[`wardrobe.inventory.${reward.itemId}`] =
            (inc[`wardrobe.inventory.${reward.itemId}`] ?? 0) + amount;
          addToSet['wardrobe.unseenItems'] = reward.itemId;
        }
      }
      if (Object.keys(inc).length > 0 || Object.keys(addToSet).length > 0) {
        const update: any = {};
        if (Object.keys(inc).length) update.$inc = inc;
        if (Object.keys(addToSet).length) update.$addToSet = addToSet;
        await UserModel.updateOne({ _id: referral.inviterId }, update);
      }
    }

    void notifyFriendsChanged(userId);

    let buddyTaskResult: { text: string; partnerName: string } | null = null;
    if (referral.buddyTask?.text) {
      try {
        const params = referral.buddyTask;
        const bondId = uuid();
        const acceptBody = buildAcceptBody(params, tz);

        const fromResult = await createTasksForUser(
          referral.inviterId,
          acceptBody,
          tz,
          { bondId, buddyUserId: userId },
        );
        const toResult = await createTasksForUser(userId, acceptBody, tz, {
          bondId,
          buddyUserId: referral.inviterId,
        });

        if (fromResult.ok && toResult.ok) {
          await TaskBondModel.create({
            bondId,
            invitedBy: referral.inviterId,
            fromUserId: referral.inviterId,
            toUserId: userId,
            status: 'active',
            initialText: params.text,
            createParams: params,
            repeatLabel: repeatLabelFor(params),
            taskFromId: fromResult.repeatGroupId ?? fromResult.ids[0],
            taskToId: toResult.repeatGroupId ?? toResult.ids[0],
            activeSince: getZonedToday(tz),
          });

          buddyTaskResult = { text: params.text, partnerName: inviterName };

          void notifyFriendUpdate(referral.inviterId);
          void buddyDisplayName(userId).then((name) =>
            sendBuddyPush(referral.inviterId, {
              title: 'Goal Buddy 🐸',
              body: `${name} joined — you're sharing "${params.text}" now!`,
              path: '/planner',
              type: 'buddy_accepted',
            }),
          );
        }
      } catch {
        /* buddy task is best-effort; gift + friendship already succeeded */
      }
    }

    return NextResponse.json({
      ok: true,
      gift,
      inviterId: referral.inviterId,
      inviterName,
      buddyTask: buddyTaskResult,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to claim' },
      { status: 500 },
    );
  }
}
