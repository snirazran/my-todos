import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import connectMongo from '@/lib/mongoose';
import RiveAssetModel from '@/lib/models/RiveAsset';
import { getManagedRiveAsset } from '@/lib/riveAssets';
import { getAdminStorage } from '@/lib/firebaseAdmin';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;
  const asset = getManagedRiveAsset(assetId);
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const backupName = new URL(req.url).searchParams.get('backup');

  await connectMongo();
  const record = await RiveAssetModel.findOne({ assetId: asset.id });

  let storagePath: string | null = null;

  if (backupName) {
    const backup = record?.backups.find((b) => b.name === backupName);
    if (!backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }
    storagePath = backup.storagePath;
  } else {
    storagePath = record?.storagePath ?? null;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
  };

  if (backupName) {
    headers['Content-Disposition'] = `attachment; filename="${backupName}"`;
  }

  if (storagePath) {
    const bucket = getAdminStorage();
    const [buffer] = await bucket.file(storagePath).download();
    return new NextResponse(buffer, { headers });
  }

  // Fall back to the deployed static file
  const staticPath = path.join(PUBLIC_DIR, asset.fileName);
  if (!existsSync(staticPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const buffer = await readFile(staticPath);
  return new NextResponse(buffer, { headers });
}
