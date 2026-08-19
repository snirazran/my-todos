import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import BackgroundModel, {
  type BackgroundSizeKey,
} from '@/lib/models/Background';
import { getAdminStorage } from '@/lib/firebaseAdmin';

const SIZES: BackgroundSizeKey[] = ['mobile', 'tablet', 'web', 'webLarge'];

const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'public, max-age=300, stale-while-revalidate=86400';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; size: string }> },
) {
  const { id, size } = await params;
  if (!SIZES.includes(size as BackgroundSizeKey)) {
    return NextResponse.json({ error: 'Invalid size' }, { status: 400 });
  }

  await connectMongo();
  const bg = await BackgroundModel.findOne({ id }).lean();
  const file = bg?.imageFiles?.[size as BackgroundSizeKey];
  if (!bg || !file?.storagePath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const cacheControl = req.nextUrl.searchParams.has('v')
    ? IMMUTABLE
    : REVALIDATE;
  const stamp = file.updatedAt ? new Date(file.updatedAt).getTime() : 0;
  const etag = `"bg-${id}-${size}-${stamp}-${file.size ?? 0}"`;

  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': cacheControl },
    });
  }

  const bucket = getAdminStorage();
  const [buffer] = await bucket.file(file.storagePath).download();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': file.contentType || 'application/octet-stream',
      'Cache-Control': cacheControl,
      ETag: etag,
    },
  });
}
