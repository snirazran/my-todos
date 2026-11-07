import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import { loadMilestoneConfig, saveMilestoneConfig } from '@/lib/quests/milestonesServer';
import { DEFAULT_MILESTONE_CONFIG } from '@/lib/quests/milestones';

export async function GET() {
  try {
    await requireAdminUserId();
    const milestones = await loadMilestoneConfig();
    return NextResponse.json({ milestones, defaults: DEFAULT_MILESTONE_CONFIG });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load milestones' },
      { status: 400 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdminUserId();
    const body = await req.json();
    const milestones = await saveMilestoneConfig(body);
    return NextResponse.json({ milestones });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save milestones' },
      { status: 400 },
    );
  }
}
