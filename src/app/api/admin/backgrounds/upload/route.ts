import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import BackgroundModel, {
  type BackgroundSizeKey,
} from '@/lib/models/Background';
import { getAdminStorage } from '@/lib/firebaseAdmin';
import { optimizeImage } from '@/lib/imageOptimize';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

const SIZES: BackgroundSizeKey[] = ['mobile', 'tablet', 'web', 'webLarge'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

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

function storagePathFor(id: string, size: BackgroundSizeKey, ext: string) {
  return `backgrounds/${id}/${size}.${ext}`;
}

export async function POST(req: NextRequest) {
  try {
    await requireUserId();

    const form = await req.formData();
    const id = String(form.get('id') ?? '').trim();
    const size = String(form.get('size') ?? '').trim() as BackgroundSizeKey;
    const file = form.get('file');

    if (!id) return json({ error: 'Missing background id' }, 400);
    if (!SIZES.includes(size)) return json({ error: 'Invalid size' }, 400);
    if (!(file instanceof File)) return json({ error: 'Missing file' }, 400);

    const contentType = (file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) {
      return json({ error: 'Unsupported file type' }, 400);
    }

    if (file.size > MAX_BYTES) {
      return json({ error: 'File too large (max 10 MB)' }, 400);
    }

    await connectMongo();
    const bg = await BackgroundModel.findOne({ id });
    if (!bg) return json({ error: 'Background not found' }, 404);

    const rawBytes = Buffer.from(await file.arrayBuffer());

    // Compress/resize to WebP at upload time so every user downloads a small
    // file regardless of what was uploaded (a 10 MB PNG becomes ~150 KB).
    const optimized = await optimizeImage(rawBytes, contentType, { sizeKey: size, quality: 85 });
    const bytes = optimized.buffer;
    const storedContentType = optimized.contentType;

    const ext = optimized.ext || extensionFor(contentType, file.name);
    const destPath = storagePathFor(id, size, ext);

    const bucket = getAdminStorage();

    // If there's an existing file for this size with a different path, delete it
    const previous = bg.imageFiles?.[size];
    if (previous?.storagePath && previous.storagePath !== destPath) {
      await bucket
        .file(previous.storagePath)
        .delete({ ignoreNotFound: true })
        .catch(() => {});
    }

    await bucket.file(destPath).save(bytes, {
      metadata: { contentType: storedContentType, cacheControl: 'public, max-age=31536000, immutable' },
    });

    const cacheBuster = Date.now();
    const publicUrl = `/api/background-files/${encodeURIComponent(id)}/${size}?v=${cacheBuster}`;

    bg.set(`imageFiles.${size}`, {
      storagePath: destPath,
      contentType: storedContentType,
      size: bytes.byteLength,
      updatedAt: new Date(),
    });
    bg.set(`images.${size}`, publicUrl);
    await bg.save();

    return json({ ok: true, url: publicUrl, size: bytes.byteLength });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return json({ error: message }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireUserId();

    let body: { id?: string; size?: BackgroundSizeKey };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const id = body.id;
    const size = body.size;
    if (!id) return json({ error: 'Missing id' }, 400);
    if (!size || !SIZES.includes(size)) return json({ error: 'Invalid size' }, 400);

    await connectMongo();
    const bg = await BackgroundModel.findOne({ id });
    if (!bg) return json({ error: 'Background not found' }, 404);

    const existing = bg.imageFiles?.[size];
    if (existing?.storagePath) {
      await getAdminStorage()
        .file(existing.storagePath)
        .delete({ ignoreNotFound: true })
        .catch(() => {});
    }

    bg.set(`images.${size}`, '');
    bg.set(`imageFiles.${size}`, null);
    await bg.save();

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    return json({ error: message }, 500);
  }
}
