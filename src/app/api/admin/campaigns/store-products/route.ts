import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import StoreProductModel, {
  STORE_PRODUCT_KINDS,
  STORE_PRODUCT_STORES,
  type StoreProductKind,
  type StoreProductStore,
} from '@/lib/models/StoreProduct';
import { FLY_PACKS } from '@/lib/flyPacks';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

const str = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

export type StoreProductRow = {
  productId: string;
  label: string;
  store: StoreProductStore;
  kind: StoreProductKind;
  priceHint: string;
  note: string;
  /** Shop packs are compiled in and cannot be edited or removed here. */
  source: 'shop' | 'registered';
};

/**
 * Everything a campaign button is allowed to charge for: the fly packs the
 * shop already sells, plus any product identifier an admin has registered for
 * offers that never appear in the shop.
 */
export async function GET() {
  try {
    await requireAdminUserId();
    await connectMongo();
    const registered = await StoreProductModel.find({ archived: false })
      .sort({ updatedAt: -1 })
      .lean();

    const shop: StoreProductRow[] = FLY_PACKS.map((pack) => ({
      productId: pack.productId,
      label: `${pack.id} · ${pack.amount.toLocaleString()} flies`,
      store: 'all',
      kind: 'consumable',
      priceHint: `$${pack.priceUsd}`,
      note: 'Sold in the fly shop',
      source: 'shop',
    }));

    const custom: StoreProductRow[] = registered.map((item) => ({
      productId: item.productId,
      label: item.label || item.productId,
      store: item.store,
      kind: item.kind,
      priceHint: item.priceHint,
      note: item.note,
      source: 'registered',
    }));

    return json({ products: [...shop, ...custom] });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminUserId();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const productId = str(body.productId, 120);
    if (!productId) return json({ error: 'A product id is required' }, 400);

    // Registering a shop pack again would create two entries for one SKU, and
    // the compiled-in one is the source of truth.
    if (FLY_PACKS.some((pack) => pack.productId === productId)) {
      return json({ error: 'That product is already sold in the fly shop' }, 409);
    }

    await connectMongo();
    const doc = await StoreProductModel.findOneAndUpdate(
      { productId },
      {
        $set: {
          label: str(body.label, 80) || productId,
          store: oneOf(body.store, STORE_PRODUCT_STORES, 'all'),
          kind: oneOf(body.kind, STORE_PRODUCT_KINDS, 'consumable'),
          priceHint: str(body.priceHint, 24),
          note: str(body.note, 160),
          archived: false,
        },
      },
      { new: true, upsert: true },
    );

    return json({ ok: true, product: doc });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Save failed' }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdminUserId();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const productId = str(body.productId, 120);
    if (!productId) return json({ error: 'Missing product id' }, 400);

    await connectMongo();
    // Archived rather than deleted: a live campaign may still reference it, and
    // a purchase already made must stay explicable.
    await StoreProductModel.updateOne({ productId }, { $set: { archived: true } });
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Delete failed' }, 500);
  }
}
