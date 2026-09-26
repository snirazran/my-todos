import UserModel from '@/lib/models/User';
import { recordAnalyticsEvent } from '@/lib/analytics/server';
import { recordHungerResolved } from '@/lib/analytics/hunger';

export async function refundLegacyStolenFlies(
  userId: string,
  user: { wardrobe?: { flies?: number; stolenFlies?: number } | null; premiumUntil?: Date | string | null },
): Promise<number> {
  const pending = user.wardrobe?.stolenFlies ?? 0;
  if (!user.wardrobe || !(pending > 0)) return 0;

  const before = await UserModel.findOneAndUpdate(
    { _id: userId, 'wardrobe.stolenFlies': { $gt: 0 } },
    [
      {
        $set: {
          'wardrobe.flies': {
            $add: [
              { $ifNull: ['$wardrobe.flies', 0] },
              { $ifNull: ['$wardrobe.stolenFlies', 0] },
            ],
          },
          'wardrobe.stolenFlies': 0,
        },
      },
    ],
    { new: false, projection: { 'wardrobe.stolenFlies': 1 } },
  ).lean<{ wardrobe?: { stolenFlies?: number } }>();

  const amount = before?.wardrobe?.stolenFlies ?? 0;
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
