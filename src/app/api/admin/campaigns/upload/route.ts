import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import CampaignModel from '@/lib/models/Campaign';
import { getAdminStorage } from '@/lib/firebaseAdmin';
import { optimizeImage } from '@/lib/imageOptimize';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_RIVE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const assetUrl = (campaignId: string, assetId: string, version: number) =>
  `/api/campaign-assets/${encodeURIComponent(campaignId)}?asset=${encodeURIComponent(assetId)}&v=${version}`;

/**
 * Three kinds of upload land here:
 *
 * - `background` — the popup artwork itself. Its aspect ratio comes back with
 *   the response so the canvas can take the shape of the art instead of making
 *   the designer measure it.
 * - `asset` — an extra PNG placed on the canvas.
 * - `rive` — an animation placed on the canvas.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdminUserId();

    const form = await req.formData();
    const id = String(form.get('id') ?? '').trim();
    const kind = String(form.get('kind') ?? 'background').trim();
    const file = form.get('file');
    if (!id) return json({ error: 'Missing campaign id' }, 400);
    if (!(file instanceof File)) return json({ error: 'Missing file' }, 400);

    await connectMongo();
    const campaign = await CampaignModel.findOne({ id });
    if (!campaign) return json({ error: 'Campaign not found' }, 404);

    if (kind === 'rive') {
      if (!file.name.toLowerCase().endsWith('.riv')) {
        return json({ error: 'Expected a .riv file' }, 400);
      }
      if (file.size > MAX_RIVE_BYTES) return json({ error: 'File too large (max 4 MB)' }, 400);

      const buffer = Buffer.from(await file.arrayBuffer());
      const assetId = `riv_${Date.now().toString(36)}`;
      const destPath = `campaigns/${id}/assets/${assetId}.riv`;
      await getAdminStorage()
        .file(destPath)
        .save(buffer, {
          metadata: {
            contentType: 'application/octet-stream',
            cacheControl: 'public, max-age=31536000, immutable',
          },
        });

      const asset = {
        id: assetId,
        kind: 'rive' as const,
        name: file.name.slice(0, 60),
        storagePath: destPath,
        contentType: 'application/octet-stream',
        size: buffer.byteLength,
        version: 1,
      };
      campaign.set('assets', [...(campaign.assets ?? []), asset]);
      await campaign.save();

      return json({ ok: true, asset: { ...asset, url: assetUrl(id, assetId, 1) } });
    }

    const contentType = (file.type || '').toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) return json({ error: 'Unsupported file type' }, 400);
    if (file.size > MAX_BYTES) return json({ error: 'File too large (max 10 MB)' }, 400);

    const raw = Buffer.from(await file.arrayBuffer());
    // Popup art is usually a transparent PNG; WebP keeps the alpha channel and
    // the optimizer falls back to the original bytes if it can't do better.
    const optimized = await optimizeImage(raw, contentType, { quality: 90, maxWidth: 1600 });

    let aspect: number | null = null;
    try {
      const meta = await sharp(raw).metadata();
      if (meta.width && meta.height) aspect = meta.width / meta.height;
    } catch {
      /* aspect is a convenience, not a requirement */
    }

    const bucket = getAdminStorage();

    if (kind === 'asset') {
      const assetId = `img_${Date.now().toString(36)}`;
      const destPath = `campaigns/${id}/assets/${assetId}.${optimized.ext || 'webp'}`;
      await bucket.file(destPath).save(optimized.buffer, {
        metadata: {
          contentType: optimized.contentType,
          cacheControl: 'public, max-age=31536000, immutable',
        },
      });

      const asset = {
        id: assetId,
        kind: 'image' as const,
        name: file.name.slice(0, 60),
        storagePath: destPath,
        contentType: optimized.contentType,
        size: optimized.buffer.byteLength,
        version: 1,
      };
      campaign.set('assets', [...(campaign.assets ?? []), asset]);
      await campaign.save();

      return json({ ok: true, aspect, asset: { ...asset, url: assetUrl(id, assetId, 1) } });
    }

    const destPath = `campaigns/${id}/art.${optimized.ext || 'webp'}`;
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
    if (aspect) campaign.set('canvas.aspect', Math.min(3, Math.max(0.3, aspect)));
    await campaign.save();

    return json({
      ok: true,
      aspect,
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
    const body = (await req.json().catch(() => ({}))) as { id?: string; assetId?: string };
    const id = body.id?.trim();
    if (!id) return json({ error: 'Missing id' }, 400);

    await connectMongo();
    const campaign = await CampaignModel.findOne({ id });
    if (!campaign) return json({ error: 'Campaign not found' }, 404);

    const bucket = getAdminStorage();

    if (body.assetId) {
      const asset = (campaign.assets ?? []).find((item) => item.id === body.assetId);
      if (asset?.storagePath) {
        await bucket.file(asset.storagePath).delete({ ignoreNotFound: true }).catch(() => {});
      }
      campaign.set(
        'assets',
        (campaign.assets ?? []).filter((item) => item.id !== body.assetId),
      );
      await campaign.save();
      return json({ ok: true });
    }

    if (campaign.imageFile?.storagePath) {
      await bucket
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
