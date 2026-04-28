import { NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import RiveAssetModel from '@/lib/models/RiveAsset';
import { MANAGED_RIVE_ASSETS } from '@/lib/riveAssets';

// Returns a map of staticPath -> proxyUrl for assets stored in Firebase Storage.
// Used by riveLoader to transparently serve dynamically uploaded Rive files.
export async function GET() {
  try {
    await connectMongo();
    const records = await RiveAssetModel.find({}).lean();

    const urlMap: Record<string, string> = {};
    for (const record of records) {
      const asset = MANAGED_RIVE_ASSETS.find((a) => a.id === record.assetId);
      if (asset) {
        urlMap[asset.publicPath] = `/api/rive-files/${asset.id}`;
      }
    }

    return NextResponse.json(urlMap, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' },
    });
  } catch {
    return NextResponse.json({});
  }
}
