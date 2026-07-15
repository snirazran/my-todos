import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestSeasonAutoConfigModel, {
  SEASON_AUTO_CONFIG_ID,
  SEASON_AUTO_TARGET_MIN,
  SEASON_AUTO_TARGET_MAX,
} from '@/lib/models/QuestSeasonAutoConfig';

function clampTarget(value: number) {
  return Math.min(
    SEASON_AUTO_TARGET_MAX,
    Math.max(SEASON_AUTO_TARGET_MIN, Math.floor(value)),
  );
}

function configToView(
  config: { isActive?: boolean; dailyTargetFlies?: number } | null,
) {
  return {
    isActive: config?.isActive ?? false,
    dailyTargetFlies: clampTarget(config?.dailyTargetFlies ?? 3),
    limits: { min: SEASON_AUTO_TARGET_MIN, max: SEASON_AUTO_TARGET_MAX },
  };
}

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    const config = await QuestSeasonAutoConfigModel.findOne({
      configId: SEASON_AUTO_CONFIG_ID,
    }).lean();
    return NextResponse.json({ seasonAuto: configToView(config) });
  } catch (error) {
    console.error('Failed to load season auto config:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load season auto config',
      },
      { status: 400 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();
    const body = await req.json();

    const isActive = body?.isActive === true;
    const dailyTargetFlies = clampTarget(Number(body?.dailyTargetFlies) || 3);

    await connectMongo();
    const config = await QuestSeasonAutoConfigModel.findOneAndUpdate(
      { configId: SEASON_AUTO_CONFIG_ID },
      { $set: { isActive, dailyTargetFlies } },
      { new: true, upsert: true },
    ).lean();

    return NextResponse.json({ seasonAuto: configToView(config) });
  } catch (error) {
    console.error('Failed to save season auto config:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to save season auto config',
      },
      { status: 400 },
    );
  }
}
