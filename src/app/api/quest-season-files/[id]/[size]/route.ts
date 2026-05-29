import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import QuestSeasonModel, {
  type QuestSeasonSizeKey,
} from '@/lib/models/QuestSeason';
import { getAdminStorage } from '@/lib/firebaseAdmin';

const SIZES: QuestSeasonSizeKey[] = ['mobile', 'tablet', 'web', 'webLarge'];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; size: string } },
) {
  const { id, size } = params;
  if (!SIZES.includes(size as QuestSeasonSizeKey)) {
    return NextResponse.json({ error: 'Invalid size' }, { status: 400 });
  }

  await connectMongo();
  const season = await QuestSeasonModel.findOne({ seasonId: id }).lean();
  const file = season?.imageFiles?.[size as QuestSeasonSizeKey];
  if (!season || !file?.storagePath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const bucket = getAdminStorage();
  const [buffer] = await bucket.file(file.storagePath).download();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': file.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
