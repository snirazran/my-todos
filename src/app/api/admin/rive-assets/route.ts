import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { mkdir, readdir, copyFile, stat, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { requireUserId } from '@/lib/auth';
import {
  getManagedRiveAsset,
  MANAGED_RIVE_ASSETS,
  type ManagedRiveAsset,
} from '@/lib/riveAssets';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const BACKUP_ROOT = path.join(PUBLIC_DIR, 'rive-backups');

function assetPath(asset: ManagedRiveAsset) {
  return path.join(PUBLIC_DIR, asset.fileName);
}

function assetBackupDir(asset: ManagedRiveAsset) {
  return path.join(BACKUP_ROOT, asset.id);
}

function backupName(asset: ManagedRiveAsset) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${stamp}-${asset.fileName}`;
}

async function fileInfo(filePath: string) {
  const info = await stat(filePath);
  return {
    size: info.size,
    updatedAt: info.mtime.toISOString(),
  };
}

async function createBackup(asset: ManagedRiveAsset) {
  const source = assetPath(asset);
  if (!existsSync(source)) {
    throw new Error('Current Rive file does not exist');
  }

  const dir = assetBackupDir(asset);
  await mkdir(dir, { recursive: true });
  const name = backupName(asset);
  const target = path.join(dir, name);
  await copyFile(source, target);
  return name;
}

async function listBackups(asset: ManagedRiveAsset) {
  const dir = assetBackupDir(asset);
  if (!existsSync(dir)) return [];

  const names = await readdir(dir);
  const backups = await Promise.all(
    names
      .filter((name) => name.endsWith('.riv'))
      .map(async (name) => {
        const info = await fileInfo(path.join(dir, name));
        return {
          name,
          size: info.size,
          updatedAt: info.updatedAt,
          url: `/rive-backups/${asset.id}/${name}`,
        };
      }),
  );

  return backups.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function assetView(asset: ManagedRiveAsset) {
  const info = existsSync(assetPath(asset))
    ? await fileInfo(assetPath(asset))
    : { size: 0, updatedAt: null };

  return {
    ...asset,
    size: info.size,
    updatedAt: info.updatedAt,
    backups: await listBackups(asset),
  };
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
      const backup = String(formData.get('backup') ?? '');
      if (!backup || backup.includes('/') || backup.includes('\\')) {
        return json({ error: 'Invalid backup name' }, 400);
      }
      const source = path.join(assetBackupDir(asset), backup);
      if (!existsSync(source)) return json({ error: 'Backup not found' }, 404);

      await createBackup(asset);
      await copyFile(source, assetPath(asset));
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
      await writeFile(assetPath(asset), bytes);
      return json({ ok: true, asset: await assetView(asset) });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    return json({ error: message }, 500);
  }
}
