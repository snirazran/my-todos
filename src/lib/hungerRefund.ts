import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { recordHungerResolved } from '@/lib/analytics/hunger';

export async function refundLegacyStolenFlies(
  userId: string,
  user: { wardrobe?: { flies?: number; stolenFlies?: number } | null; premiumUntil?: Date | string | null },
): Promise<number> {
  const pending = user.wardrobe?.stolenFlies ?? 0;
  if (!user.wardrobe || !(pending > 0)) return 0;

  const res = await UserModel.updateOne(
    { _id: userId, 'wardrobe.stolenFlies': pending },
    { $inc: { 'wardrobe.flies': pending }, $set: { 'wardrobe.stolenFlies': 0 } },
  ).catch(() => null);
  const refunded = res?.modifiedCount === 1;

  const amount = refunded ? pending : 0;
  user.wardrobe.stolenFlies = 0;
  if (amount <= 0) return 0;
  user.wardrobe.flies = (user.wardrobe.flies ?? 0) + amount;

  const isPremium =
    !!user.premiumUntil && new Date(user.premiumUntil) > new Date();
  await Promise.all([
    recordAnalyticsEvent({
      userId,
      name: 'fly_earned',
      properties: { source: 'frog_hunger_refund', fly_amount: amount, is_premium: isPremium },
    }),
    recordHungerResolved({ userId, method: 'refund', flies: amount, isPremium }),
  ]);
  return amount;
}
