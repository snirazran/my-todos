import { NextResponse } from 'next/server';
import connectMongo from '@/lib/mongoose';
import { ensureInviteConfig } from '@/lib/inviteConfig/defaults';
import { getFullCatalog, buildById } from '@/lib/skins/getCatalog';

export async function GET() {
  try {
    await connectMongo();
    const [config, catalog] = await Promise.all([
      ensureInviteConfig(),
      getFullCatalog(),
    ]);
    const byId = buildById(catalog);

    const rewards = config.rewards.map((r) => ({
      tier: r.tier,
      label: r.label,
      description: '',
      flies: r.flies ?? 0,
      itemId: r.itemId || null,
      item: r.itemId ? byId[r.itemId] ?? null : null,
      imageUrl: r.imageUrl ?? '',
      rewards: r.rewards?.length
        ? r.rewards
        : [
            ...(r.flies && r.flies > 0
              ? [{ type: 'FLIES' as const, amountMode: 'fixed' as const, amount: r.flies }]
              : []),
            ...(r.itemId ? [{ type: 'ITEM' as const, itemId: r.itemId }] : []),
          ],
    }));

    const giftOptions = config.giftOptions.map((g) => ({
      id: g.id,
      name: g.name,
      itemId: g.itemId,
      item: byId[g.itemId] ?? null,
      imageUrl: g.imageUrl ?? '',
    }));

    return NextResponse.json({
      headline: config.headline,
      subheading: config.subheading,
      shareTitle: config.shareTitle,
      shareMessage: config.shareMessage,
      rewards,
      giftOptions,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load' },
      { status: 500 },
    );
  }
}
