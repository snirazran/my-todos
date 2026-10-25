import type { CampaignRewardGrant } from './types';

export type OfferProductKind = 'consumable' | 'non_consumable' | 'subscription';

export type OfferStore = 'app_store' | 'play_store' | 'paddle' | 'paddle_sandbox' | 'other';

export const OFFER_STORE_LABELS: Record<OfferStore, string> = {
  app_store: 'iOS',
  play_store: 'Android',
  paddle: 'Web',
  paddle_sandbox: 'Web test',
  other: 'Other',
};

export const OFFER_KIND_LABELS: Record<OfferProductKind, string> = {
  consumable: 'One-time purchase',
  non_consumable: 'Permanent unlock',
  subscription: 'Plus subscription',
};

export type OfferProductRow = {
  ref: string;
  label: string;
  source: 'shop' | 'registered';
  kind: OfferProductKind;
  priceHint: string;
  grants: CampaignRewardGrant[];
  offeringId: string;
  packageId: string;
  stores: OfferStore[];
  appleOfferId: string;
  googleOfferId: string;
  note: string;
  missing: boolean;
};

export type OfferCatalogPackage = {
  offeringId: string;
  offeringName: string;
  isCurrent: boolean;
  packageId: string;
  packageName: string;
  kind: OfferProductKind;
  stores: OfferStore[];
  inUse: boolean;
};

export type OfferProductsResponse = {
  products: OfferProductRow[];
  catalog: {
    configured: boolean;
    error?: string;
    fetchedAt: number;
    packages: OfferCatalogPackage[];
  };
};

export type OfferProductInput = {
  ref?: string;
  offeringId?: string;
  packageId?: string;
  label: string;
  kind?: OfferProductKind;
  priceHint?: string;
  grants: CampaignRewardGrant[];
  appleOfferId?: string;
  googleOfferId?: string;
  note?: string;
};

export function describeGrants(
  grants: CampaignRewardGrant[],
  names?: (grant: CampaignRewardGrant) => string | undefined,
): string {
  return grants
    .map((grant) => {
      if (grant.kind === 'flies') return `${grant.amount.toLocaleString()} flies`;
      if (grant.kind === 'plus_days') return `${grant.amount} Plus days`;
      const name = names?.(grant) ?? grant.id ?? grant.kind;
      return grant.amount > 1 ? `${grant.amount}× ${name}` : name;
    })
    .join(' + ');
}
