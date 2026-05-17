import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import UserModel from '@/lib/models/User';

export async function GET() {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return NextResponse.json(
      process.env.NODE_ENV === 'production'
        ? { error: 'Unauthorized' }
        : {
            error: 'Unauthorized',
            details: error instanceof Error ? error.message : 'Unknown auth error',
          },
      { status: 401 },
    );
  }

  try {
    await connectMongo();
    const user = await UserModel.findById(userId)
      .select('focusProfile')
      .lean();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const focusProfile = (user as any).focusProfile ?? {};

    return NextResponse.json(
      {
        onboarding: {
          complete: !!focusProfile.completedAt,
          selectedCategoryIds: focusProfile.selectedCategoryIds ?? [],
          categoryTagMap: focusProfile.categoryTagMap ?? [],
        },
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=60',
        },
      },
    );
  } catch (error) {
    console.error('Error loading quest focus profile:', error);
    return NextResponse.json(
      process.env.NODE_ENV === 'production'
        ? { error: 'Failed to load quest focus profile' }
        : {
            error: 'Failed to load quest focus profile',
            details: error instanceof Error ? error.message : 'Unknown quests error',
          },
      { status: 500 },
    );
  }
}
