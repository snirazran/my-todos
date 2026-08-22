import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUserId as requireUserId } from '@/lib/adminAuth';
import connectMongo from '@/lib/mongoose';
import BackgroundModel, {
  type BackgroundRarity,
  type BackgroundImages,
} from '@/lib/models/Background';
import { getAdminStorage } from '@/lib/firebaseAdmin';
import { accentFromHex, extractAccent } from '@/lib/backgrounds/accent';

const json = (body: unknown, init = 200) =>
  NextResponse.json(body, { status: init });

const RARITIES: BackgroundRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

function sanitizeImages(input: unknown): BackgroundImages {
  const obj = (input ?? {}) as Partial<BackgroundImages>;
  return {
    mobile: typeof obj.mobile === 'string' ? obj.mobile.trim() : '',
    tablet: typeof obj.tablet === 'string' ? obj.tablet.trim() : '',
    web: typeof obj.web === 'string' ? obj.web.trim() : '',
    webLarge: typeof obj.webLarge === 'string' ? obj.webLarge.trim() : '',
  };
}

export async function GET() {
  try {
    await requireUserId();
    await connectMongo();
    const items = await BackgroundModel.find({}).sort({ createdAt: 1 }).lean();
    return json({ items });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireUserId();

    let body: {
      action?: string;
      name?: string;
      rarity?: BackgroundRarity;
      priceFlies?: number;
      images?: Partial<BackgroundImages>;
    };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    if (body.action === 'backfill-accents') {
      await connectMongo();
      const all = await BackgroundModel.find({}).lean();
      let updated = 0;
      let skipped = 0;
      for (const bg of all) {
        if (bg.accent?.mode === 'manual' || bg.accent) {
          skipped += 1;
          continue;
        }
        const accent = await recomputeAccent(bg.id);
        if (!accent) {
          skipped += 1;
          continue;
        }
        await BackgroundModel.updateOne({ id: bg.id }, { $set: { accent } });
        updated += 1;
      }
      return json({ ok: true, updated, skipped });
    }

    const name = body.name?.trim();
    if (!name) return json({ error: 'Missing name' }, 400);

    const rarity: BackgroundRarity = RARITIES.includes(body.rarity as BackgroundRarity)
      ? (body.rarity as BackgroundRarity)
      : 'common';

    const id = `bg_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

    await connectMongo();

    const existing = await BackgroundModel.findOne({ id });
    if (existing) {
      return json({ error: 'A background with this name already exists' }, 400);
    }

    const item = await BackgroundModel.create({
      id,
      name,
      rarity,
      priceFlies: typeof body.priceFlies === 'number' ? body.priceFlies : 200,
      images: sanitizeImages(body.images),
      hidden: false,
    });

    return json({ ok: true, item });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireUserId();

    let body: {
      id?: string;
      name?: string;
      rarity?: BackgroundRarity;
      priceFlies?: number;
      images?: Partial<BackgroundImages>;
      hidden?: boolean;
      accentHex?: string | null;
    };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    if (!body.id) return json({ error: 'Missing id' }, 400);

    await connectMongo();

    const update: Record<string, unknown> = {};
    if (typeof body.name === 'string') update.name = body.name.trim();
    if (RARITIES.includes(body.rarity as BackgroundRarity)) update.rarity = body.rarity;
    if (typeof body.priceFlies === 'number') update.priceFlies = body.priceFlies;
    if (body.images) update.images = sanitizeImages(body.images);
    if (typeof body.hidden === 'boolean') update.hidden = body.hidden;

    if (body.accentHex === null) {
      const recomputed = await recomputeAccent(body.id);
      update.accent = recomputed ?? undefined;
    } else if (typeof body.accentHex === 'string') {
      const manual = accentFromHex(body.accentHex.trim());
      if (!manual) return json({ error: 'Invalid accent colour' }, 400);
      update.accent = manual;
    }

    const result = await BackgroundModel.findOneAndUpdate(
      { id: body.id },
      { $set: update },
      { new: true },
    );

    if (!result) return json({ error: 'Background not found' }, 404);

    return json({ ok: true, item: result });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}

async function recomputeAccent(id: string) {
  const bg = await BackgroundModel.findOne({ id }).lean();
  const path = bg?.imageFiles?.mobile?.storagePath;
  if (!path) return null;
  try {
    const [buffer] = await getAdminStorage().file(path).download();
    return await extractAccent(buffer);
  } catch {
    return null;
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireUserId();

    let body: { id?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    if (!body.id) return json({ error: 'Missing id' }, 400);

    await connectMongo();
    const bg = await BackgroundModel.findOne({ id: body.id });
    if (bg?.imageFiles) {
      const bucket = getAdminStorage();
      const sizes = ['mobile', 'tablet', 'web', 'webLarge'] as const;
      await Promise.all(
        sizes.map((size) => {
          const file = bg.imageFiles?.[size];
          if (!file?.storagePath) return Promise.resolve();
          return bucket
            .file(file.storagePath)
            .delete({ ignoreNotFound: true })
            .catch(() => undefined);
        }),
      );
    }
    await BackgroundModel.deleteOne({ id: body.id });

    return json({ ok: true });
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
