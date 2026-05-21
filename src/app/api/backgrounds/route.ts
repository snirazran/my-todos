import { NextRequest, NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import connectMongo from '@/lib/mongoose';
import BackgroundModel from '@/lib/models/Background';
import UserModel, { type UserDoc } from '@/lib/models/User';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

type LeanUser = UserDoc & { _id: string };

async function loadCatalog() {
  return BackgroundModel.find({ hidden: { $ne: true } })
    .sort({ createdAt: 1 })
    .lean();
}

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectMongo();
    const catalog = await loadCatalog();
    const user = (await UserModel.findById(userId).lean()) as LeanUser | null;
    const backgrounds = user?.wardrobe?.backgrounds ?? {
      equipped: null,
      inventory: {},
    };
    return json({
      catalog,
      equipped: backgrounds.equipped ?? null,
      inventory: backgrounds.inventory ?? {},
      flies: user?.wardrobe?.flies ?? 0,
    });
  } catch {
    let catalog: unknown[] = [];
    try {
      await connectMongo();
      catalog = await loadCatalog();
    } catch {
      catalog = [];
    }
    return json({ catalog, equipped: null, inventory: {}, flies: 0 });
  }
}
