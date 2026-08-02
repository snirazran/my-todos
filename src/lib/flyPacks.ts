export const FLY_PACKS = [
  { id: 'pinch', packageId: 'flies_pinch', productId: 'io.frog.tasks.flies.pinch', paddlePriceIds: ['pri_01kz1gkq9arb4knq49kz478nzf'], amount: 200, priceUsd: 1.99 },
  { id: 'rare-jar', packageId: 'flies_rare_jar', productId: 'io.frog.tasks.flies.rare_jar', paddlePriceIds: ['pri_01kz1gkqsec0tfaxy9xf2qw00w'], amount: 650, priceUsd: 4.99 },
  { id: 'swarm', packageId: 'flies_swarm', productId: 'io.frog.tasks.flies.swarm', paddlePriceIds: ['pri_01kz1gkra5s3f7aanscxdttmg5'], amount: 1500, priceUsd: 9.99 },
  { id: 'epic-cloud', packageId: 'flies_epic_cloud', productId: 'io.frog.tasks.flies.epic_cloud', paddlePriceIds: ['pri_01kz1gkns0a8sbnf82g54py8f3'], amount: 3500, priceUsd: 19.99 },
  { id: 'mega-swarm', packageId: 'flies_mega_swarm', productId: 'io.frog.tasks.flies.mega_swarm', paddlePriceIds: ['pri_01kz1gkps0t4geg5ej46697afw'], amount: 10000, priceUsd: 49.99 },
  { id: 'legendary-vault', packageId: 'flies_legendary_vault', productId: 'io.frog.tasks.flies.legendary_vault', paddlePriceIds: ['pri_01kz1gkp98xn7nyxcmt5kpqjqj'], amount: 22000, priceUsd: 99.99 },
] as const;

export type FlyPackId = (typeof FLY_PACKS)[number]['id'];

export function getFlyPack(id: string) {
  return FLY_PACKS.find((pack) => pack.id === id);
}

export function getFlyPackForProduct(productId: string) {
  return FLY_PACKS.find(
    (pack) =>
      pack.productId === productId ||
      pack.packageId === productId ||
      pack.id === productId ||
      (pack.paddlePriceIds as readonly string[]).includes(productId),
  );
}
