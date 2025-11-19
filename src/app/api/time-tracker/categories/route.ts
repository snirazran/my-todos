// src/app/api/time-tracker/categories/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

interface TimeCategoriesDoc {
  _id?: ObjectId;
  userId: ObjectId;
  categories: string[];
}

/* ---------- helpers ---------- */
async function currentUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ? new ObjectId(session.user.id) : null;
}

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

const getCategoriesCol = async () =>
  (await clientPromise)
    .db('todoTracker')
    .collection<TimeCategoriesDoc>('timeCategories');

/* ─────────────────── GET ─────────────────── */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) {
    // For unauthenticated user we can just return empty list
    return NextResponse.json({ categories: [] }, { status: 200 });
  }

  const col = await getCategoriesCol();
  const doc = await col.findOne({ userId: uid });

  return NextResponse.json({ categories: doc?.categories ?? [] });
}

/* ─────────────────── POST ─────────────────── */
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

  const col = await getCategoriesCol();

  await col.updateOne(
    { userId: uid },
    { $addToSet: { categories: name } },
    { upsert: true }
  );

  const doc = await col.findOne({ userId: uid });

  return NextResponse.json(
    { categories: doc?.categories ?? [] },
    { status: 200 }
  );
}
