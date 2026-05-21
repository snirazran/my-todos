import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import BackgroundModel, {
  type BackgroundSizeKey,
} from '@/lib/models/Background';
import { getAdminStorage } from '@/lib/firebaseAdmin';

const SIZES: BackgroundSizeKey[] = ['mobile', 'tablet', 'web', 'webLarge'];

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; size: string } },
) {
  const { id, size } = params;
  if (!SIZES.includes(size as BackgroundSizeKey)) {
    return NextResponse.json({ error: 'Invalid size' }, { status: 400 });
  }

  await connectMongo();
  const bg = await BackgroundModel.findOne({ id }).lean();
  const file = bg?.imageFiles?.[size as BackgroundSizeKey];
  if (!bg || !file?.storagePath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const bucket = getAdminStorage();
  const [buffer] = await bucket.file(file.storagePath).download();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': file.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    },
  });
}
