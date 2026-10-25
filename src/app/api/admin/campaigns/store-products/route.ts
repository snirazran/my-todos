import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import StoreProductModel, {
  STORE_PRODUCT_KINDS,
  storeProductGrants,
  type StoreProductDoc,
} from '@/lib/models/StoreProduct';
import { FLY_PACKS, getFlyPackForProduct } from '@/lib/flyPacks';
import {
  findPackage,
  getRevenueCatCatalog,
  type CatalogPackage,
  type RevenueCatCatalog,
} from '@/lib/revenuecatCatalog';
import { packRef, packageRef } from '@/lib/campaigns/productRef';
import { sanitizeReward } from '@/lib/campaigns/sanitizeCanvas';
import type {
  OfferCatalogPackage,
  OfferProductKind,
  OfferProductRow,
  OfferProductsResponse,
  OfferStore,
} from '@/lib/campaigns/offerProducts';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

const str = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const OFFER_ID = /^[\w.:-]*$/;

const unique = <T,>(items: T[]) => items.filter((item, index) => items.indexOf(item) === index);

const storesOf = (pkg: CatalogPackage | null): OfferStore[] =>
  pkg ? unique(pkg.products.map((product) => product.store)) : [];

function kindOf(pkg: CatalogPackage): OfferProductKind {
  const types = pkg.products.map((product) => product.type);
  if (types.includes('subscription')) return 'subscription';
  if (types.includes('non_consumable')) return 'non_consumable';
  return 'consumable';
}

const catalogUsable = (catalog: RevenueCatCatalog) => catalog.configured && !catalog.error;

function packOffering(catalog: RevenueCatCatalog, packageId: string) {
  const current = catalog.offerings.find((offering) => offering.isCurrent);
  const pkg = current?.packages.find((item) => item.id === packageId) ?? null;
  return { offeringId: current?.id ?? '', pkg };
}

async function resnapshot(registered: StoreProductDoc[], catalog: RevenueCatCatalog) {
  await Promise.all(
    registered.map(async (doc) => {
      if (!doc.offeringId || !doc.packageId) return;
      const pkg = findPackage(catalog, doc.offeringId, doc.packageId);
      if (!pkg) return;
      const ids = unique(pkg.products.map((product) => product.storeIdentifier)).sort();
      const current = [...(doc.storeIds ?? [])].sort();
      if (ids.join('|') === current.join('|')) return;
      doc.storeIds = ids;
      await StoreProductModel.updateOne({ _id: (doc as { _id?: unknown })._id }, { $set: { storeIds: ids } });
    }),
  );
}

