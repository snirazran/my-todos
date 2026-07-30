import { NextRequest, NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import CampaignModel from '@/lib/models/Campaign';
import { getAdminStorage } from '@/lib/firebaseAdmin';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await connectMongo();
  const campaign = await CampaignModel.findOne({ id }).select('imageFile').lean();
  const file = campaign?.imageFile;
  if (!file?.storagePath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [buffer] = await getAdminStorage().file(file.storagePath).download();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': file.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
