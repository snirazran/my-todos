import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { requireUserId } from '@/lib/auth';
import {
  getManagedRiveAsset,
  MANAGED_RIVE_ASSETS,
  type ManagedRiveAsset,
} from '@/lib/riveAssets';
import { getAdminStorage } from '@/lib/firebaseAdmin';
import connectMongo from '@/lib/mongoose';
import RiveAssetModel from '@/lib/models/RiveAsset';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

const PUBLIC_DIR = path.join(process.cwd(), 'public');

function currentStoragePath(asset: ManagedRiveAsset) {
  return `rive-assets/${asset.id}/${asset.fileName}`;
}

function makeBackupName(asset: ManagedRiveAsset) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${stamp}-${asset.fileName}`;
}

function backupStoragePath(asset: ManagedRiveAsset, name: string) {
  return `rive-backups/${asset.id}/${name}`;
}

// Ensures the current file exists in Firebase Storage, bootstrapping from the
// static public file on first use. Returns the storage path.
async function ensureCurrentInStorage(asset: ManagedRiveAsset): Promise<string> {
  await connectMongo();
  const existing = await RiveAssetModel.findOne({ assetId: asset.id });
  if (existing) return existing.storagePath;

  const staticPath = path.join(PUBLIC_DIR, asset.fileName);
  let buffer: Buffer;
  try {
    buffer = await readFile(staticPath);
  } catch {
    throw new Error(`Static Rive file not found: ${asset.fileName}`);
  }

  const storagePath = currentStoragePath(asset);
  const bucket = getAdminStorage();
  await bucket.file(storagePath).save(buffer, {
    metadata: { contentType: 'application/octet-stream' },
  });

  await RiveAssetModel.create({
    assetId: asset.id,
    storagePath,
    size: buffer.byteLength,
    updatedAt: new Date(),
    backups: [],
  });

  return storagePath;
}

async function createBackup(asset: ManagedRiveAsset): Promise<string> {
  const currentPath = await ensureCurrentInStorage(asset);
  const bucket = getAdminStorage();
  const name = makeBackupName(asset);
  const destPath = backupStoragePath(asset, name);

  await bucket.file(currentPath).copy(bucket.file(destPath));

  const [meta] = await bucket.file(destPath).getMetadata();
  const size = parseInt(String(meta.size ?? 0), 10);

  await RiveAssetModel.updateOne(
    { assetId: asset.id },
    {
      $push: {
        backups: { name, storagePath: destPath, size, updatedAt: new Date() },
      },
    },
  );

  return name;
}

async function assetView(asset: ManagedRiveAsset) {
  await connectMongo();
  const record = await RiveAssetModel.findOne({ assetId: asset.id });

  let size = 0;
  let updatedAt: string | null = null;

  if (record) {
    size = record.size;
    updatedAt = record.updatedAt.toISOString();
  } else {
    const staticPath = path.join(PUBLIC_DIR, asset.fileName);
    if (existsSync(staticPath)) {
      try {
        const info = await stat(staticPath);
        size = info.size;
        updatedAt = info.mtime.toISOString();
      } catch { /* ignore */ }
    }
  }

  const backups = record?.backups
    ? [...record.backups]
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map((b) => ({
          name: b.name,
          size: b.size,
          updatedAt: b.updatedAt.toISOString(),
          url: `/api/rive-files/${asset.id}?backup=${encodeURIComponent(b.name)}`,
        }))
    : [];

  return { ...asset, size, updatedAt, backups };
}

export async function GET() {
  try {
    await requireUserId();
    const assets = await Promise.all(MANAGED_RIVE_ASSETS.map(assetView));
    return json({ assets });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUserId();

    const formData = await req.formData();
    const action = String(formData.get('action') ?? '');
    const assetId = String(formData.get('assetId') ?? '');
    const asset = getManagedRiveAsset(assetId);
    if (!asset) return json({ error: 'Unknown Rive asset' }, 400);

    if (action === 'backup') {
      const backup = await createBackup(asset);
      return json({ ok: true, backup, asset: await assetView(asset) });
    }

    if (action === 'restore') {
      const backupName = String(formData.get('backup') ?? '');
      if (!backupName || backupName.includes('/') || backupName.includes('\\')) {
        return json({ error: 'Invalid backup name' }, 400);
      }

      await connectMongo();
      const record = await RiveAssetModel.findOne({ assetId: asset.id });
      const backup = record?.backups.find((b) => b.name === backupName);
      if (!backup) return json({ error: 'Backup not found' }, 404);

      await createBackup(asset);

      const bucket = getAdminStorage();
      const destPath = currentStoragePath(asset);
      await bucket.file(backup.storagePath).copy(bucket.file(destPath));

      const [meta] = await bucket.file(destPath).getMetadata();
      const size = parseInt(String(meta.size ?? 0), 10);

      await RiveAssetModel.updateOne(
        { assetId: asset.id },
        { storagePath: destPath, size, updatedAt: new Date() },
      );

      return json({ ok: true, asset: await assetView(asset) });
    }

    if (action === 'upload') {
      const file = formData.get('file');
      if (!(file instanceof File)) return json({ error: 'Missing file' }, 400);
      if (!file.name.toLowerCase().endsWith('.riv')) {
        return json({ error: 'Only .riv files are allowed' }, 400);
      }

      await createBackup(asset);

      const bytes = Buffer.from(await file.arrayBuffer());
      const destPath = currentStoragePath(asset);
      const bucket = getAdminStorage();
      await bucket.file(destPath).save(bytes, {
        metadata: { contentType: 'application/octet-stream' },
      });

      await RiveAssetModel.findOneAndUpdate(
        { assetId: asset.id },
        { storagePath: destPath, size: bytes.byteLength, updatedAt: new Date() },
        { upsert: true },
      );

      return json({ ok: true, asset: await assetView(asset) });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return json({ error: message }, 500);
  }
}