function rowFor(doc: StoreProductDoc, catalog: RevenueCatCatalog): OfferProductRow {
  const linked = !!doc.offeringId && !!doc.packageId;
  const pkg = linked ? findPackage(catalog, doc.offeringId, doc.packageId) : null;
  const stores = linked
    ? storesOf(pkg)
    : unique(
        catalog.offerings.flatMap((offering) =>
          offering.packages.flatMap((item) =>
            item.products
              .filter((product) => product.storeIdentifier === doc.productId)
              .map((product) => product.store),
          ),
        ),
      );
  return {
    ref: doc.productId,
    label: doc.label || doc.productId,
    source: 'registered',
    kind: doc.kind,
    priceHint: doc.priceHint,
    grants: storeProductGrants(doc),
    offeringId: doc.offeringId ?? '',
    packageId: doc.packageId ?? '',
    stores,
    appleOfferId: doc.appleOfferId ?? '',
    googleOfferId: doc.googleOfferId ?? '',
    note: doc.note,
    missing: linked && catalogUsable(catalog) && !pkg,
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminUserId();
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    await connectMongo();
    const [registered, catalog] = await Promise.all([
      StoreProductModel.find({ archived: false }).sort({ updatedAt: -1 }).lean<StoreProductDoc[]>(),
      getRevenueCatCatalog(req.nextUrl.searchParams.get('fresh') === '1'),
    ]);
    if (catalogUsable(catalog)) await resnapshot(registered, catalog);

    const shop: OfferProductRow[] = FLY_PACKS.map((pack) => {
      const { offeringId, pkg } = packOffering(catalog, pack.packageId);
      return {
        ref: packRef(pack.id),
        label: `${pack.amount.toLocaleString()} flies`,
        source: 'shop',
        kind: 'consumable',
        priceHint: `$${pack.priceUsd}`,
        grants: [{ kind: 'flies', amount: pack.amount }],
        offeringId,
        packageId: pack.packageId,
        stores: storesOf(pkg),
        appleOfferId: '',
        googleOfferId: '',
        note: 'Sold in the fly shop',
        missing: false,
      };
    });

    const custom = registered.map((doc) => rowFor(doc, catalog));
    const used = new Set(custom.map((row) => row.ref));
    const packIds = FLY_PACKS.map((pack) => pack.packageId as string);

    const packages: OfferCatalogPackage[] = catalog.offerings.flatMap((offering) =>
      offering.packages.map((pkg) => ({
        offeringId: offering.id,
        offeringName: offering.name,
        isCurrent: offering.isCurrent,
        packageId: pkg.id,
        packageName: pkg.name,
        kind: kindOf(pkg),
        stores: storesOf(pkg),
        inUse:
          used.has(packageRef(offering.id, pkg.id)) ||
          (offering.isCurrent && packIds.includes(pkg.id)),
      })),
    );

    const body: OfferProductsResponse = {
      products: [...shop, ...custom],
      catalog: {
        configured: catalog.configured,
        error: catalog.error,
        fetchedAt: catalog.fetchedAt,
        packages,
      },
    };
    return json(body);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Load failed' }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminUserId();
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const offeringId = str(body.offeringId, 80);
    const packageId = str(body.packageId, 80);
    const grants = sanitizeReward({ grants: body.grants }).grants.filter(
      (grant) => grant.kind !== 'plus_days' && grant.amount > 0,
    );

    let ref: string;
    let kind: OfferProductKind;
    let storeIds: string[] = [];

    if (offeringId && packageId) {
      const catalog = await getRevenueCatCatalog(true);
      if (!catalog.configured) {
        return json(
          { error: 'RevenueCat is not connected yet — add REVENUECAT_V2_SECRET_KEY to the server env.' },
          400,
        );
      }
      if (catalog.error) return json({ error: catalog.error }, 502);
      const pkg = findPackage(catalog, offeringId, packageId);
      if (!pkg) {
        return json({ error: `RevenueCat has no package "${packageId}" in "${offeringId}".` }, 404);
      }
      if (pkg.products.some((product) => getFlyPackForProduct(product.storeIdentifier))) {
        return json(
          {
            error:
              'That package sells a fly shop pack. Use "Buy a fly pack" for it, or give the bundle its own store product.',
          },
          409,
        );
      }
      ref = packageRef(offeringId, packageId);
      kind = kindOf(pkg);
      storeIds = unique(pkg.products.map((product) => product.storeIdentifier));
    } else {
      ref = str(body.ref ?? body.productId, 120);
      if (!ref) return json({ error: 'Pick a RevenueCat package.' }, 400);
      if (getFlyPackForProduct(ref)) {
        return json({ error: 'That product is already sold in the fly shop.' }, 409);
      }
      kind = STORE_PRODUCT_KINDS.includes(body.kind as OfferProductKind)
        ? (body.kind as OfferProductKind)
        : 'consumable';
    }

    if (kind !== 'subscription' && !grants.length) {
      return json(
        { error: 'Add what the buyer gets — a one-time purchase that delivers nothing takes money for nothing.' },
        400,
      );
    }

    const appleOfferId = kind === 'subscription' ? str(body.appleOfferId, 100) : '';
    const googleOfferId = kind === 'subscription' ? str(body.googleOfferId, 100) : '';
    if (!OFFER_ID.test(appleOfferId) || !OFFER_ID.test(googleOfferId)) {
      return json({ error: 'Offer ids are letters, numbers, dots, dashes and underscores only.' }, 400);
    }

    await connectMongo();
    await StoreProductModel.findOneAndUpdate(
      { productId: ref },
      {
        $set: {
          label: str(body.label, 80) || ref,
          kind,
          store: 'all',
          priceHint: str(body.priceHint, 24),
          flies: 0,
          grants,
          offeringId,
          packageId,
          storeIds,
          appleOfferId,
          googleOfferId,
          note: str(body.note, 160),
          archived: false,
        },
      },
      { new: true, upsert: true },
    );

    return json({ ok: true, ref });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Save failed' }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdminUserId();
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const ref = str(body.ref ?? body.productId, 120);
    if (!ref) return json({ error: 'Missing product' }, 400);

    await connectMongo();
    await StoreProductModel.updateOne({ productId: ref }, { $set: { archived: true } });
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Delete failed' }, 500);
  }
}
