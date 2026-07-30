import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import CampaignModel from '@/lib/models/Campaign';
import { getAdminStorage } from '@/lib/firebaseAdmin';
import { optimizeImage } from '@/lib/imageOptimize';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/avif',
]);

export async function POST(req: NextRequest) {
  try {
    await requireAdminUserId();

    const form = await req.formData();
    const id = String(form.get('id') ?? '').trim();
    const file = form.get('file');
    if (!id) return json({ error: 'Missing campaign id' }, 400);
    if (!(file instanceof File)) return json({ error: 'Missing file' }, 400);

    const contentType = (file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) {
      return json({ error: 'Unsupported file type' }, 400);
    }
    if (file.size > MAX_BYTES) return json({ error: 'File too large (max 10 MB)' }, 400);

    await connectMongo();
    const campaign = await CampaignModel.findOne({ id });
    if (!campaign) return json({ error: 'Campaign not found' }, 404);

    const raw = Buffer.from(await file.arrayBuffer());
    // Same deal as backgrounds: shrink once at upload so every user downloads
    // a small file no matter what got dragged in.
    const optimized = await optimizeImage(raw, contentType, { quality: 85 });
    const destPath = `campaigns/${id}/art.${optimized.ext || 'webp'}`;

    const bucket = getAdminStorage();
    const previous = campaign.imageFile?.storagePath;
    if (previous && previous !== destPath) {
      await bucket.file(previous).delete({ ignoreNotFound: true }).catch(() => {});
    }

    await bucket.file(destPath).save(optimized.buffer, {
      metadata: {
        contentType: optimized.contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    campaign.set('imageFile', {
      storagePath: destPath,
      contentType: optimized.contentType,
      size: optimized.buffer.byteLength,
      updatedAt: new Date(),
    });
    campaign.set('imageVersion', (campaign.imageVersion ?? 0) + 1);
    await campaign.save();

    return json({
      ok: true,
      url: `/api/campaign-assets/${encodeURIComponent(id)}?v=${campaign.imageVersion}`,
      size: optimized.buffer.byteLength,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return json({ error: message }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdminUserId();
    const body = (await req.json().catch(() => ({}))) as { id?: string };
    const id = body.id?.trim();
    if (!id) return json({ error: 'Missing id' }, 400);

    await connectMongo();
    const campaign = await CampaignModel.findOne({ id });
    if (!campaign) return json({ error: 'Campaign not found' }, 404);

    if (campaign.imageFile?.storagePath) {
      await getAdminStorage()
        .file(campaign.imageFile.storagePath)
        .delete({ ignoreNotFound: true })
        .catch(() => {});
    }
    campaign.set('imageFile', null);
    campaign.set('imageVersion', (campaign.imageVersion ?? 0) + 1);
    await campaign.save();

    return json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    return json({ error: message }, 500);
  }
}
