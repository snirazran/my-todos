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

    const rewards = config.rewards.map((r) => {
      // New reward configurations store their item on the reward itself.
      // Resolve it from the catalog so preview and rarity match the payout.
      const itemReward = r.rewards?.find((reward) => (reward.type === 'ITEM' || reward.type === 'BOX') && reward.itemId);
      const itemId = r.rewards?.length ? itemReward?.itemId : r.itemId;
      return ({
      tier: r.tier,
      label: r.label,
      description: '',
      flies: r.flies ?? 0,
      itemId: itemId || null,
      item: itemId ? byId[itemId] ?? null : null,
      imageUrl: r.imageUrl ?? '',
      rewards: r.rewards?.length
        ? r.rewards
        : [
            ...(r.flies && r.flies > 0
              ? [{ type: 'FLIES' as const, amountMode: 'fixed' as const, amount: r.flies }]
              : []),
            ...(r.itemId ? [{ type: 'ITEM' as const, itemId: r.itemId }] : []),
          ],
      });
    });

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
