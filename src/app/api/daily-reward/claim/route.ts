import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getRewardForDay, getCurrentMonthKey } from '@/lib/dailyRewards';

export async function POST(request: Request) {
  try {
    const { uid } = await requireAuth();
    const { day } = await request.json();

    if (!day || typeof day !== 'number') {
      return NextResponse.json({ error: 'Invalid day' }, { status: 400 });
    }

    await dbConnect();
    const user = await UserModel.findById(uid);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentMonth = getCurrentMonthKey();
    const currentDayOfMonth = new Date().getDate();

    // Verify it is actually today (or strict enforcement)
    // For now, let's enforce that you can only claim "Today's" reward
    // OR allow claiming past days if we want "catchup"?
    // The requirement said: "needs to log in that specific date to get that day gift"
    // So if today is the 16th, they can only claim day 16.
    if (day !== currentDayOfMonth) {
      return NextResponse.json(
        { error: 'Can only claim rewards for the current date' },
        { status: 403 },
      );
    }

    let userRewards = user.dailyRewards;

    // Initialize if missing or new month
    if (!userRewards || userRewards.month !== currentMonth) {
      userRewards = {
        lastClaimDate: null,
        claimedDays: [],
        month: currentMonth,
        streak: 0,
      };
    }

    if (userRewards.claimedDays.includes(day)) {
      return NextResponse.json(
        { error: 'Reward already claimed for this day' },
        { status: 400 },
      );
    }

    const rewardDef = getRewardForDay(day);
    if (!rewardDef) {
      return NextResponse.json(
        { error: 'No reward found for this day' },
        { status: 404 },
      );
    }

    const isPremium = user.premiumUntil
      ? new Date(user.premiumUntil) > new Date()
      : false;

    // Grant rewards
    // Always grant free
    const rewardsToGrant = [rewardDef.free];
    if (isPremium) {
      rewardsToGrant.push(rewardDef.premium);
    }

    // Apply changes to user object (in memory then save)
    let fliesAdded = 0;
    const itemsAdded: string[] = [];

    // Ensure wardrobe exists
    if (!user.wardrobe)
      user.wardrobe = {
        equipped: {},
        inventory: {},
        unseenItems: [],
        flies: 0,
      };
    if (!user.wardrobe.inventory) user.wardrobe.inventory = {};
    if (!user.wardrobe.flies) user.wardrobe.flies = 0;

    for (const reward of rewardsToGrant) {
      if (reward.type === 'FLIES') {
        user.wardrobe.flies += reward.amount || 0;
        fliesAdded += reward.amount || 0;
      } else if (reward.type === 'ITEM' || reward.type === 'BOX') {
        const itemId = reward.itemId;
        if (itemId) {
          user.wardrobe.inventory[itemId] =
            (user.wardrobe.inventory[itemId] || 0) + 1;
          itemsAdded.push(itemId);
          // track unseen?
        }
      }
    }

    // Update stats
    userRewards.claimedDays.push(day);
    userRewards.lastClaimDate = new Date();
    user.dailyRewards = userRewards;

    // Use markModified for mixed types if necessary, though direct assignment usually works
    user.markModified('wardrobe');
    user.markModified('dailyRewards');

    await user.save();

    return NextResponse.json({
      success: true,
      rewards: {
        flies: fliesAdded,
        items: itemsAdded,
      },
      dailyRewards: userRewards,
    });
  } catch (error) {
    console.error('Error claiming daily reward:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
