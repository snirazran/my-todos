import { NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import QuestTemplateModel from '@/lib/models/QuestTemplate';
import QuestCategoryModel from '@/lib/models/QuestCategory';
import type { QuestCoverImageFile } from '@/lib/models/QuestTemplate';
import { getAdminStorage } from '@/lib/firebaseAdmin';

const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/;

function parseDataUrl(url: string | undefined) {
  if (!url) return null;
  const match = DATA_URL_RE.exec(url);
  if (!match) return null;
  try {
    return {
      contentType: match[1] || 'application/octet-stream',
      buffer: Buffer.from(match[2], 'base64'),
    };
  } catch {
    return null;
  }
}

type CoverDoc = {
  coverImageUrl?: string;
  coverImageFile?: QuestCoverImageFile | null;
  updatedAt?: Date;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');
  if (!id || (type !== 'template' && type !== 'category')) {
    return NextResponse.json({ error: 'Invalid cover request' }, { status: 400 });
  }

  await connectMongo();
  const projection = { coverImageUrl: 1, coverImageFile: 1, updatedAt: 1 };
  const doc =
    type === 'template'
      ? await QuestTemplateModel.findOne({ templateId: id })
          .select(projection)
          .lean<CoverDoc | null>()
      : await QuestCategoryModel.findOne({ categoryId: id })
          .select(projection)
          .lean<CoverDoc | null>();

  if (!doc) {
    return NextResponse.json({ error: 'Cover not found' }, { status: 404 });
  }

  const etag = `"${type}-${id}-${doc.updatedAt?.getTime?.() ?? 0}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  // Preferred path: bytes live in Firebase Storage, doc holds only metadata.
  const file = doc.coverImageFile;
  if (file?.storagePath) {
    try {
      const [buffer] = await getAdminStorage().file(file.storagePath).download();
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': file.contentType || 'application/octet-stream',
          'Content-Length': buffer.length.toString(),
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
          ETag: etag,
        },
      });
    } catch {
      return NextResponse.json({ error: 'Cover not found' }, { status: 404 });
    }
  }

  // Legacy path: cover stored inline as a base64 data URL in Mongo.
  const parsed = parseDataUrl(doc.coverImageUrl);
  if (!parsed) {
    return NextResponse.json({ error: 'Cover not found' }, { status: 404 });
  }

  return new Response(parsed.buffer, {
    status: 200,
    headers: {
      'Content-Type': parsed.contentType,
      'Content-Length': parsed.buffer.length.toString(),
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      ETag: etag,
    },
  });
}
