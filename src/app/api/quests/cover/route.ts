import { NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import QuestTemplateModel from '@/lib/models/QuestTemplate';
import QuestCategoryModel from '@/lib/models/QuestCategory';

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');
  if (!id || (type !== 'template' && type !== 'category')) {
    return NextResponse.json({ error: 'Invalid cover request' }, { status: 400 });
  }

  await connectMongo();
  const doc =
    type === 'template'
      ? await QuestTemplateModel.findOne({ templateId: id })
          .select({ coverImageUrl: 1, updatedAt: 1 })
          .lean<{ coverImageUrl?: string; updatedAt?: Date } | null>()
      : await QuestCategoryModel.findOne({ categoryId: id })
          .select({ coverImageUrl: 1, updatedAt: 1 })
          .lean<{ coverImageUrl?: string; updatedAt?: Date } | null>();

  const parsed = parseDataUrl(doc?.coverImageUrl);
  if (!parsed) {
    return NextResponse.json({ error: 'Cover not found' }, { status: 404 });
  }

  const etag = `"${type}-${id}-${doc?.updatedAt?.getTime?.() ?? 0}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
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
