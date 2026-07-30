import connectMongo from '@/lib/mongoose';
import User from '@/lib/models/User';
import FlyPurchaseModel from '@/lib/models/FlyPurchase';
import { isAdminEmail } from '@/lib/adminAuth';
import type { CampaignAudience } from '@/lib/campaigns/eligibility';

type PlatformHint = string | null | undefined;

const normalizePlatform = (hint: PlatformHint): CampaignAudience['platform'] => {
  if (hint === 'ios' || hint === 'android' || hint === 'web') return hint;
  return 'unknown';
};

/** The segment facts every campaign targets against, in one round trip. */
export async function buildAudience(
  userId: string,
  platformHint: PlatformHint,
): Promise<CampaignAudience> {
  await connectMongo();
  const [user, paidCount] = await Promise.all([
    User.findById(userId).select('email createdAt premiumUntil wardrobe.flies').lean(),
    FlyPurchaseModel.countDocuments({ userId }),
  ]);

  const createdAt = user?.createdAt ? new Date(user.createdAt) : new Date();
  const daysSinceSignup = Math.max(
    0,
    Math.floor((Date.now() - createdAt.getTime()) / 86_400_000),
  );

  return {
    userId,
    platform: normalizePlatform(platformHint),
    balance: Number(user?.wardrobe?.flies ?? 0),
    hasPaid: paidCount > 0,
    isPlus: !!user?.premiumUntil && new Date(user.premiumUntil) > new Date(),
    daysSinceSignup,
    isAdmin: isAdminEmail(user?.email ?? null),
  };
}
