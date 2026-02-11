import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import TaskModel from '@/lib/models/Task';
import UserModel from '@/lib/models/User';

export async function POST() {
  try {
    const userId = await requireUserId();
    await dbConnect();

    // Find user
    const user = await UserModel.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Delete all tasks for this user
    await TaskModel.deleteMany({ userId: userId });

    // Reset statistics
    user.statistics = {
      daily: {
        date: '',
        dailyTasksCount: 0,
        dailyMilestoneGifts: 0,
        completedTaskIds: [],
        taskCountAtLastGift: 0,
      },
    };

    await user.save();

    return NextResponse.json({
      success: true,
      message: 'Tasks and statistics reset successfully',
    });
  } catch (error) {
    console.error('Error resetting tasks:', error);
    return NextResponse.json(
      { error: 'Failed to reset tasks' },
      { status: 500 },
    );
  }
}
