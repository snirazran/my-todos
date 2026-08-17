export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import ShopSalesConfigModel, {
  SHOP_SALES_CONFIG_ID,
  ensureShopSalesConfig,
  sanitizeShopSales,
} from '@/lib/models/ShopSalesConfig';
import { DEFAULT_SHOP_SALES } from '@/lib/skins/shopSales';

export async function GET() {
  try {
    await requireAdminUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await connectMongo();
  return NextResponse.json({
    config: await ensureShopSalesConfig(),
    defaults: DEFAULT_SHOP_SALES,
  });
}

export async function PUT(req: NextRequest) {
  try {
    await requireAdminUserId();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    await connectMongo();
    await ensureShopSalesConfig();

    await ShopSalesConfigModel.updateOne(
      { configId: SHOP_SALES_CONFIG_ID },
      { $set: sanitizeShopSales(body) },
      { upsert: true },
    );

    return NextResponse.json({
      ok: true,
      config: await ensureShopSalesConfig(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save' },
      { status: 400 },
    );
  }
}
