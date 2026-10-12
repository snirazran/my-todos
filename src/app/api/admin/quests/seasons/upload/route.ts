import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import QuestSeasonModel, {
  type QuestSeasonSizeKey,
} from '@/lib/models/QuestSeason';
import { getAdminStorage } from '@/lib/firebaseAdmin';
import { optimizeImage } from '@/lib/imageOptimize';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

const SIZES: QuestSeasonSizeKey[] = ['mobile', 'tablet', 'web', 'webLarge'];
const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/avif',
]);

function extensionFor(contentType: string, fallbackName: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };
  if (map[contentType]) return map[contentType];
  const m = fallbackName.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : 'bin';
}

function targetSizes(value: string): QuestSeasonSizeKey[] | null {
  if (value === 'all') return SIZES;
  return SIZES.includes(value as QuestSeasonSizeKey)
    ? [value as QuestSeasonSizeKey]
    : null;
}

function storagePathFor(id: string, size: QuestSeasonSizeKey, ext: string) {
  return `quest-seasons/${id}/${size}.${ext}`;
}

export async function POST(req: NextRequest) {
  try {
    await requireUserId();

    const form = await req.formData();
    const id = String(form.get('id') ?? '').trim();
    const sizeField = String(form.get('size') ?? '').trim();
    const file = form.get('file');

    if (!id) return json({ error: 'Missing season id' }, 400);
    const targets = targetSizes(sizeField);
    if (!targets) return json({ error: 'Invalid size' }, 400);
    if (!(file instanceof File)) return json({ error: 'Missing file' }, 400);

    const contentType = (file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) {
      return json({ error: 'Unsupported file type' }, 400);
    }
    if (file.size > MAX_BYTES) {
      return json({ error: 'File too large (max 10 MB)' }, 400);
    }

    await connectMongo();
    const season = await QuestSeasonModel.findOne({ seasonId: id });
    if (!season) return json({ error: 'Season not found' }, 404);

    const rawBytes = Buffer.from(await file.arrayBuffer());
    const bucket = getAdminStorage();
    const cacheBuster = Date.now();
    const urls: Partial<Record<QuestSeasonSizeKey, string>> = {};

    for (const size of targets) {
      const optimized = await optimizeImage(rawBytes, contentType, { sizeKey: size, quality: 85 });
      const bytes = optimized.buffer;
      const storedContentType = optimized.contentType;
      const ext = optimized.ext || extensionFor(contentType, file.name);
      const destPath = storagePathFor(id, size, ext);

      const previous = season.imageFiles?.[size];
      if (previous?.storagePath && previous.storagePath !== destPath) {
        await bucket
          .file(previous.storagePath)
          .delete({ ignoreNotFound: true })
          .catch(() => {});
      }

      await bucket.file(destPath).save(bytes, {
        metadata: { contentType: storedContentType, cacheControl: 'public, max-age=31536000, immutable' },
      });

      const publicUrl = `/api/quest-season-files/${encodeURIComponent(id)}/${size}?v=${cacheBuster}`;
      season.set(`imageFiles.${size}`, {
        storagePath: destPath,
        contentType: storedContentType,
        size: bytes.byteLength,
        updatedAt: new Date(),
      });
      season.set(`images.${size}`, publicUrl);
      urls[size] = publicUrl;
    }
    await season.save();

    return json({ ok: true, images: urls });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return json({ error: message }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireUserId();

    let body: { id?: string; size?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const id = body.id;
    if (!id) return json({ error: 'Missing id' }, 400);
    const targets = targetSizes(String(body.size ?? ''));
    if (!targets) return json({ error: 'Invalid size' }, 400);

    await connectMongo();
    const season = await QuestSeasonModel.findOne({ seasonId: id });
    if (!season) return json({ error: 'Season not found' }, 404);

    for (const size of targets) {
      const existing = season.imageFiles?.[size];
      if (existing?.storagePath) {
        await getAdminStorage()
          .file(existing.storagePath)
          .delete({ ignoreNotFound: true })
          .catch(() => {});
      }
      season.set(`images.${size}`, '');
      season.set(`imageFiles.${size}`, null);
    }
    await season.save();

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    return json({ error: message }, 500);
  }
}
