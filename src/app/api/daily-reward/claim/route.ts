import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import UserModel from '@/lib/models/User';
import { getRewardForDay, getCurrentMonthKey } from '@/lib/dailyRewards';
import { recordAnalyticsEvent } from '@/lib/analytics/server';

export async function POST(request: Request) {
  try {
    const { uid } = await requireAuth();
    const { day, timezone } = await request.json();

    if (!day || typeof day !== 'number') {
      return NextResponse.json({ error: 'Invalid day' }, { status: 400 });
    }

    await dbConnect();
    const user = await UserModel.findById(uid);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Use the client's timezone to determine the current day/month
    const now = new Date();
    let currentDayOfMonth: number;
    let currentMonth: string;
    try {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const parts = fmt.formatToParts(now);
      const y = parts.find((p) => p.type === 'year')!.value;
      const m = parts.find((p) => p.type === 'month')!.value;
      const d = parts.find((p) => p.type === 'day')!.value;
      currentDayOfMonth = parseInt(d, 10);
      currentMonth = `${y}-${m}`;
    } catch {
      currentDayOfMonth = now.getDate();
      currentMonth = getCurrentMonthKey();
    }

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

          // Record history if not already present
          if (!user.wardrobe.inventoryHistory) {
            user.wardrobe.inventoryHistory = {};
          }
          if (!user.wardrobe.inventoryHistory[itemId]) {
            user.wardrobe.inventoryHistory[itemId] = new Date().toISOString();
          }

          // Add to unseen
          if (!user.wardrobe.unseenItems) user.wardrobe.unseenItems = [];
          if (!user.wardrobe.unseenItems.includes(itemId)) {
            user.wardrobe.unseenItems.push(itemId);
          }
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

    await recordAnalyticsEvent({
      userId: uid,
      name: 'daily_reward_claimed',
      properties: {
        reward_type: itemsAdded.length > 0 && fliesAdded > 0 ? 'mixed' : itemsAdded.length > 0 ? 'item' : 'flies',
        reward_day: day,
        reward_amount: fliesAdded,
        reward_count: itemsAdded.length,
        premium_reward_included: isPremium,
        is_premium: isPremium,
      },
    });
    if (fliesAdded > 0) {
      await recordAnalyticsEvent({
        userId: uid,
        name: 'fly_earned',
        properties: { source: 'daily_reward', fly_amount: fliesAdded, is_premium: isPremium },
      });
    }

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
