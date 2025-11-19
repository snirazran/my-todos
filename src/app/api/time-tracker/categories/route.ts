// src/app/api/time-tracker/categories/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import clientPromise from '@/lib/mongodb';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ categories: [] }, { status: 200 });
  }
  const userId = String(session.user.id);

  const client = await clientPromise;
  const db = client.db();
  const col = db.collection('timeCategories');

  const doc = await col.findOne({ userId });
  return NextResponse.json({ categories: doc?.categories ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = String(session.user.id);

  const body = await req.json();
  const name = String(body.name || '').trim();

  if (!name) {
    return NextResponse.json(
      { error: 'Category name required' },
      { status: 400 }
    );
  }

  const client = await clientPromise;
  const db = client.db();
  const col = db.collection('timeCategories');

  await col.updateOne(
    { userId },
    { $addToSet: { categories: name } },
    { upsert: true }
  );

  const doc = await col.findOne({ userId });

  return NextResponse.json(
    { categories: doc?.categories ?? [] },
    { status: 200 }
  );
}
