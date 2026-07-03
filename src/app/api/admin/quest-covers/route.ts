import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestCoverAssetModel from '@/lib/models/QuestCoverAsset';
import {
  isCoverDataUrl,
  isCoverProxyUrl,
  uploadCoverFromDataUrl,
} from '@/lib/quests/coverStorage';

const VALID_KEYS = new Set(['onboard:first-hops', 'onboard:explorer']);

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    const assets = await QuestCoverAssetModel.find(
      { key: { $in: Array.from(VALID_KEYS) } },
      { key: 1, coverImageUrl: 1 },
    ).lean();
    return NextResponse.json({
      covers: assets.map((a) => ({ key: a.key, coverImageUrl: a.coverImageUrl })),
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();
    await connectMongo();
    const body = await req.json();
    const key = typeof body?.key === 'string' ? body.key : '';
    if (!VALID_KEYS.has(key)) {
      return NextResponse.json({ error: 'Unknown cover key' }, { status: 400 });
    }
    if (isCoverDataUrl(body.coverImageUrl)) {
      const uploaded = await uploadCoverFromDataUrl(
        'asset',
        key,
        body.coverImageUrl,
      );
      if (!uploaded) {
        return NextResponse.json({ error: 'Invalid image' }, { status: 400 });
      }
      await QuestCoverAssetModel.updateOne(
        { key },
        { $set: { coverImageUrl: uploaded.url, coverImageFile: uploaded.file } },
        { upsert: true },
      );
      return NextResponse.json({ ok: true, coverImageUrl: uploaded.url });
    }
    if (!isCoverProxyUrl(body.coverImageUrl)) {
      await QuestCoverAssetModel.deleteOne({ key });
      return NextResponse.json({ ok: true, coverImageUrl: undefined });
    }
    return NextResponse.json({ ok: true, coverImageUrl: body.coverImageUrl });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
