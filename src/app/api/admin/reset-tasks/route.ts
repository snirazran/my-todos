import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import dbConnect from '@/lib/mongoose';
import TaskModel from '@/lib/models/Task';
import UserModel from '@/lib/models/User';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    // Find user
    const user = await UserModel.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Delete all tasks for this user
    await TaskModel.deleteMany({ userId: user._id });

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
      message: 'Tasks and statistics reset successfully' 
    });
  } catch (error) {
    console.error('Error resetting tasks:', error);
    return NextResponse.json(
      { error: 'Failed to reset tasks' },
      { status: 500 }
    );
  }
}
