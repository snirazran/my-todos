import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import ShieldConfigModel, {
  SHIELD_CONFIG_ID,
  SHIELD_DEFAULTS,
  CAP_MIN,
  CAP_MAX,
} from '@/lib/models/ShieldConfig';
import { loadShieldConfig } from '@/lib/shields/engine';

export const dynamic = 'force-dynamic';

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

async function respond() {
  const config = await loadShieldConfig();
  return NextResponse.json({
    shields: { ...config, limits: { capMin: CAP_MIN, capMax: CAP_MAX } },
  });
}

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    return await respond();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load shield config',
      },
      { status: 400 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();
    await connectMongo();

    await ShieldConfigModel.findOneAndUpdate(
      { configId: SHIELD_CONFIG_ID },
      {
        $set: {
          isActive: body?.isActive !== false,
          priceFlies: clamp(
            body?.priceFlies,
            SHIELD_DEFAULTS.priceFlies,
            1,
            100_000,
          ),
          twoPackPriceFlies: clamp(
            body?.twoPackPriceFlies,
            SHIELD_DEFAULTS.twoPackPriceFlies,
            1,
            200_000,
          ),
          capFree: clamp(
            body?.capFree,
            SHIELD_DEFAULTS.capFree,
            CAP_MIN,
            CAP_MAX,
          ),
          capPlus: clamp(
            body?.capPlus,
            SHIELD_DEFAULTS.capPlus,
            CAP_MIN,
            CAP_MAX,
          ),
          plusMonthlyGrant: clamp(
            body?.plusMonthlyGrant,
            SHIELD_DEFAULTS.plusMonthlyGrant,
            0,
            CAP_MAX,
          ),
          rescueCooldownDays: clamp(
            body?.rescueCooldownDays,
            SHIELD_DEFAULTS.rescueCooldownDays,
            0,
            365,
          ),
          offerCooldownDays: clamp(
            body?.offerCooldownDays,
            SHIELD_DEFAULTS.offerCooldownDays,
            1,
            365,
          ),
          offerMinStreak: clamp(
            body?.offerMinStreak,
            SHIELD_DEFAULTS.offerMinStreak,
            1,
            365,
          ),
          earnEveryPactWeeks: clamp(
            body?.earnEveryPactWeeks,
            SHIELD_DEFAULTS.earnEveryPactWeeks,
            0,
            52,
          ),
        },
      },
      { new: true, upsert: true },
    ).lean();

    return await respond();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to save shield config',
      },
      { status: 400 },
    );
  }
}
