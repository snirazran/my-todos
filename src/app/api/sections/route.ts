import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import TaskModel from '@/lib/models/Task';
import {
  TaskSectionModel,
  isSectionCollapsedOn,
} from '@/lib/models/TaskSection';
import { notifyTaskChanged } from '@/lib/taskSync';
import { getZonedToday } from '@/lib/utils';

const NAME_MAX = 60;
const MAX_SECTIONS = 10;

function parseTagIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string' || !v) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

async function currentUserId() {
  try {
    return await requireUserId();
  } catch {
    return null;
  }
}

function unauth() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();
  const tz = req.nextUrl.searchParams.get('timezone') || 'UTC';
  const todayKey = getZonedToday(tz);
  const sections = await TaskSectionModel.find({ userId: uid })
    .sort({ order: 1 })
    .lean();
  return NextResponse.json({
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      order: s.order,
      collapsed: isSectionCollapsedOn(s, todayKey),
      tagIds: s.tagIds ?? [],
    })),
  });
}

export async function POST(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();
  const body = await req.json();
  const name = String(body?.name ?? '').trim().slice(0, NAME_MAX);
  if (!name)
    return NextResponse.json({ error: 'Name required' }, { status: 400 });
  const count = await TaskSectionModel.countDocuments({ userId: uid });
  if (count >= MAX_SECTIONS)
    return NextResponse.json(
      { error: `Maximum ${MAX_SECTIONS} sections` },
      { status: 400 },
    );
  const last = await TaskSectionModel.findOne({ userId: uid })
    .sort({ order: -1 })
    .lean();
  const id = typeof body?.id === 'string' && body.id ? body.id : uuid();
  await TaskSectionModel.create({
    userId: uid,
    id,
    name,
    order: (last?.order ?? 0) + 1,
    collapsed: false,
    tagIds: parseTagIds(body?.tagIds) ?? [],
  });
  await notifyTaskChanged(uid);
  return NextResponse.json({ ok: true, id });
}

export async function PUT(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();
  const body = await req.json();

  if (Array.isArray(body?.order)) {
    const ids: string[] = body.order.filter((v: unknown) => typeof v === 'string');
    await Promise.all(
      ids.map((id, i) =>
        TaskSectionModel.updateOne(
          { userId: uid, id },
          { $set: { order: i + 1 } },
        ),
      ),
    );
    await notifyTaskChanged(uid);
    return NextResponse.json({ ok: true });
  }

  const sectionId = String(body?.sectionId ?? '');
  if (!sectionId)
    return NextResponse.json({ error: 'sectionId required' }, { status: 400 });

  const set: Record<string, unknown> = {};
  if (typeof body.name === 'string') {
    const name = body.name.trim().slice(0, NAME_MAX);
    if (!name)
      return NextResponse.json({ error: 'Name required' }, { status: 400 });
    set.name = name;
  }
  if (typeof body.collapsed === 'boolean') {
    set.collapsed = body.collapsed;
    set.collapsedDayKey = body.collapsed
      ? getZonedToday(typeof body.timezone === 'string' ? body.timezone : 'UTC')
      : '';
  }
  const tagIds = parseTagIds(body?.tagIds);
  if (tagIds) set.tagIds = tagIds;
  if (Object.keys(set).length === 0)
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const res = await TaskSectionModel.updateOne(
    { userId: uid, id: sectionId },
    { $set: set },
  );
  if (res.matchedCount === 0)
    return NextResponse.json({ error: 'Section not found' }, { status: 404 });
  await notifyTaskChanged(uid);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return unauth();
  await connectMongo();
  const sectionId = req.nextUrl.searchParams.get('sectionId');
  if (!sectionId)
    return NextResponse.json({ error: 'sectionId required' }, { status: 400 });
  await TaskSectionModel.deleteOne({ userId: uid, id: sectionId });
  await TaskModel.updateMany(
    { userId: uid, sectionId },
    { $unset: { sectionId: 1 } },
  );
  await notifyTaskChanged(uid);
  return NextResponse.json({ ok: true });
}
