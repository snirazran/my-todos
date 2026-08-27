export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskModel from '@/lib/models/Task';
import { getZonedToday } from '@/lib/utils';
import { v4 as uuid } from 'uuid';

const MAX_CARDS = 3;

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUserId();
    await connectMongo();

    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const tz =
      typeof body?.timezone === 'string' && body.timezone
        ? body.timezone
        : 'UTC';
    const date =
      typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : getZonedToday(tz);
    const texts: string[] = Array.isArray(body?.texts)
      ? body.texts.slice(0, MAX_CARDS).map((t: unknown) => String(t).trim())
      : [];
    if (texts.length === 0 || texts.some((t) => !t)) {
      return NextResponse.json({ error: 'texts required' }, { status: 400 });
    }

    const staleIds: string[] = Array.isArray(body?.ids)
      ? body.ids.map((id: unknown) => String(id)).filter(Boolean)
      : [];
    await TaskModel.deleteMany({
      userId: uid,
      ...(staleIds.length > 0
        ? { $or: [{ isTutorial: true }, { id: { $in: staleIds } }] }
        : { isTutorial: true }),
    });

    const now = new Date();
    const docs = texts.map((text, i) => ({
      userId: uid,
      type: 'regular' as const,
      id: uuid(),
      text,
      order: -texts.length + i,
      date,
      completed: false,
      isTutorial: true,
      createdAt: now,
      updatedAt: now,
    }));
    await TaskModel.insertMany(docs);

    return NextResponse.json({
      ok: true,
      date,
      taskIds: docs.map((doc) => doc.id),
    });
  } catch (error) {
    console.error('Seeding tutorial tasks failed', error);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const uid = await requireUserId();
    await connectMongo();

    let ids: string[] = [];
    try {
      const body = await req.json();
      if (Array.isArray(body?.ids)) {
        ids = body.ids.map((id: unknown) => String(id)).filter(Boolean);
      }
    } catch {}

    const res = await TaskModel.deleteMany({
      userId: uid,
      ...(ids.length > 0
        ? { $or: [{ isTutorial: true }, { id: { $in: ids } }] }
        : { isTutorial: true }),
    });
    return NextResponse.json({ ok: true, removed: res.deletedCount ?? 0 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
