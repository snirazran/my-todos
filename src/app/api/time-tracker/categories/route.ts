// src/app/api/time-tracker/categories/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { Types } from 'mongoose';
import connectMongo from '@/lib/mongoose';
import TimeCategoryModel, {
  type TimeCategoryDoc,
} from '@/lib/models/TimeCategory';

/* ---------- helpers ---------- */
async function currentUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ? new Types.ObjectId(session.user.id) : null;
}

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/* ============================== GET ============================== */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) {
    // For unauthenticated user we can just return empty list
    return NextResponse.json({ categories: [] }, { status: 200 });
  }

  await connectMongo();
  const doc = await TimeCategoryModel.findOne({ userId: uid })
    .lean<TimeCategoryDoc>()
    .exec();

  return NextResponse.json({ categories: doc?.categories ?? [] });
}

/* ============================== POST ============================== */
export async function POST(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();

  const body = await req.json();
  const name = String(body?.name || '').trim();

  if (!name) {
    return NextResponse.json(
      { error: 'Category name required' },
      { status: 400 }
    );
  }

  await connectMongo();

  await TimeCategoryModel.updateOne(
    { userId: uid },
    { $addToSet: { categories: name } },
    { upsert: true }
  );

  const doc = await TimeCategoryModel.findOne({ userId: uid })
    .lean<TimeCategoryDoc>()
    .exec();

  return NextResponse.json(
    { categories: doc?.categories ?? [] },
    { status: 200 }
  );
}
