import { getPrizePool } from '@/lib/skins/gifts';
import type { StatSection } from '@/lib/analytics/catalog';
import { groupByProperties, kpi, rate, round, type ReportContext } from './context';

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export async function buildWardrobe(context: ReportContext): Promise<StatSection> {
  const [purchaseRows, tradeRows, equipRows, lookRows, dealRows, tryOnRows, catalog] =
    await Promise.all([
      groupByProperties(
        { occurredAt: context.window, name: 'skin_purchased' },
        { rarity: 'rarity', tier: 'is_premium', discounted: 'discounted' },
        { sums: { flies: 'flies_spent', items: 'item_count' } },
      ),
      groupByProperties(
        { occurredAt: context.window, name: 'skin_traded' },
        { fromRarity: 'from_rarity', toRarity: 'to_rarity', aimed: 'aimed' },
        { sums: { fuel: 'fuel_count', aimFlies: 'aim_flies' } },
      ),
      groupByProperties(
        { occurredAt: context.window, name: 'item_equipped' },
        { slot: 'slot', rarity: 'rarity', action: 'action' },
      ),
      groupByProperties(
        { occurredAt: context.window, name: { $in: ['look_saved', 'look_applied', 'look_reaction_sent'] } },
        { source: 'source' },
      ),
      groupByProperties(
        { occurredAt: context.window, name: 'daily_deals_rerolled' },
        { tier: 'is_premium' },
        { sums: { flies: 'flies_spent' } },
      ),
      groupByProperties(
        { occurredAt: context.window, name: { $in: ['tryon_shown', 'tryon_kept', 'tryon_dismissed'] } },
        { rarity: 'rarity' },
      ),
      getPrizePool(),
    ]);

  const purchases = context.metric('skin_purchased');
  const trades = context.metric('skin_traded');
  const equips = context.metric('item_equipped');
  const wishlistPins = context.metric('wishlist_pinned');
  const wishlistReached = context.metric('wishlist_reached');
  const shopRailViews = context.metric('home_shop_rail_viewed');
  const shopRailTaps = context.metric('home_shop_rail_tapped');

  const fliesSpentOnSkins = purchaseRows.reduce((sum, row) => sum + row.flies, 0);

  const catalogRows = RARITIES.map((rarity) => {
    const items = catalog.filter((item) => item.rarity === rarity && item.slot !== 'container');
    const prices = items
      .map((item) => ('priceFlies' in item ? Number(item.priceFlies ?? 0) : 0))
      .filter((price) => price > 0);
    const sold = purchaseRows
      .filter((row) => String(row._id.rarity) === rarity)
      .reduce((sum, row) => sum + row.count, 0);
    return {
      rarity,
      items: items.length,
      avg_price: prices.length
        ? Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length)
        : 0,
      min_price: prices.length ? Math.min(...prices) : 0,
      max_price: prices.length ? Math.max(...prices) : 0,
      sold,
      sold_per_item: items.length ? round(sold / items.length, 2) : 0,
    };
  });

  return {
    id: 'wardrobe',
    title: 'Wardrobe, shop & trade',
    question: 'Do earned rewards get spent, worn, and shown off?',
    blurb: 'Where flies go, what gets equipped, and whether the catalog moves.',
    kpis: [
      kpi('shop_purchases', purchases.events, { sparkline: context.seriesFor('skin_purchased') }),
      kpi('shop_buyers', purchases.users),
      kpi('shop_reach', rate(purchases.users, context.activeUsers), {
        detail: `${fliesSpentOnSkins.toLocaleString()} flies spent on cosmetics`,
        sample: context.activeUsers,
      }),
      kpi('equip_actions', equips.events, {
        sparkline: context.seriesFor('item_equipped'),
        detail: `${equips.users} users changed their frog`,
      }),
      kpi('trades', trades.events, { detail: `${trades.users} traders` }),
      kpi('wishlist_pins', wishlistPins.events, {
        detail: `${wishlistReached.events} wishlist goals reached`,
      }),
    ],
    series: [
      {
        key: 'wardrobe.daily',
        title: 'Spend and wear',
        question: 'Does buying convert into wearing, or do items sit in the inventory?',
        lines: [
          { key: 'purchases', label: 'Purchases', format: 'integer' },
          { key: 'equips', label: 'Equips', format: 'integer' },
          { key: 'trades', label: 'Trades', format: 'integer' },
        ],
        points: context.dates.map((date, index) => ({
          date,
          purchases: context.seriesFor('skin_purchased')[index] ?? 0,
          equips: context.seriesFor('item_equipped')[index] ?? 0,
          trades: context.seriesFor('skin_traded')[index] ?? 0,
        })),
      },
    ],
    tables: [
      {
        key: 'wardrobe.catalog',
        title: 'Catalog movement by rarity',
        question: 'Is anything priced so high that nobody ever reaches it?',
        columns: [
          { key: 'rarity', label: 'Rarity' },
          { key: 'items', label: 'Items in catalog', format: 'integer' },
          { key: 'avg_price', label: 'Avg price', format: 'integer' },
          { key: 'min_price', label: 'Cheapest', format: 'integer' },
          { key: 'max_price', label: 'Dearest', format: 'integer' },
          { key: 'sold', label: 'Sold in range', format: 'integer' },
          { key: 'sold_per_item', label: 'Sales per item', format: 'decimal' },
        ],
        rows: catalogRows,
        note: 'Sales per item is the useful column: a rarity with many items and almost no sales is dead stock.',
      },
      {
        key: 'wardrobe.purchases',
        title: 'Purchases',
        question: 'Which rarities do free users buy, and which are effectively Plus-only?',
        columns: [
          { key: 'rarity', label: 'Rarity' },
          { key: 'tier', label: 'Account tier' },
          { key: 'discounted', label: 'On sale' },
          { key: 'purchases', label: 'Purchases', format: 'integer' },
          { key: 'users', label: 'Buyers', format: 'integer' },
          { key: 'flies', label: 'Flies spent', format: 'integer' },
        ],
        rows: purchaseRows.map((row) => ({
          rarity: String(row._id.rarity),
          tier: row._id.tier === true ? 'Plus' : 'Free',
          discounted: row._id.discounted === true ? 'Yes' : 'No',
          purchases: row.count,
          users: row.users,
          flies: row.flies,
        })),
      },
      {
        key: 'wardrobe.equips',
        title: 'What gets worn',
        question: 'Which slots do people care about — and does anything get bought and never equipped?',
        columns: [
          { key: 'slot', label: 'Slot' },
          { key: 'rarity', label: 'Rarity' },
          { key: 'action', label: 'Action' },
          { key: 'events', label: 'Events', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
        ],
        rows: equipRows.map((row) => ({
          slot: String(row._id.slot),
          rarity: String(row._id.rarity),
          action: String(row._id.action),
          events: row.count,
          users: row.users,
        })),
      },
      {
        key: 'wardrobe.trades',
        title: 'Trade-ups',
        question: 'Is the duplicate sink working, and are aimed trades worth their fee?',
        columns: [
          { key: 'from', label: 'From' },
          { key: 'to', label: 'To' },
          { key: 'aimed', label: 'Aimed' },
          { key: 'trades', label: 'Trades', format: 'integer' },
          { key: 'users', label: 'Traders', format: 'integer' },
          { key: 'fuel', label: 'Items consumed', format: 'integer' },
          { key: 'aim_flies', label: 'Aim fees', format: 'integer' },
        ],
        rows: tradeRows.map((row) => ({
          from: String(row._id.fromRarity),
          to: String(row._id.toRarity),
          aimed: row._id.aimed === true ? 'Yes' : 'No',
          trades: row.count,
          users: row.users,
          fuel: row.fuel,
          aim_flies: row.aimFlies,
        })),
      },
      {
        key: 'wardrobe.discovery',
        title: 'Discovery surfaces',
        question: 'Do the shop rail, try-on, and looks actually move people to the shop?',
        columns: [
          { key: 'surface', label: 'Surface' },
          { key: 'events', label: 'Events', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
          { key: 'follow_through', label: 'Follow-through', format: 'percent' },
        ],
        rows: [
          {
            surface: 'Home shop rail',
            events: shopRailViews.events,
            users: shopRailViews.users,
            follow_through: rate(shopRailTaps.events, shopRailViews.events),
          },
          {
            surface: 'Try-on',
            events: context.events('tryon_shown'),
            users: context.users('tryon_shown'),
            follow_through: rate(context.events('tryon_kept'), context.events('tryon_shown')),
          },
          {
            surface: 'Saved looks',
            events: context.events('look_saved'),
            users: context.users('look_saved'),
            follow_through: rate(context.events('look_applied'), context.events('look_saved')),
          },
          {
            surface: 'Daily deals reroll',
            events: dealRows.reduce((sum, row) => sum + row.count, 0),
            users: dealRows.reduce((sum, row) => sum + row.users, 0),
            follow_through: rate(purchases.events, dealRows.reduce((sum, row) => sum + row.count, 0)),
          },
          {
            surface: 'Wishlist',
            events: wishlistPins.events,
            users: wishlistPins.users,
            follow_through: rate(wishlistReached.events, wishlistPins.events),
          },
        ],
        note: 'Follow-through is the next step in each surface: rail tap, try-on kept, look applied, wishlist reached.',
      },
      {
        key: 'wardrobe.tryon',
        title: 'Try-on by rarity',
        question: 'Which rarities tempt people enough to try them on?',
        columns: [
          { key: 'rarity', label: 'Rarity' },
          { key: 'events', label: 'Events', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
        ],
        rows: tryOnRows.map((row) => ({
          rarity: String(row._id.rarity),
          events: row.count,
          users: row.users,
        })),
      },
      {
        key: 'wardrobe.looks',
        title: 'Looks and reactions',
        question: 'Is anyone showing off their frog to friends?',
        columns: [
          { key: 'source', label: 'Source' },
          { key: 'events', label: 'Events', format: 'integer' },
          { key: 'users', label: 'Users', format: 'integer' },
        ],
        rows: lookRows.map((row) => ({
          source: String(row._id.source),
          events: row.count,
          users: row.users,
        })),
      },
    ],
  };
}
