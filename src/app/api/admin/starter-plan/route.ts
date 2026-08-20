import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import StarterPlanConfigModel, {
  STARTER_PLAN_CONFIG_ID,
} from '@/lib/models/StarterPlanConfig';
import {
  normalizeStarterPlanConfig,
  type StarterPlanConfig,
} from '@/lib/quests/starterPlan';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdminUserId();
    await connectMongo();
    const doc = await StarterPlanConfigModel.findOne({
      configId: STARTER_PLAN_CONFIG_ID,
    }).lean();
    return NextResponse.json({
      starterPlan: normalizeStarterPlanConfig(
        doc as Partial<StarterPlanConfig> | null,
      ),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdminUserId();
    await connectMongo();
    const body = await req.json();
    const config = normalizeStarterPlanConfig(
      body?.starterPlan as Partial<StarterPlanConfig> | undefined,
    );

    await StarterPlanConfigModel.updateOne(
      { configId: STARTER_PLAN_CONFIG_ID },
      { $set: { configId: STARTER_PLAN_CONFIG_ID, ...config } },
      { upsert: true },
    );

    return NextResponse.json({ ok: true, starterPlan: config });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not save starter plan',
      },
      { status: 400 },
    );
  }
}
